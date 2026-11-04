// SPDX-License-Identifier: Apache-2.0
import {evaluate} from '../../../../src/core/animation.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import {gamutMatrix} from '../../../../src/media/color.ts';
import {linear709} from '../../../../src/media/surface.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {transitionKernel,transitionNames,type TransitionName} from './kernels.ts';
import {hasExtendedControls,recordExtended} from './extended-controls.ts';
import {centerBackside} from './backside.ts';
import {recordCardMesh,usesCardMesh} from './card-mesh.ts';
import {recordTemporalGradient} from './temporal-gradient.ts';
import type * as T from './types.ts';
export type * from './types.ts';
export {transitionNames};

const fail=(message:string):never=>{throw new EngineError('E_PA_TRANSITION',message);};
function device(gpu:NativeGpuScope){const c=gpu?.capabilities();if(c?.backend!=='native-wgpu'||c.hardwareVerified!==true)throw new EngineError('E_PA_TRANSITION_DEVICE','An admitted native-wgpu Stage scope is required; no Web/CPU fallback');}
function scalar(v:Signal<number>|undefined,fallback:number,name:string,context?:FrameContext,min=-Infinity,max=Infinity){
 const raw=v??fallback;if(typeof raw!=='number'&&!context)fail(name+': a Signal requires FrameContext');
 const n=typeof raw==='number'?raw:evaluate(raw,context!);
 if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||!Number.isFinite(Math.fround(n)))fail(name+': finite value outside the declared range');
 if(n!==0&&Math.abs(Math.fround(n))<2**-126)fail(name+': subnormal/underflowed parameter is not qualified');return n;
}
const allowed:Record<TransitionName,readonly string[]>={
 crossDissolve:[],fadeThroughColor:['color'],directionalWipe:['softness','direction'],clockWipe:['softness','center','startAngleDegrees'],
 irisWipe:['softness','center'],diamondWipe:['softness','center'],boxWipe:['softness','center'],venetianWipe:['softness','count','axis'],
 checkerWipe:['softness','cells'],randomBlocksWipe:['softness','cells','seed'],orderedDissolve:['softness'],lumaWipe:['softness','range'],alphaWipe:['softness','range'],
 pushTransition:['direction'],slideTransition:['direction'],splitTransition:['axis'],zoomTransition:['strength','boundary'],rotateTransition:['turns','boundary'],
 rippleTransition:['amplitude','frequency','speed','boundary'],displacementTransition:['strength','range','boundary'],starWipe:['softness','center','points','innerRatio'],
 cardFlipWipe:['cells','axis','stagger','shading'],glassWipe:['softness','range','displacement','boundary'],
 gridWipe:['softness','center','cells','rotationDegrees','shape','reverse'],imageWipe:['softness','range','channel','invert'],
 jawsWipe:['center','teeth','amplitude','rotationDegrees','shape'],lightWipe:['color','softness','direction','intensity'],
 lineSweepWipe:['softness','strips','slant','flip'],radialScaleWipe:['center','reverse'],scaleWipe:['softness','direction','stretch'],
 twisterTransition:['center','rotationDegrees','shading'],warpTransition:['softness','range','amount','direction','boundary'],
};
type AnyOptions=T.TransitionOptions&Record<string,any>;
function words(name:TransitionName,o:AnyOptions,context?:FrameContext){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!['progress','format','signal',...allowed[name]].includes(k)))fail(name+': unknown options');
 if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('Output must remain RGBA16F/32F');
 if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))fail('Expected AbortSignal');
 if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Transition recording cancelled');
 const n=(v:Signal<number>|undefined,d:number,k:string,lo=-Infinity,hi=Infinity)=>scalar(v,d,k,context,lo,hi);
 if(o.progress===undefined&&!context)fail('progress or FrameContext is required');
 const p=n(o.progress,context?.progress??0,'progress',0,1),out=new Float32Array(32),u=new Uint32Array(out.buffer);
 out[0]=Math.fround(p);out[1]=p-out[0];out[2]=n(o.softness,.05,'softness',0,1);
 const center=o.center??[.5,.5];if(!Array.isArray(center)||center.length!==2)fail('center requires two normalized coordinates');
 out[4]=n(center[0],.5,'center.x');out[5]=n(center[1],.5,'center.y');
 out[3]=(n(o.startAngleDegrees,-90,'startAngleDegrees')%360)/360;
 if(['gridWipe','jawsWipe','twisterTransition'].includes(name))out[3]=(n(o.rotationDegrees,0,'rotationDegrees')%360)*Math.PI/180;
 const integer=(v:unknown,d:number,k:string,lo=1):number=>{const x=v??d;if(typeof x!=='number'||!Number.isSafeInteger(x)||x<lo||x>0xffffffff)fail(k+': exact uint32 required');return x as number;};
 const cells=o.cells??[8,6];if(!Array.isArray(cells)||cells.length!==2)fail('cells requires two counts');
 u[6]=integer(o.count??o.points??o.teeth??cells[0],8,'count');u[7]=integer(o.strips??cells[1],6,'rows');u[12]=integer(o.seed,0,'seed',0);
 // Cell/vertex phase uses F32: reject loss of integer resolution rather than imposing an arbitrary artistic cap.
 if(u[6]>2**24||u[7]>2**24)fail('Cell/point count exceeds exact Float32 phase resolution');
 if(o.axis!==undefined&&!['x','y'].includes(o.axis))fail('axis must be x or y');u[11]=Number(o.axis==='y');
 if(o.boundary!==undefined&&!['clamp','transparent'].includes(o.boundary))fail('Unknown sampling boundary');u[13]=Number(o.boundary!=='transparent'&&!['pushTransition','slideTransition','splitTransition'].includes(name));
 out[8]=name==='rotateTransition'?n(o.turns,.5,'turns'):name==='rippleTransition'?n(o.amplitude,24,'amplitude'):name==='starWipe'?n(o.innerRatio,.45,'innerRatio',2**-20,1):n(o.strength,name==='displacementTransition'?24:2,'strength',0);
 if(name==='glassWipe')out[8]=n(o.displacement,20,'displacement');
 if(name==='jawsWipe')out[8]=n(o.amplitude,10,'amplitude',0);
 if(name==='lightWipe')out[8]=n(o.intensity,2,'intensity',0);
 if(name==='lineSweepWipe')out[8]=n(o.slant,1,'slant');
 if(name==='scaleWipe')out[8]=n(o.stretch,8,'stretch',0);
 if(name==='warpTransition')out[8]=n(o.amount,40,'amount');
 out[9]=n(o.frequency,3,'frequency',0);out[10]=n(o.speed,1,'speed');
 if(name==='starWipe'&&u[6]<3)fail('starWipe requires at least three points');
 const c=o.color??(name==='lightWipe'?[1,1,1,1]:[0,0,0,1]);if(!Array.isArray(c)||c.length!==4)fail('color requires straight linear RGBA');
 const a=n(c[3],1,'color.alpha',0,1);for(let i=0;i<3;i++)out[16+i]=n(c[i],0,'color.rgb')*a;out[19]=a;
 const range=o.range??[0,1];if(!Array.isArray(range)||range.length!==2)fail('range requires two ordered scalar values');
 out[20]=n(range[0],0,'range.low');out[21]=n(range[1],1,'range.high');if(out[21]<=out[20]||!Number.isFinite(Math.fround(out[21]-out[20])))fail('range must remain ordered and finite after F32 conversion');
 out[28]=n(o.stagger,.75,'stagger',0);out[29]=n(typeof o.shading==='boolean'?(o.shading ? .6 : 0):o.shading,.4,'shading',0,1);u[27]=4;
 const flag=(v:unknown,k:string)=>{if(v!==undefined&&typeof v!=='boolean')fail(k+': boolean required');return Number(v===true);};
 if(name==='imageWipe'){const channels=['red','green','blue','alpha','luma','lightness','hue','saturation'];if(o.channel!==undefined&&!channels.includes(o.channel))fail('Unknown image mask channel');u[27]=channels.indexOf(o.channel??'luma');u[31]=flag(o.invert,'invert');}
 if(name==='gridWipe'){const shapes=['doors','radial','rectangle'];if(o.shape!==undefined&&!shapes.includes(o.shape))fail('Unknown grid shape');u[30]=shapes.indexOf(o.shape??'radial');u[31]=flag(o.reverse,'reverse');}
 if(name==='jawsWipe'){const shapes=['triangle','rounded','square','sine'];if(o.shape!==undefined&&!shapes.includes(o.shape))fail('Unknown tooth shape');u[30]=shapes.indexOf(o.shape??'triangle');}
 if(name==='radialScaleWipe')u[31]=flag(o.reverse,'reverse');if(name==='lineSweepWipe')u[31]=flag(o.flip,'flip');
 if(name==='warpTransition'){const dirs=['same','opposite','perpendicular'];if(o.direction!==undefined&&!dirs.includes(o.direction))fail('Unknown warp direction');u[30]=dirs.indexOf(o.direction??'opposite');}
 let d:readonly number[]=[1,0];if(['directionalWipe','lightWipe','scaleWipe'].includes(name))d=o.direction??[1,0];
 else if(['pushTransition','slideTransition'].includes(name)){const dirs={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};if(o.direction!==undefined&&!Object.hasOwn(dirs,o.direction))fail('Unknown movement direction');d=dirs[(o.direction??'left') as keyof typeof dirs];}
 if(!Array.isArray(d)||d.length!==2||d.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail('direction requires two finite numbers');
 const scale=Math.max(Math.abs(d[0]),Math.abs(d[1]));if(scale===0)fail('direction must be nonzero');const norm=Math.abs(d[0]/scale)+Math.abs(d[1]/scale);out[25]=d[0]/scale/norm;out[26]=d[1]/scale/norm;
 return out;
}
async function record(name:TransitionName,scope:T.NativeTransitionScope,from:GpuPixelImage,to:GpuPixelImage,o:T.TransitionOptions,context?:FrameContext,mask?:GpuPixelImage):Promise<GpuPixelImage>{
 const {gpu,blurMask}=scope&&typeof scope==='object'&&'gpu' in scope?scope:{gpu:scope as NativeGpuScope};
 if(name==='imageWipe'&&o&&Object.hasOwn(o,'gradientAt')){
  device(gpu);return recordTemporalGradient(gpu,from,to,mask!,o as T.ImageWipeOptions,context,(a,b,m,p,c)=>record('imageWipe',scope,a,b,p,c,m),(a,b,p)=>record('crossDissolve',scope,a,b,p));
 }
 if(name==='cardFlipWipe'&&usesCardMesh(o)){
  const fields=Object.keys(o);if((o as T.CardFlipOptions).geometry==='orthographic'&&!fields.some(k=>['camera','lighting','material','positionJitter','rotationJitter','flipDirection','time','backside','rows','columns','outputSize'].includes(k))){const {geometry:_geometry,...rest}=o as T.CardFlipOptions;return record(name,scope,from,to,rest,context);}
  return recordCardMesh(gpu,from,to,o as T.CardFlipOptions,context,'gpu' in scope?scope:undefined);
 }
 if(hasExtendedControls(name,o)||mask?.info&&from?.info&&(mask.info.width!==from.info.width||mask.info.height!==from.info.height)&&['lumaWipe','alphaWipe','imageWipe','glassWipe','warpTransition'].includes(name))return recordExtended(name,gpu,from,to,o,context,mask,blurMask);
 device(gpu);const params=words(name,o,context);let inputs=mask?[from,to,mask]:[from,to];if(!from?.info)fail('A native source image is required');
 for(const [index,image] of inputs.entries()){const m=image?.info;if(!m||!['rgba16float','rgba32float'].includes(m.format)||m.color.transfer!=='linear'||m.color.reference!=='scene'||(name!=='twisterTransition'||index!==1)&&(m.width!==from.info.width||m.height!==from.info.height))fail('Same-size scene-linear professional native images required');
  const a=m.color,b=from.info.color;if(Object.keys(a).some(k=>a[k as keyof typeof a]!==b[k as keyof typeof b])||Object.keys(b).some(k=>a[k as keyof typeof a]!==b[k as keyof typeof b]))fail('Image encodings must match; convert explicitly');}
 if(name==='twisterTransition'){
  // Uniform geometry preparation, not CPU pixels/inference. Pair coefficients
  // keep the inverse near edge-on from magnifying ordinary F32 trig error.
  const split=(v:number,hi:number,lo:number)=>{params[hi]=Math.fround(v);params[lo]=v-params[hi];};
  split(Math.hypot(from.info.width,from.info.height)*.5,6,7);split(Math.cos(params[3]),9,14);split(Math.sin(params[3]),10,15);
 }
 if(mask){const m=gamutMatrix(mask.info.color,linear709);for(let c=0;c<3;c++)params[22+c]=.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c];}
 let fitted:GpuPixelImage|undefined;
 try{
  if(name==='twisterTransition'&&(to.info.width!==from.info.width||to.info.height!==from.info.height)){fitted=await centerBackside(gpu,to,from.info.width,from.info.height,o.signal);inputs=[from,fitted];}
  const kernel=await gpu.compile(transitionKernel(name));if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Transition recording cancelled');
  return await gpu.run(kernel,inputs,{parameters:params,output:{format:o.format??from.info.format,alpha:'premultiplied'},signal:o.signal});
 }finally{if(fitted)await gpu.release(fitted);}
}

