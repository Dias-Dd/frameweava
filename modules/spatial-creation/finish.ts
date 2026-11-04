import {creationColor,type CreationColor} from './colors.ts';
import {EngineError} from '../../src/core/errors.ts';
import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createProfessionalFilters} from '../gpu-image-effects/resident/filters.ts';
import {createPaFilters} from '../native-effects/pa/filters.ts';
import type {CreationInit,AnimatedVec3} from './types.ts';

export type FinishPreset='clean'|'cinema'|'dream'|'neon'|'noir'|'warm'|'cool'|'pastel'|'poster'|'sepia';
export interface FinishGlow {radius?:Signal<number>;intensity?:Signal<number>;threshold?:Signal<number>}
export interface FinishTint {black?:CreationColor;white?:CreationColor;amount?:Signal<number>}
export interface FinishTritone {shadows?:CreationColor;midtones?:CreationColor;highlights?:CreationColor;amount?:Signal<number>}
/** Authored finish order is exposure → brightness/contrast → saturation → B&W
 * → tint → tritone → posterize → glow → vignette → grain. Use an array of
 * controls to change order. No image handles, recipes or ownership in this API. */
export interface FinishControls {
 preset?:FinishPreset;
 /** Static checkbox or Core numeric Signal: values >=.5 enable the plan. */
 enabled?:boolean|Signal<number>;
 exposure?:Signal<number>;brightness?:Signal<number>;contrast?:Signal<number>;contrastPivot?:Signal<number>;
 /** Existing hueSaturation offset: 0 unchanged, -1 grayscale, +.2 adds20%. */
 saturation?:Signal<number>;blackAndWhite?:Signal<number>;
 tint?:false|FinishTint;tritone?:false|FinishTritone;
 posterize?:false|{levels?:Signal<number>;amount?:Signal<number>};
 glow?:false|FinishGlow;vignette?:Signal<number>;grain?:Signal<number>;
 /** Omitted seed inherits FrameContext. Animated grain uses the actual local frame. */
 grainSeed?:number;animatedGrain?:boolean;
}
export type CreationFinish=false|FinishPreset|FinishControls|readonly (false|FinishPreset|FinishControls)[];
const presets:Record<FinishPreset,FinishControls>={
 clean:{},
 cinema:{exposure:.1,contrast:1.1,contrastPivot:.08,saturation:-.12,glow:{radius:3,intensity:.15,threshold:1},vignette:.18,grain:.0015},
 dream:{contrast:.94,saturation:-.1,glow:{radius:8,intensity:.55,threshold:.6},vignette:.1},
 neon:{contrast:1.12,saturation:.25,glow:{radius:4,intensity:.6,threshold:1.2}},
 noir:{blackAndWhite:1,contrast:1.3,vignette:.4,grain:.012},
 warm:{exposure:.08,tint:{white:[1.1,.95,.8],amount:.15}},
 cool:{exposure:.04,tint:{white:[.8,.95,1.1],amount:.15}},
 pastel:{contrast:.85,saturation:-.22,brightness:.04},
 poster:{contrast:1.1,saturation:.25,posterize:{levels:5,amount:1}},
 sepia:{tritone:{shadows:[.025,.015,.008],midtones:[.55,.32,.15],highlights:[1,.92,.72],amount:.7},contrast:1.05},
};
export function finishDefaults(name:FinishPreset):FinishControls{if(!Object.hasOwn(presets,name))fail('Unknown finish preset: '+String(name));return structuredClone(presets[name]);}
function fail(message:string):never{throw new EngineError('E_CREATION_FINISH',message);}
function plain(value:unknown,keys:readonly string[],name:string):asserts value is Record<string,unknown>{if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(name+' must be plain options');for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))fail(name+' has an unknown/accessor field: '+String(key));}}
/** Configuration only; no GPU or permission side effects. */
export function prepareFinish(value:CreationFinish|undefined):readonly FinishControls[]{
 if(value===undefined||value===false)return [];
 const list=Array.isArray(value)?value:[value];return list.map((entry,index)=>{
  if(typeof entry==='string')return {...finishDefaults(entry as FinishPreset),preset:entry as FinishPreset};
  if(entry===false)return {enabled:false};
  plain(entry,['preset','enabled','exposure','brightness','contrast','contrastPivot','saturation','blackAndWhite','tint','tritone','posterize','glow','vignette','grain','grainSeed','animatedGrain'],'finish['+index+']');
  for(const [name,keys]of [['glow',['radius','intensity','threshold']],['tint',['black','white','amount']],['tritone',['shadows','midtones','highlights','amount']],['posterize',['levels','amount']]] as const)if(entry[name]!==undefined&&entry[name]!==false)plain(entry[name],keys,name);
  if(entry.grainSeed!==undefined&&(!Number.isInteger(entry.grainSeed)||(entry.grainSeed as number)<0||(entry.grainSeed as number)>0xffffffff))fail('grainSeed must be uint32');
  if(entry.animatedGrain!==undefined&&typeof entry.animatedGrain!=='boolean')fail('animatedGrain must be boolean');
  let o:FinishControls;try{o=structuredClone(entry);}catch{fail('Finish values must be static values or serializable Core Signals');}
  const inherited=o.preset===undefined?{}:finishDefaults(o.preset);return {...inherited,...o,glow:o.glow===false?false:o.glow===undefined?inherited.glow:{...(inherited.glow||{}),...o.glow}};
 });
}
function number(v:Signal<number>|undefined,d:number,c:FrameContext,name:string,min=-Infinity,max=Infinity){const x=v===undefined?d:evaluate(v,c);if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail(name+' must evaluate in ['+min+', '+max+']');return x;}
/** Local lifecycle adapter over existing algorithms, NOT a second effect engine.
 * Input always borrowed; output is input or one caller-owned image. */
