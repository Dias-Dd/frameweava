import type {NativeStageInit} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {createProfessionalFilters,type ProfessionalFilters} from '../../gpu-image-effects/resident/filters.ts';
import {nativeWorkingImage} from '../color.ts';
import {nativePixelInfo} from '../../native-gpu/image-info.ts';
import {controls,curve,fail,whiteBalanceMatrix,checkedLut} from './control.ts';
import {gradingKernel} from './kernels.ts';
import type * as T from './types.ts';
export {nativeGradingNames} from './types.ts';
export type NativeGradingRecipeFilters=T.NativeGradingFilters&ProfessionalFilters;
const split=(v:number)=>{const hi=Math.fround(v);return [hi,Math.fround(v-hi)];};
export function createNativeGradingEffects(init:Pick<NativeStageInit,'gpu'>){return createNativeRecipeProcessor<NativeGradingRecipeFilters>(init,(g,context,track,outerSignal)=>{
 const tableCache=new WeakMap<T.LutDefinition,GpuDataBuffer>(),curveCache=new Map<string,GpuDataBuffer>();let dummy:GpuDataBuffer|undefined;
 const setup=(name:string,o:T.GradeOutput,extra:readonly string[])=>{const p=controls(name,context,outerSignal);p.fields(o,extra);return p;};
 async function buffer(values:readonly number[]){const length=values.length*2,bytes=length*4,limits=g.capabilities().limits;if(!Number.isSafeInteger(length)||length<1||length>0xffffffff||bytes>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))fail('grading','table','storage fitting actual device limits and uint32 addressing','bytes');return g.createBuffer({type:'f32',length},Float32Array.from(values.flatMap(split)));}
 async function run(image:GpuPixelImage,mode:number,o:T.GradeOutput,values:readonly number[]=[],flags:readonly number[]=[],data?:GpuDataBuffer){const p=controls('grading',context,outerSignal);p.active(o.signal);const info=nativePixelInfo({...image.info,format:o.format??image.info.format,alpha:'premultiplied',color:o.workingColor??image.info.color},g.capabilities()),working=await nativeWorkingImage(g,image,info.color,o.signal??outerSignal),words=new Uint32Array(128),f=new Float32Array(words.buffer);words[0]=mode;flags.forEach((v,j)=>words[j+1]=v);f.set(values.flatMap(split),8);f.set(split(p.scalar(o.amount,1,'amount',0,1)),8+30*2);const m=gamutMatrix(info.color,linear709),weights=[0,1,2].map(j=>.2126390058715104*m[0][j]+.715168678767756*m[1][j]+.0721923153607337*m[2][j]);f.set(weights.flatMap(split),8+40*2);if(!data){dummy??=await buffer([0]);data=dummy;}return g.run(await g.compile(gradingKernel),[working],{output:info,parameters:words,data:[data],signal:o.signal??outerSignal});}
 async function lut(image:GpuPixelImage,table:T.LutDefinition,o:T.LutOptions,kind:'1d'|'3d'){const name=kind==='1d'?'lut1D':'lut3D',p=setup(name,o,['interpolation','domain']);checkedLut(table);if(table.kind!==kind)fail(name,'lut.kind',kind);const method=p.choice(o.interpolation,kind==='1d'?'linear':'tetrahedral',['nearest','linear','tetrahedral'],'interpolation');if(kind==='1d'&&method==='tetrahedral')fail(name,'interpolation','nearest | linear for a 1D table');const domain=p.choice(o.domain,'extend',['extend','clamp'],'domain');if(table.size>16777216)fail(name,'lut.size','lattice coordinate integer exactly representable in Float32');let data=tableCache.get(table);if(!data){data=await buffer(table.values);tableCache.set(table,data);}return run(image,kind==='1d'?0:1,o,[...table.domainMin,...table.domainMax],[['nearest','linear','tetrahedral'].indexOf(method),Number(domain==='clamp'),table.size,['linear','srgb','acescct'].indexOf(table.inputEncoding),['linear','srgb','acescct'].indexOf(table.outputEncoding)],data);}
 async function curved(image:GpuPixelImage,mode:number,o:T.CurveOptions,name:string,cyclic=false){setup(name,o,['points']);const values=curve(o.points,cyclic);if(mode===9&&o.points.some(p=>Math.abs(p[1])>36000))fail(name,'points.y','hue offset within the qualified +/-36000 degree argument-reduction domain','degrees');const key=JSON.stringify(values);let data=curveCache.get(key);if(!data){data=await buffer(values);curveCache.set(key,data);}return run(image,mode,o,[],[0,0,0,0,0,o.points.length],data);}
 const key:T.NativeGradingFilters={
  async lut1D(image,table,o={}){return lut(image,table,o,'1d');},
  async lut3D(image,table,o={}){return lut(image,table,o,'3d');},
  async cdl(image,o={}){const p=setup('cdl',o,['slope','offset','power','saturation','direction','style']),slope=p.triple(o.slope,[1,1,1],'slope',0),offset=p.triple(o.offset,[0,0,0],'offset'),power=p.triple(o.power,[1,1,1],'power',2**-126),saturation=p.scalar(o.saturation,1,'saturation',0),inverse=p.choice(o.direction,'forward',['forward','inverse'],'direction')==='inverse',clamp=p.choice(o.style,'no-clamp',['no-clamp','clamp'],'style')==='clamp';if(inverse&&(slope.some(v=>v===0)||saturation===0))fail('cdl','direction','nonzero slope and saturation for an invertible no-clamp transform');return run(image,2,o,[...slope,...offset,...power,saturation],[Number(inverse),Number(clamp)]);},
  async whiteBalance(image,o={}){setup('whiteBalance',o,['sourceWhite','targetWhite']);const white=(o.workingColor??image.info.color).whitePoint==='D60'?[.32168,.33767] as const:[.3127,.329] as const;return run(image,3,o,whiteBalanceMatrix(o.workingColor??image.info.color,o.sourceWhite===undefined?white:o.sourceWhite,o.targetWhite===undefined?white:o.targetWhite));},
  async liftGammaGain(image,o={}){const p=setup('liftGammaGain',o,['lift','gamma','gain']);return run(image,4,o,[...p.triple(o.lift,[0,0,0],'lift'),...p.triple(o.gamma,[1,1,1],'gamma',2**-126),...p.triple(o.gain,[1,1,1],'gain')]);},
  async printerLights(image,o={}){const p=setup('printerLights',o,['points','pointsPerStop']);return run(image,5,o,[...p.triple(o.points,[0,0,0],'points'),p.scalar(o.pointsPerStop,12,'pointsPerStop',2**-126)]);},
  async contrastPivot(image,o={}){const p=setup('contrastPivot',o,['contrast','pivot']);return run(image,6,o,[p.scalar(o.contrast,1,'contrast',2**-126),p.scalar(o.pivot,.18,'pivot',2**-126)]);},
  async logContrast(image,o={}){const p=setup('logContrast',o,['contrast','pivot','toe']);return run(image,7,o,[p.scalar(o.contrast,1,'contrast',2**-126),p.scalar(o.pivot,.18,'pivot',2**-126),p.scalar(o.toe,.01,'toe',2**-126)]);},
  async lumaCurve(image,o){return curved(image,8,o,'lumaCurve');},
  async hueVsHue(image,o){return curved(image,9,o,'hueVsHue',true);},
  async hueVsSaturation(image,o){return curved(image,10,o,'hueVsSaturation',true);},
  async hueVsLuminance(image,o){return curved(image,11,o,'hueVsLuminance',true);},
  async saturationVsSaturation(image,o){return curved(image,12,o,'saturationVsSaturation');},
  async luminanceVsSaturation(image,o){return curved(image,13,o,'luminanceVsSaturation');},
  async saturationVsLuminance(image,o){return curved(image,14,o,'saturationVsLuminance');},
  async colorWheels(image,o={}){const p=setup('colorWheels',o,['shadows','midtones','highlights','white']);return run(image,15,o,[...p.triple(o.shadows,[0,0,0],'shadows'),...p.triple(o.midtones,[0,0,0],'midtones'),...p.triple(o.highlights,[0,0,0],'highlights'),p.scalar(o.white,1,'white',2**-126)]);},
  async splitTone(image,o={}){const p=setup('splitTone',o,['shadows','highlights','balance','width']);return run(image,16,o,[...p.triple(o.shadows,[0,0,0],'shadows'),...p.triple(o.highlights,[0,0,0],'highlights'),p.scalar(o.balance,.18,'balance'),p.scalar(o.width,1,'width',2**-126)]);},
  async highlightRolloff(image,o={}){const p=setup('highlightRolloff',o,['threshold','softness']);return run(image,17,o,[p.scalar(o.threshold,1,'threshold'),p.scalar(o.softness,2,'softness',2**-126)]);},
  async shadowRolloff(image,o={}){const p=setup('shadowRolloff',o,['threshold','softness']);return run(image,18,o,[p.scalar(o.threshold,0,'threshold'),p.scalar(o.softness,.1,'softness',2**-126)]);},
  async gamutCompress(image,o={}){const p=setup('gamutCompress',o,['threshold','limit','power']),threshold=p.triple(o.threshold,[.8,.8,.8],'threshold',0),limit=p.triple(o.limit,[1.2,1.2,1.2],'limit',0);if(limit.some((x,i)=>x<=threshold[i]))fail('gamutCompress','limit','each component > threshold');return run(image,19,o,[...threshold,...limit,p.scalar(o.power,2,'power',2**-126)]);},
  async bleachBypass(image,o={}){const p=setup('bleachBypass',o,['saturation','pivot']);return run(image,20,o,[p.scalar(o.saturation,.25,'saturation',0),p.scalar(o.pivot,.5,'pivot',2**-126)]);},
 };
 return {...createProfessionalFilters(g,context,track,outerSignal),...key};
});}