export const crossDissolve:T.TransitionFunction=(g,a,b,o={},c)=>record('crossDissolve',g,a,b,o,c);
export const fadeThroughColor:T.TransitionFunction<T.ColorTransitionOptions>=(g,a,b,o={},c)=>record('fadeThroughColor',g,a,b,o,c);
export const directionalWipe:T.TransitionFunction<T.DirectionalWipeOptions>=(g,a,b,o={},c)=>record('directionalWipe',g,a,b,o,c);
export const clockWipe:T.TransitionFunction<T.ClockWipeOptions>=(g,a,b,o={},c)=>record('clockWipe',g,a,b,o,c);
export const irisWipe:T.TransitionFunction<T.IrisWipeOptions>=(g,a,b,o={},c)=>record('irisWipe',g,a,b,o,c);
export const diamondWipe:T.TransitionFunction<T.CenterTransitionOptions>=(g,a,b,o={},c)=>record('diamondWipe',g,a,b,o,c);
export const boxWipe:T.TransitionFunction<T.CenterTransitionOptions>=(g,a,b,o={},c)=>record('boxWipe',g,a,b,o,c);
export const venetianWipe:T.TransitionFunction<T.VenetianWipeOptions>=(g,a,b,o={},c)=>record('venetianWipe',g,a,b,o,c);
export const checkerWipe:T.TransitionFunction<T.GridTransitionOptions>=(g,a,b,o={},c)=>record('checkerWipe',g,a,b,o,c);
export const randomBlocksWipe:T.TransitionFunction<T.RandomBlocksOptions>=(g,a,b,o={},c)=>record('randomBlocksWipe',g,a,b,o,c);
export const orderedDissolve:T.TransitionFunction<T.SoftTransitionOptions>=(g,a,b,o={},c)=>record('orderedDissolve',g,a,b,o,c);
export const lumaWipe:T.MaskTransitionFunction=(g,a,b,m,o={},c)=>record('lumaWipe',g,a,b,o,c,m);
export const alphaWipe:T.MaskTransitionFunction=(g,a,b,m,o={},c)=>record('alphaWipe',g,a,b,o,c,m);
export const pushTransition:T.TransitionFunction<T.MoveTransitionOptions>=(g,a,b,o={},c)=>record('pushTransition',g,a,b,o,c);
export const slideTransition:T.TransitionFunction<T.MoveTransitionOptions>=(g,a,b,o={},c)=>record('slideTransition',g,a,b,o,c);
export const splitTransition:T.TransitionFunction<T.SplitTransitionOptions>=(g,a,b,o={},c)=>record('splitTransition',g,a,b,o,c);
export const zoomTransition:T.TransitionFunction<T.ZoomTransitionOptions>=(g,a,b,o={},c)=>record('zoomTransition',g,a,b,o,c);
export const rotateTransition:T.TransitionFunction<T.RotateTransitionOptions>=(g,a,b,o={},c)=>record('rotateTransition',g,a,b,o,c);
export const rippleTransition:T.TransitionFunction<T.RippleTransitionOptions>=(g,a,b,o={},c)=>record('rippleTransition',g,a,b,o,c);
export const displacementTransition:T.MaskTransitionFunction<T.DisplacementTransitionOptions>=(g,a,b,m,o={},c)=>record('displacementTransition',g,a,b,o,c,m);
export const starWipe:T.TransitionFunction<T.StarWipeOptions>=(g,a,b,o={},c)=>record('starWipe',g,a,b,o,c);
export const cardFlipWipe:T.TransitionFunction<T.CardFlipOptions>=(g,a,b,o={},c)=>record('cardFlipWipe',g,a,b,o,c);
export const glassWipe:T.MaskTransitionFunction<T.GlassWipeOptions>=(g,a,b,m,o={},c)=>record('glassWipe',g,a,b,o,c,m);
export const gridWipe:T.TransitionFunction<T.GridWipeOptions>=(g,a,b,o={},c)=>record('gridWipe',g,a,b,o,c);
export const imageWipe:T.MaskTransitionFunction<T.ImageWipeOptions>=(g,a,b,m,o={},c)=>record('imageWipe',g,a,b,o,c,m);
export const jawsWipe:T.TransitionFunction<T.JawsWipeOptions>=(g,a,b,o={},c)=>record('jawsWipe',g,a,b,o,c);
export const lightWipe:T.TransitionFunction<T.LightWipeOptions>=(g,a,b,o={},c)=>record('lightWipe',g,a,b,o,c);
export const lineSweepWipe:T.TransitionFunction<T.LineSweepOptions>=(g,a,b,o={},c)=>record('lineSweepWipe',g,a,b,o,c);
export const radialScaleWipe:T.TransitionFunction<T.RadialScaleWipeOptions>=(g,a,b,o={},c)=>record('radialScaleWipe',g,a,b,o,c);
export const scaleWipe:T.TransitionFunction<T.ScaleWipeOptions>=(g,a,b,o={},c)=>record('scaleWipe',g,a,b,o,c);
export const twisterTransition:T.TransitionFunction<T.TwisterOptions>=(g,a,b,o={},c)=>record('twisterTransition',g,a,b,o,c);
export function warpTransition(g:T.NativeTransitionScope,a:GpuPixelImage,b:GpuPixelImage,options?:T.WarpTransitionOptions,context?:FrameContext):Promise<GpuPixelImage>;
export function warpTransition(g:T.NativeTransitionScope,a:GpuPixelImage,b:GpuPixelImage,mask:GpuPixelImage,options?:T.WarpTransitionOptions,context?:FrameContext):Promise<GpuPixelImage>;
export function warpTransition(g:T.NativeTransitionScope,a:GpuPixelImage,b:GpuPixelImage,maskOrOptions:GpuPixelImage|T.WarpTransitionOptions={},optionsOrContext:T.WarpTransitionOptions|FrameContext={},context?:FrameContext):Promise<GpuPixelImage>{
 if('info' in maskOrOptions)return record('warpTransition',g,a,b,optionsOrContext as T.WarpTransitionOptions,context,maskOrOptions);
 const options:T.WarpTransitionOptions={...maskOrOptions,reactorSource:maskOrOptions.reactorSource??'sources'};
 return record('warpTransition',g,a,b,options,'frame' in optionsOrContext?optionsOrContext as FrameContext:undefined);
}