export function createCreationFinish(init:CreationInit,value:CreationFinish|undefined){
 const plans=prepareFinish(value),gpu=init.gpu;let closed=false,frames=0,operations=0;
 return {async apply(input:GpuPixelImage,c:FrameContext,signal?:AbortSignal){
  if(closed)throw new EngineError('E_CREATION_CLOSED','Finish disposed');if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Finish cancelled');
  return withGpuResources(gpu,async arena=>{
   const track=(image:GpuPixelImage)=>arena.image(image),fx=createProfessionalFilters(gpu,c,track,signal),pa=createPaFilters(gpu,c,track,signal);let image=input;
   for(const [index,o]of plans.entries())try{
    const enabled=o.enabled===undefined?true:typeof o.enabled==='boolean'?o.enabled:evaluate(o.enabled,c);if(typeof enabled!=='boolean'&&(typeof enabled!=='number'||!Number.isFinite(enabled)))fail('enabled must be boolean or a finite Core numeric Signal');if(typeof enabled==='boolean'?!enabled:enabled<.5)continue;
    const common={format:input.info.format,signal};
    if(o.exposure!==undefined){image=await fx.exposure(image,{...common,stops:o.exposure});operations++;}
    if(o.brightness!==undefined||o.contrast!==undefined){image=await fx.brightnessContrast(image,{...common,brightness:o.brightness,contrast:o.contrast,pivot:o.contrastPivot});operations++;}
    if(o.saturation!==undefined){image=await fx.hueSaturation(image,{...common,saturation:o.saturation});operations++;}
    if(o.blackAndWhite!==undefined){image=await fx.blackAndWhite(image,{...common,amount:o.blackAndWhite});operations++;}
    if(o.tint){image=await fx.tint(image,{...common,...o.tint,black:o.tint.black===undefined?undefined:creationColor(o.tint.black,c,'tint.black'),white:o.tint.white===undefined?undefined:creationColor(o.tint.white,c,'tint.white')});operations++;}
    if(o.tritone){image=await fx.tritone(image,{...common,...o.tritone,shadows:o.tritone.shadows===undefined?undefined:creationColor(o.tritone.shadows,c,'tritone.shadows'),midtones:o.tritone.midtones===undefined?undefined:creationColor(o.tritone.midtones,c,'tritone.midtones'),highlights:o.tritone.highlights===undefined?undefined:creationColor(o.tritone.highlights,c,'tritone.highlights')});operations++;}
    if(o.posterize){image=await fx.posterize(image,{...common,...o.posterize});operations++;}
    if(o.glow){const radius=number(o.glow.radius,4,c,'glow.radius',0,64),intensity=number(o.glow.intensity,.4,c,'glow.intensity',0,100),threshold=number(o.glow.threshold,1,c,'glow.threshold',0,1e6);
     // The existing low-level PA factory explicitly tracks its caller-owned
     // images. Reuse it directly; processImage's retained-result lifetime is
     // never guessed and this path needs no defensive GPU image copy.
     if(intensity>0){image=await pa.glow(image,{radius,intensity,threshold,format:input.info.format,alpha:'premultiplied',signal});operations++;}
    }
    if(o.vignette!==undefined){image=await fx.vignette(image,{...common,amount:o.vignette});operations++;}
    if(o.grain!==undefined){image=await fx.filmGrain(image,{...common,amount:o.grain,seed:o.grainSeed,animated:o.animatedGrain});operations++;}
   }catch(e){const error=e as {code?:string;message?:string};throw new EngineError(error.code??'E_CREATION_FINISH',error.message??String(e),{frame:c.frame,details:{finishIndex:index,preset:o.preset??null}});}
   if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Finish cancelled');frames++;return image===input?input:arena.keep(image);
  });
 },stats:()=>({closed,frames,operations,retainedCopies:0,plans:structuredClone(plans),completion:'recorded-only'}),async dispose(){closed=true;}};
}
