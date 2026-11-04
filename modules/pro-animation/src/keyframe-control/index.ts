// SPDX-License-Identifier: Apache-2.0 AND MIT
// Keyframe editing/queries over existing Core evaluation. No Signal variant, timeline, queue or renderer.
import {EngineError} from '../../../../src/core/errors.ts';
import {keyframes,keyframesAt,validateKeyframes,evaluate} from '../../../../src/core/animation.ts';
import {rational} from '../../../../src/core/time.ts';
import type {Keyframes,Keyframe,Easing,Signal,FrameContext} from '../../../../src/core/types.ts';
import {createSpeedRamp,remapTime} from '../time-controls.ts';
import {sourceTimeContext} from '../native-time/plans.ts';
import {sampleMotion2D,type MotionSamplingOptions} from '../motion-control/sampling.ts';
import {cubicPoint,type Cubic} from '../geometry.ts';
export type NumericKeys=Keyframes<number>;
export type LoopMode='hold'|'cycle'|'ping-pong'|'offset'|'continue';
export interface KeyLoopOptions {before?:LoopMode;after?:LoopMode;segments?:number}
export type KeyCrossing={kind:'point';frame:number;residual:number;segment:number;status:'resolved'|'resolution-limit'}|{kind:'interval';start:number;end:number;endInclusive:boolean;residual:number;segment:number}|{kind:'jump';frame:number;before:number;after:number;segment:number};
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_KEYFRAME_CONTROL',message,{details});};
const finite=(v:number,name:string)=>{if(typeof v!=='number'||!Number.isFinite(v))fail(name+' must be finite');return v;};
const frozen=<T>(value:T):T=>{if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;};
function source(value:NumericKeys):NumericKeys {if(!value||!Array.isArray(value.$keyframes))fail('Existing Core numeric Keyframes required');validateKeyframes(value.$keyframes);if(value.$keyframes.some(k=>typeof k.value!=='number'))fail('Numeric keys required; no string/color interpolation substitution');return frozen(structuredClone(value));}
function at(track:NumericKeys,frame:number){return finite(keyframesAt(track,finite(frame,'frame')) as number,'Core keyframe value');}
function index(n:number,length:number){if(!Number.isSafeInteger(n)||n<0||n>=length)fail('Key index outside existing track');return n;}
function output(keys:Keyframe<number>[]):NumericKeys{return frozen(keyframes(keys));}
function easedReverse(e:Easing|undefined):Easing|undefined {if(e==='easeIn')return 'easeOut';if(e==='easeOut')return 'easeIn';if(e&&typeof e==='object'){const [x1,y1,x2,y2]=e.bezier;return {bezier:[1-x2,1-y2,1-x1,1-y1]};}return e;}
/** Stationary x fractions only. Actual values always come from original Core keyframesAt. */
function stations(e:Easing|undefined):number[]{
 if(!e||typeof e!=='object')return [];const [x1,y1,x2,y2]=e.bezier,a=finite(1+3*(y1-y2),'Bezier derivative'),b=finite(2*(y2-2*y1),'Bezier derivative'),c=y1,scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c));let roots:number[]=[];
 if(scale===0)return [];const A=a/scale,B=b/scale,C=c/scale;if(A===0){if(B!==0)roots=[-C/B];}else{const d=B*B-4*A*C;if(d>=0){const q=-.5*(B+(B<0?-1:1)*Math.sqrt(d));roots=q===0?[-B/(2*A)]:[q/A,C/q];}}
 const curve:Cubic=[[0,0],[x1,y1],[x2,y2],[1,1]];return [...new Set(roots.filter(t=>t>0&&t<1).map(t=>finite(cubicPoint(curve,t)[0],'stationary fraction')).filter(x=>x>0&&x<1))].sort((a,b)=>a-b);
}
function endSlope(e:Easing|undefined,end:boolean){
 if(!e||e==='linear')return 1;if(e==='step')return 0;if(e==='easeIn')return end?2:0;if(e==='easeOut')return end?0:2;if(e==='easeInOut')return 0;
 const r=end?easedReverse(e) as {bezier:[number,number,number,number]}:e,[x1,y1,x2,y2]=r.bezier,x=[3*x1,3*x2-6*x1,1+3*x1-3*x2],y=[3*y1,3*y2-6*y1,1+3*y1-3*y2],ix=x.findIndex(v=>v!==0),iy=y.findIndex(v=>v!==0);
 if(ix<0||iy>=0&&iy<ix)fail('Endpoint has no finite continuation velocity');return iy<0||iy>ix?0:finite(y[iy]/x[ix],'endpoint slope');
}
export function keyframeSpan(value:NumericKeys){const s=source(value),keys=s.$keyframes;return frozen({start:keys[0].frame,end:keys.at(-1)!.frame,duration:keys.at(-1)!.frame-keys[0].frame,count:keys.length,unit:'stage-local-frame' as const});}
export function nearestKeyframe(value:NumericKeys,frame:number,options:{tie?:'earlier'|'later'}={}){
 const keys=source(value).$keyframes;finite(frame,'frame');const tie=options.tie??'earlier';if(!['earlier','later'].includes(tie))fail('Earlier/later tie policy required');let found=0;for(let i=1;i<keys.length;i++){const d=Math.abs(keys[i].frame-frame),old=Math.abs(keys[found].frame-frame);if(d<old||d===old&&tie==='later')found=i;}return frozen({index:found,key:keys[found],distance:Math.abs(keys[found].frame-frame)});
}
export function keyframesBetween(value:NumericKeys,start:number,end:number){const keys=source(value).$keyframes;finite(start,'start');finite(end,'end');if(end<start)fail('Ordered closed key range required');return frozen(keys.flatMap((key,index)=>key.frame>=start&&key.frame<=end?[{index,key}]:[]));}
export function shiftKeyframes(value:NumericKeys,frames:number):NumericKeys {const s=source(value);finite(frames,'shift');return output(s.$keyframes.map(k=>({...k,frame:finite(k.frame+frames,'shifted frame')})));}
export function retimeKeyframes(value:NumericKeys,range:{start:number;end:number}):NumericKeys {
 const keys=source(value).$keyframes,start=finite(range.start,'start'),end=finite(range.end,'end');if(start<0||end<start)fail('Nonnegative ordered target frame range required');if(keys.length===1){if(start!==end)fail('Singleton has no nonzero duration to scale');return output([{...keys[0],frame:start}]);}if(end===start)fail('Distinct keys require positive target duration');const first=keys[0].frame,span=keys.at(-1)!.frame-first;return output(keys.map((k,i)=>({...k,frame:i===0?start:i===keys.length-1?end:finite(start+(k.frame-first)/span*(end-start),'retimed frame')})));
}
export function reverseKeyframes(value:NumericKeys,options:{startFrame?:number}={}):NumericKeys {
 const keys=source(value).$keyframes,start=finite(options.startFrame??keys[0].frame,'startFrame'),last=keys.at(-1)!.frame;if(start<0)fail('Nonnegative target start required');for(let i=1;i<keys.length;i++)if(keys[i].easing==='step'&&keys[i-1].value!==keys[i].value)fail('Reversed hold-right jump is not representable by Core incoming step; use explicit source time reversal');
 return output([...keys].reverse().map((key,i)=>{const at=keys.length-1-i;return {frame:finite(start+(last-key.frame),'reverse frame'),value:key.value,...i?{easing:easedReverse(keys[at+1].easing)}:{}};}));
}
export function mapKeyframeValues(value:NumericKeys,map:(value:number,key:Readonly<Keyframe<number>>,index:number)=>number):NumericKeys {const keys=source(value).$keyframes;if(typeof map!=='function')fail('Pure numeric map callback required');return output(keys.map((k,i)=>({...k,value:finite(map(k.value,k,i),'mapped value')})));}
export function quantizeKeyframeTimes(value:NumericKeys,options:{grid:number;origin?:number;round?:'nearest'|'floor'|'ceil';collision?:'error'|'first'|'last'}):NumericKeys {
 const keys=source(value).$keyframes,grid=finite(options.grid,'grid'),origin=finite(options.origin??0,'origin'),round=options.round??'nearest',collision=options.collision??'error';if(grid<=0||!['nearest','floor','ceil'].includes(round)||!['error','first','last'].includes(collision))fail('Positive grid and known quantization/collision policies required');const result:Keyframe<number>[]=[];
 for(const k of keys){const v=finite((k.frame-origin)/grid,'grid phase');if(Math.abs(v)>Number.MAX_SAFE_INTEGER)fail('Grid phase exceeds Float64 exact integer range');const n=round==='nearest'?Math.round(v):round==='floor'?Math.floor(v):Math.ceil(v),frame=finite(origin+n*grid,'quantized frame'),key={...k,frame},last=result.at(-1);if(last&&last.frame===frame){if(collision==='error')fail('Quantization collides distinct keys',{frame});if(collision==='last')result[result.length-1]=key;}else result.push(key);}return output(result);
}
export function spliceKeyframes(values:readonly NumericKeys[],options:{collision?:'error'|'first'|'last'}={}):NumericKeys {
 if(!Array.isArray(values)||values.length===0)fail('Nonempty authored tracks required');const collision=options.collision??'error';if(!['error','first','last'].includes(collision))fail('Explicit collision policy required');const keys=values.flatMap(v=>source(v).$keyframes).sort((a,b)=>a.frame-b.frame),result:Keyframe<number>[]=[];for(const key of keys){if(result.at(-1)?.frame===key.frame){if(collision==='error')fail('Splice collision at existing key frame',{frame:key.frame});if(collision==='last')result[result.length-1]=key;}else result.push(key);}return output(result);
}
export function loopKeyframeValue(value:NumericKeys,context:FrameContext,options:KeyLoopOptions={}):number {
 const track=source(value),keys=track.$keyframes,frame=finite(context.frame,'frame'),before=options.before??'hold',after=options.after??'cycle';if(![before,after].every(v=>['hold','cycle','ping-pong','offset','continue'].includes(v)))fail('Known before/after loop mode required');const n=options.segments??keys.length-1;if(!Number.isSafeInteger(n)||n<0||n>=keys.length||keys.length>1&&n===0)fail('Positive count of existing keyframe segments required');
 if(frame>=keys[0].frame&&frame<=keys.at(-1)!.frame||keys.length===1)return at(track,frame);const leading=frame<keys[0].frame,mode=leading?before:after,lo=leading?0:keys.length-1-n,hi=leading?n:keys.length-1,a=keys[lo],b=keys[hi];
 if(mode==='hold')return leading?a.value:b.value;
 if(mode==='continue'){const i=leading?lo+1:hi,left=keys[i-1],right=keys[i];if(!leading&&right.easing==='step'&&left.value!==right.value)fail('Velocity at a stepped endpoint is undefined');const velocity=finite((right.value-left.value)/(right.frame-left.frame)*endSlope(right.easing,!leading),'continuation velocity'),anchor=leading?a:b;return finite(anchor.value+(frame-anchor.frame)*velocity,'continued value');}
 const phase=remapTime({time:frame,start:a.frame,duration:b.frame-a.frame,mode:mode==='ping-pong'?'ping-pong':'loop'},context),sample=at(track,phase);if(mode!=='offset')return sample;const cycles=Math.floor((frame-a.frame)/(b.frame-a.frame));return finite(sample+cycles*(b.value-a.value),'offset loop value');
}
export function sampleKeyframeMotion(value:NumericKeys,context:FrameContext,options:Omit<MotionSamplingOptions,'clock'>={}){
 const track=source(value),motion=sampleMotion2D(c=>[at(track,c.frame),0],context,{...options,clock:'local'}),keys=track.$keyframes,frame=context.frame,atKey=keys.findIndex(k=>k.frame===frame),stepped=atKey>0&&keys[atKey].easing==='step'&&keys[atKey].value!==keys[atKey-1].value,fps=rational(context.fps),h=motion.stepSeconds*fps.num/fps.den,low=frame-(motion.scheme==='forward'?0:motion.scheme==='backward'?2*h:h),high=frame+(motion.scheme==='backward'?0:motion.scheme==='forward'?2*h:h),crossesKey=keys.some(k=>k.frame>low&&k.frame<high);
 return frozen({value:motion.position[0],velocity:motion.velocity[0],acceleration:motion.acceleration[0],derivative:motion.derivative,stepSeconds:motion.stepSeconds,scheme:motion.scheme,status:stepped?'discontinuous-step':atKey>=0?'key-boundary':crossesKey?'window-crosses-key':frame<keys[0].frame||frame>keys.at(-1)!.frame?'outside-hold':'segment-interior',estimatedError:{velocity:motion.estimatedError.velocity[0],acceleration:motion.estimatedError.acceleration[0]},units:'value/local-second; value/local-second^2',certified:false});
}
export function integrateKeyframes(value:NumericKeys,fromFrame:number,toFrame:number,context:FrameContext):number {
 const track=source(value);finite(fromFrame,'fromFrame');finite(toFrame,'toFrame');rational(context.fps);if(fromFrame===toFrame)return 0;const integral=createSpeedRamp(track,{originFrame:fromFrame});return finite(integral.timeAt({...context,frame:toFrame}),'integrated property value');
}
export function averageKeyframes(value:NumericKeys,context:FrameContext,options:{widthFrames:number;alignment?:'center'|'past'|'future'}):number {
 const width=finite(options.widthFrames,'widthFrames'),align=options.alignment??'center';if(width<=0||!['center','past','future'].includes(align))fail('Positive smoothing window and known alignment required');const fps=rational(context.fps),from=finite(context.frame-(align==='future'?0:align==='past'?width:width/2),'window start'),to=finite(from+width,'window end');if(to<=from)fail('Window is below Float64 frame resolution');return finite(integrateKeyframes(value,from,to,context)/(width*fps.den/fps.num),'average value');
}
export function keyframeValueBounds(value:NumericKeys){
 const track=source(value),keys=track.$keyframes,candidates=keys.map(k=>({frame:k.frame,value:k.value}));for(let i=1;i<keys.length;i++)for(const x of stations(keys[i].easing)){const frame=keys[i-1].frame+x*(keys[i].frame-keys[i-1].frame);candidates.push({frame,value:at(track,frame)});}let min=Infinity,max=-Infinity;for(const c of candidates){min=Math.min(min,c.value);max=Math.max(max,c.value);}return frozen({min,max,minFrames:candidates.filter(c=>c.value===min).map(c=>c.frame),maxFrames:candidates.filter(c=>c.value===max).map(c=>c.frame),scope:'existing Core endpoints and cubic stationary values',certified:false});
}
export function findKeyframeCrossings(value:NumericKeys,target:number,options:{valueTolerance?:number}={}):readonly KeyCrossing[]{
 const track=source(value),keys=track.$keyframes,tol=finite(options.valueTolerance??1e-8,'valueTolerance');finite(target,'target');if(tol<=0)fail('Positive value tolerance required');const out:KeyCrossing[]=[];
 const point=(frame:number,segment:number)=>{const residual=Math.abs(at(track,frame)-target);if(!out.some(p=>p.kind==='point'&&p.frame===frame))out.push({kind:'point',frame,residual,segment,status:residual<=tol?'resolved':'resolution-limit'});};
 if(keys.length===1){if(Math.abs(keys[0].value-target)<=tol)point(keys[0].frame,0);return frozen(out);}
 for(let i=1;i<keys.length;i++){const a=keys[i-1],b=keys[i],segment=i-1,da=Math.abs(a.value-target),db=Math.abs(b.value-target);
  if(a.value===b.value){if(da<=tol)out.push({kind:'interval',start:a.frame,end:b.frame,endInclusive:true,residual:da,segment});continue;}
  if(b.easing==='step'){if(da<=tol)out.push({kind:'interval',start:a.frame,end:b.frame,endInclusive:false,residual:da,segment});if(db<=tol)point(b.frame,segment);if(target>Math.min(a.value,b.value)&&target<Math.max(a.value,b.value))out.push({kind:'jump',frame:b.frame,before:a.value,after:b.value,segment});continue;}
  const frames=[a.frame,...stations(b.easing).map(x=>a.frame+x*(b.frame-a.frame)),b.frame];for(let j=1;j<frames.length;j++){let lo=frames[j-1],hi=frames[j],vl=at(track,lo),vh=at(track,hi);if(Math.abs(vl-target)<=tol)point(lo,segment);if(Math.abs(vh-target)<=tol)point(hi,segment);if((vl<target)===(vh<target)||vl===target||vh===target)continue;
   let best=Math.abs(vl-target)<Math.abs(vh-target)?lo:hi;for(let n=0;n<64;n++){const mid=lo+(hi-lo)/2;if(mid===lo||mid===hi)break;const v=at(track,mid);if(Math.abs(v-target)<Math.abs(at(track,best)-target))best=mid;if(Math.abs(v-target)<=tol){best=mid;break;}if((v<target)===(vl<target)){lo=mid;vl=v;}else{hi=mid;vh=v;}}point(best,segment);
  }
 }return frozen(out.sort((a,b)=>(a.kind==='interval'?a.start:a.frame)-(b.kind==='interval'?b.start:b.frame)));
}
const nextDown=(v:number)=>{const a=new DataView(new ArrayBuffer(8));if(v===0)return -Number.MIN_VALUE;a.setFloat64(0,v);a.setBigUint64(0,a.getBigUint64(0)+(v>0?-1n:1n));return a.getFloat64(0);};
export function invertKeyframeValue(value:NumericKeys,target:number,options:{policy?:'first'|'last'|'nearest';nearFrame?:number;valueTolerance?:number}={}){
 const events=findKeyframeCrossings(value,target,{valueTolerance:options.valueTolerance}),policy=options.policy??'first';if(!['first','last','nearest'].includes(policy))fail('Known inverse branch policy required');const near=options.nearFrame;if(near!==undefined)finite(near,'nearFrame');if(policy==='nearest'&&near===undefined)fail('Nearest inverse requires an explicit frame anchor');const candidates:{frame:number;kind:'point'|'interval';residual:number;status:string}[]=[];
 for(const e of events){if(e.kind==='point')candidates.push({frame:e.frame,kind:e.kind,residual:e.residual,status:e.status});else if(e.kind==='interval'){const end=e.endInclusive?e.end:Math.max(e.start,nextDown(e.end)),frame=policy==='last'?end:policy==='nearest'?Math.max(e.start,Math.min(end,near!)):e.start;candidates.push({frame,kind:e.kind,residual:e.residual,status:'resolved'});}}
 candidates.sort((a,b)=>policy==='last'?b.frame-a.frame:policy==='nearest'?Math.abs(a.frame-near!)-Math.abs(b.frame-near!)||a.frame-b.frame:a.frame-b.frame);return frozen({status:candidates.length?candidates[0].status:'unresolved',frame:candidates[0]?.frame??null,candidate:candidates[0]??null,alternatives:candidates.slice(1),jumps:events.filter(e=>e.kind==='jump'),scope:'Core numeric values; no fabricated time inside a discontinuity'});
}
export function keyframeEventsBetween(value:NumericKeys,fromFrame:number,toFrame:number){const keys=source(value).$keyframes;finite(fromFrame,'fromFrame');finite(toFrame,'toFrame');if(fromFrame===toFrame)return frozen([]);const forward=toFrame>fromFrame,result=keys.flatMap((key,index)=>(forward?key.frame>fromFrame&&key.frame<=toFrame:key.frame<fromFrame&&key.frame>=toFrame)?[{index,key,direction:forward?1:-1}]:[]);return frozen(forward?result:result.reverse());}
export function quantizeKeyframeValues(value:NumericKeys,options:{step:number;origin?:number;round?:'nearest'|'floor'|'ceil'}):NumericKeys {
 const step=finite(options.step,'step'),origin=finite(options.origin??0,'origin'),mode=options.round??'nearest';if(step<=0||!['nearest','floor','ceil'].includes(mode))fail('Positive value step and known rounding required');return mapKeyframeValues(value,v=>{const p=finite((v-origin)/step,'value phase');if(Math.abs(p)>Number.MAX_SAFE_INTEGER)fail('Value phase exceeds exact integer range');return finite(origin+step*(mode==='nearest'?Math.round(p):mode==='floor'?Math.floor(p):Math.ceil(p)),'quantized value');});
}
export function normalizeKeyframes(value:NumericKeys,range:{min:number;max:number;constant?:'center'|'min'|'error'}):NumericKeys {
 const min=finite(range.min,'min'),max=finite(range.max,'max'),policy=range.constant??'center';if(max<min||!['center','min','error'].includes(policy))fail('Ordered target value range and constant-track policy required');const bounds=keyframeValueBounds(value),span=bounds.max-bounds.min;if(span===0){if(policy==='error')fail('Constant track has no value span');return mapKeyframeValues(value,()=>policy==='min'?min:min+(max-min)/2);}return mapKeyframeValues(value,v=>finite(min+(v-bounds.min)/span*(max-min),'normalized key value'));
}
export function blendKeyframeValues(a:NumericKeys,b:NumericKeys,weight:Signal<number>,context:FrameContext){const left=source(a),right=source(b),w=finite(evaluate(weight,context),'weight');if(w<0||w>1)fail('Blend weight must be in [0,1]');return finite(at(left,context.frame)*(1-w)+at(right,context.frame)*w,'blended value');}
export function keyframePulse(value:NumericKeys,context:FrameContext,options:{widthFrames:number;shape?:'triangle'|'gaussian'|'box';amplitude?:Signal<number>}):number {
 const width=finite(options.widthFrames,'widthFrames'),shape=options.shape??'triangle';if(width<=0||!['triangle','gaussian','box'].includes(shape))fail('Positive pulse width and known shape required');const distance=nearestKeyframe(value,context.frame).distance/width,amplitude=finite(evaluate(options.amplitude??1,context),'amplitude');return finite(amplitude*(shape==='triangle'?Math.max(0,1-distance):shape==='box'?Number(distance<=1):Math.exp(-.5*distance*distance)),'pulse');
}