/** Convenience binding only. Owns no GPU/queue/state; outputs belong to the caller.
 * Completion is the existing Renderer frame ticket, not recording resolution. */
export function createNativeTransitions(environment:T.NativeTransitionEnvironment){
 const {gpu}=environment;
 device(gpu);return {
  crossDissolve:crossDissolve.bind(null,environment),fadeThroughColor:fadeThroughColor.bind(null,environment),directionalWipe:directionalWipe.bind(null,environment),clockWipe:clockWipe.bind(null,environment),
  irisWipe:irisWipe.bind(null,environment),diamondWipe:diamondWipe.bind(null,environment),boxWipe:boxWipe.bind(null,environment),venetianWipe:venetianWipe.bind(null,environment),checkerWipe:checkerWipe.bind(null,environment),
  randomBlocksWipe:randomBlocksWipe.bind(null,environment),orderedDissolve:orderedDissolve.bind(null,environment),lumaWipe:lumaWipe.bind(null,environment),alphaWipe:alphaWipe.bind(null,environment),
  pushTransition:pushTransition.bind(null,environment),slideTransition:slideTransition.bind(null,environment),splitTransition:splitTransition.bind(null,environment),zoomTransition:zoomTransition.bind(null,environment),
  rotateTransition:rotateTransition.bind(null,environment),rippleTransition:rippleTransition.bind(null,environment),displacementTransition:displacementTransition.bind(null,environment),starWipe:starWipe.bind(null,environment),
  cardFlipWipe:cardFlipWipe.bind(null,environment),glassWipe:glassWipe.bind(null,environment),gridWipe:gridWipe.bind(null,environment),imageWipe:imageWipe.bind(null,environment),jawsWipe:jawsWipe.bind(null,environment),
  lightWipe:lightWipe.bind(null,environment),lineSweepWipe:lineSweepWipe.bind(null,environment),radialScaleWipe:radialScaleWipe.bind(null,environment),scaleWipe:scaleWipe.bind(null,environment),twisterTransition:twisterTransition.bind(null,environment),warpTransition:warpTransition.bind(null,environment) as T.BoundWarpTransition,
 };
}
