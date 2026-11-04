import {EngineError} from '../../../src/core/errors.ts';
import {acescg,linear709,type AlphaMode} from '../../../src/media/surface.ts';
import {defineNativeStage,type NativeGpuScope,type NativeStageInit} from '../../native-gpu/authoring.ts';
import {borrowNativeScope} from '../../native-gpu/borrow.ts';
import type {GpuPixelImage,GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {createNativeProfessionalEffects} from '../extended.ts';
import {createNativeRasterEffects,nativeRasterEffectNames,type NativeRasterFilters} from '../raster/filters.ts';
import {createNativePaImageEffects,nativePaImageNames,type NativePaImageFilters} from '../pa/filters.ts';
import {coverageValues,ink,displacementOptions,shadowOptions} from '../pa/cases.ts';
import {mapKernel} from '../pa/stage.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {keyframes} from '../../../src/core/animation.ts';

export const sourceColor={...acescg,referenceWhiteNits:203};
export const statisticNames=['autoLevels','autoContrast','autoColor','equalize'] as const;
export const statisticOptions=[{outputBlack:-.1,outputWhite:2,amount:.7},{outputBlack:-.1,outputWhite:2,amount:.7},{amount:.6},{bins:17,outputBlack:-.2,outputWhite:2,amount:.4}] as const;
export const seed:GpuPixelKernelSourceV1={abiVersion:1,id:'fixture/native-color-seed',version:'1.0.0',inputCount:0,parameterWords:4,code:`
fn pixel(p:vec2u)->vec4f{let q=(p.x+3u*p.y)%7u;var a=select(f32(q)/6.,1.,paramU32(0u)==2u);if(paramU32(2u)==1u){a=0.;}if(paramU32(2u)==2u){a=1.;}
var rgb=vec3f(1.125+f32(p.x%5u)*.125,-.25+f32(p.y%4u)*.0625,.25+f32((p.x+p.y)%3u)*.125);if(paramU32(2u)==2u){rgb=vec3f(.5,.25,.125);}
if(paramU32(3u)!=0u){rgb*=select(100000.,-100000.,p.x%2u==0u);}
rgb+=f32(paramU32(1u)%13u)*.0005;if(paramU32(0u)==0u){rgb*=a;}return vec4f(rgb,a);}`};
async function publish(g:NativeGpuScope,name:string,image:GpuPixelImage){const view=await g.imageToBuffer!(image,{version:1});await g.publishBuffer(name,view,{version:1});await g.releaseBuffer(view);}

// Same original calls/parameters as the frozen numerical fixtures, with one
// explicit workingColor boundary. Utility gain channels already have target
// metadata and must not be transformed as display RGB.
export function rasterColorCall(name:keyof NativeRasterFilters,f:NativeRasterFilters,a:GpuPixelImage,b:GpuPixelImage){const o={workingColor:linear709};switch(name){
 case 'blur':return f.blur(a,{...o,radius:.7,boundary:'transparent'});
 case 'glow':return f.glow(a,{...o,radius:.8,threshold:.4,intensity:1.3,boundary:'clamp'});
 case 'feather':return f.feather(a,{...o,radius:.7,boundary:'clamp'});
 case 'fill':return f.fill(a,{...o,color:[3,-.5,.75],opacity:.71300000001});
 case 'applyMatte':return f.applyMatte(a,b,{...o,opacity:.71300000001});
 case 'dropShadow':return f.dropShadow(a,{...o,color:[2,-.25,.5],opacity:.71300000001,radius:.7,offset:[-1.25,1.75]});
 case 'reframe':return f.reframe(a,{...o,x:-2,y:1,flipX:true,flipY:true});
 case 'mergeMatte':return f.mergeMatte(a,b,o);
 case 'alphaToRGB':return f.alphaToRGB(a,{...o,color:[3,-.5,.75]});
 case 'flattenBlack':return f.flattenBlack(a,o);
 case 'tile':return f.tile(a,{...o,offset:[Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER],mode:'mirror'});
 case 'exposure':return f.exposure(a,{...o,stops:.7});
 case 'invert':return f.invert(a,o);
 case 'add':return f.add(a,b,o);
 case 'invertMatte':return f.invertMatte(a,o);
 case 'replaceMatte':return f.replaceMatte(a,b,o);
 case 'modulate':return f.modulate(a,b,o);
 case 'over':return f.over(a,b,{...o,opacity:.71300000001});
 case 'screen':return f.screen(a,b,{...o,opacity:.71300000001});
 case 'multiply':return f.multiply(a,b,{...o,opacity:.71300000001});
 case 'offsetRGB':return f.offsetRGB(a,{...o,offset:[.37,-.25,1.125]});
 case 'subtractMatte':return f.subtractMatte(a,b,o);
 case 'crossfade':return f.crossfade(a,b,{...o,mix:.71300000001});
}}
export function paColorCall(name:keyof NativePaImageFilters,f:NativePaImageFilters,a:GpuPixelImage,b:GpuPixelImage,c:FrameContext){const o={workingColor:linear709};switch(name){
 case 'blur':return f.blur(a,{...o,radius:.7,boundary:'transparent'});
 case 'glow':return f.glow(a,{...o,radius:.8,intensity:1.3,threshold:.4,boundary:'clamp'});
 case 'displacement':return f.displacement(a,{...displacementOptions(c),...o});
 case 'displaceWithMap':return f.displaceWithMap(a,b,{...o,encoding:'rg-offset-px',scale:-.71300000001,boundary:'transparent'});
 case 'surfaceFromCoverage':return f.surfaceFromCoverage(coverageValues(a.info.width,a.info.height),{...o,width:a.info.width,height:a.info.height,ink,format:a.info.format});
 case 'innerShadow':return f.innerShadow(a,{...shadowOptions,...o});
}}
interface Props {mode?:'all'|'statistics'|'raster'|'pa'|'chain';alpha?:AlphaMode;format?:'rgba16float'|'rgba32float';pattern?:number;wide?:boolean;only?:number;reference?:boolean;checks?:boolean}
async function instance(init:NativeStageInit,borrowed=false){const g=init.gpu,loan=borrowed?borrowNativeScope(g):undefined,owner=loan?.scope??g,professional=createNativeProfessionalEffects({gpu:owner}),raster=createNativeRasterEffects({gpu:owner}),pa=createNativePaImageEffects({gpu:owner});let failed=false;
 return {async renderAt(c:FrameContext,_i:Record<string,never>,p:Props){const alpha=p.alpha??'premultiplied',format=p.format??'rgba32float',a=await g.run(await g.compile(seed),[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,c.globalFrame,p.pattern??0,Number(p.wide)),output:{width:init.width,height:init.height,alpha,format,color:sourceColor}});
  if(p.checks){
   if(c.globalFrame===0&&!failed){failed=true;return professional.processImage(a,async(i,f)=>{await f.autoLevels(i);throw new EngineError('E_NATIVE_COLOR_FIXTURE','Failure after statistics recording');});}
   const before=g.stats().runs;
   await professional.processImage(a,async(i,f)=>{for(const [request,code]of [[()=>f.equalize(i,{bins:1}),'E_GPU_IMAGE_PARAMETER'],[()=>f.autoColor(i,{amount:2}),'E_GPU_IMAGE_PARAMETER'],[()=>f.autoLevels(i,{signal:AbortSignal.abort()}),'E_RENDER_CANCELLED']] as const){try{await request();throw Error('Accepted invalid '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;}}return i;});
   await raster.processImage(a,async(i,f)=>{for(const [request,code]of [[()=>f.modulate(i,a,{workingColor:linear709}),'E_GPU_IMAGE_COLOR'],[()=>f.exposure(i,{workingColor:{...linear709,transfer:'srgb'}}),'E_GPU_IMAGE_COLOR'],[()=>f.exposure(i,{workingColor:linear709,signal:AbortSignal.abort()}),'E_RENDER_CANCELLED']] as const){try{await request();throw Error('Accepted invalid '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;}}return i;});
   if(g.stats().runs!==before)throw Error('Rejected request recorded GPU work');
  }
  const block=(p.only??c.globalFrame)%33,mode=p.mode==='all'?block<4?'statistics':block<27?'raster':'pa':p.mode;
  let result:GpuPixelImage;
  if(mode==='raster'){const index=p.mode==='all'?block-4:(p.only??c.globalFrame)%nativeRasterEffectNames.length,name=nativeRasterEffectNames[index],b=await g.run(await g.compile(seed),[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,0,0,0),output:{...a.info,color:name==='modulate'?linear709:sourceColor}});result=await raster.processImage(a,(i,f)=>rasterColorCall(name,f,i,b),{context:c});if(p.reference)await publish(g,'sourceB',b);}
  else if(mode==='pa'){const name=nativePaImageNames[p.mode==='all'?block-27:(p.only??c.globalFrame)%6],b=await g.run(await g.compile(mapKernel),[],{output:{...a.info,alpha:'opaque',color:linear709}});result=await pa.processImage(a,(i,f)=>paColorCall(name,f,i,b,c),{context:c});if(p.reference)await publish(g,'sourceB',b);}
  else if(mode==='chain'){
   const converted=await raster.processImage(a,(i,f)=>f.exposure(i,{stops:keyframes([{frame:0,value:0},{frame:119,value:.3},{frame:239,value:.1}]),workingColor:linear709,format}),{context:c});
   result=await professional.processImage(converted,async(i,f)=>{i=await f.autoColor(i,{amount:.3,format});i=await f.autoContrast(i,{amount:.25,outputBlack:-.2,outputWhite:2,format});i=await f.equalize(i,{bins:17,amount:.2,outputBlack:-.2,outputWhite:2,format});i=await f.autoLevels(i,{amount:.2,outputBlack:-.1,outputWhite:2,format});return f.channelMix(i,{matrix:[[1,.02,0],[0,1,0],[0,0,1]],format});},{context:c});
  }else{const index=(p.only??c.globalFrame)%4;result=await professional.processImage(a,(i,f)=>index===0?f.autoLevels(i,statisticOptions[0]):index===1?f.autoContrast(i,statisticOptions[1]):index===2?f.autoColor(i,statisticOptions[2]):f.equalize(i,statisticOptions[3]),{context:c});}
  for(const effects of [professional,raster,pa]){const stats=effects.stats();if(stats.createdDataBuffers!==stats.releasedDataBuffers)throw Error('Native colour data lease leaked');}
  if(p.reference){await publish(g,'sourceA',a);await publish(g,'result',result);}
  // A Native Stage publishes its explicit final working encoding for placement.
  // Extra conversion here is presentation only; numerical reference is above.
  if(mode!=='statistics'&&mode!==undefined)return result;
  return g.convertColor(result,{version:1,color:linear709,format});
 },async dispose(){await professional.dispose();await raster.dispose();await pa.dispose();await loan?.dispose();await loan?.dispose();}};
}
export const colorStage=defineNativeStage<Record<string,never>,Props>(init=>instance(init));
export const colorBorrowedStage=defineNativeStage<Record<string,never>,Props>(init=>instance(init,true));
