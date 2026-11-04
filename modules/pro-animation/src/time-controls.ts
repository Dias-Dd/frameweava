// SPDX-License-Identifier: Apache-2.0
// Pure time-coordinate math over existing Signal/keyframes; no timeline, renderer or frame cache.
import {evaluate,validateKeyframes} from '../../../src/core/animation.ts';
import {rational} from '../../../src/core/time.ts';
import {EngineError} from '../../../src/core/errors.ts';
import type {Easing,FrameContext,Keyframes,Signal} from '../../../src/core/types.ts';

function fail(message:string):never{throw new EngineError('E_PA_TIME',message);}
function finite(n:number,name:string):number{if(typeof n!=='number'||!Number.isFinite(n))fail(`${name} must be finite`);return n;}
const scalar=(value:Signal<number>,ctx:FrameContext,name:string)=>finite(evaluate(value,ctx),name);
export interface RemapTimeOptions {
 /** Source time in local seconds; defaults to the existing Stage-local time. */
 time?:Signal<number>;
 /** Unbounded mapping does not infer source media duration. Other modes require a finite duration. */
 mode?:'unbounded'|'clamp'|'loop'|'ping-pong';
 start?:number;
 duration?:number;
}
/** Existing Signal evaluates the nonlinear curve; this only applies an explicit source-domain boundary rule. */
export function remapTime(options:RemapTimeOptions,context:FrameContext):number{
 const t=scalar(options.time??context.time,context,'time'),mode=options.mode??'unbounded';
 if(mode==='unbounded'){if(options.start!==undefined||options.duration!==undefined)fail('Range requires clamp, loop or ping-pong mode');return t;}
 if(!['clamp','loop','ping-pong'].includes(mode))fail('Unknown time boundary mode');
 const start=finite(options.start??0,'start'),duration=finite(options.duration!,'duration'),end=finite(start+duration,'end');
 if(duration<=0||end<=start)fail('duration must be positive and resolvable at start');
 if(mode==='clamp')return Math.max(start,Math.min(end,t));
 const relative=finite(t-start,'relative time'),cycles=relative/duration;
 if(!Number.isFinite(cycles)||Math.abs(cycles)>Number.MAX_SAFE_INTEGER)fail('Time phase exceeds Float64 cycle resolution');
 // Remainder avoids subtracting a huge multiple of duration. Do not epsilon-snap true boundary samples.
 let phase=relative%duration;if(phase<0)phase+=duration;
 if(mode==='loop'){const result=finite(start+phase,'loop time');if(result>=end)fail('Loop phase is not representable inside the half-open source interval');return result;}
 const cycle=Math.floor(cycles),reverse=Math.abs(cycle%2)===1;
 return finite(reverse?end-phase:start+phase,'ping-pong time'); // closed turning endpoints
}
export interface PosterizeTimeOptions {time?:Signal<number>;rate:number|{num:number;den:number};origin?:number}
/** Sample-and-hold time only, not frame blending or pixel interpolation. floor also applies before origin. */
export function posterizeTime(options:PosterizeTimeOptions,context:FrameContext):number{
 const t=scalar(options.time??context.time,context,'time'),origin=finite(options.origin??0,'origin'),rate=rational(options.rate);
 const phase=finite((t-origin)*rate.num/rate.den,'sample phase');
 if(Math.abs(phase)>Number.MAX_SAFE_INTEGER)fail('Sample index exceeds Float64 exact-integer resolution');
 return finite(origin+Math.floor(phase)*rate.den/rate.num,'posterized time');
}
/** Evaluate an existing pure numeric Signal at an explicit local sample; global time/progress/seed are preserved. */
export function sampleSignalAtTime(signal:Signal<number>,time:number,context:FrameContext):number{
 const source=finite(time,'sample time'),fps=rational(context.fps),frame=finite(source*fps.num/fps.den,'sample frame');
 return scalar(signal,{...context,time:source,frame},'sampled Signal');
}

/** Integral from 0 to x of the existing easing shape. Incoming key owns easing, exactly as Core keyframesAt. */
function easingIntegral(easing:Easing|undefined,x:number):number{
 if(!easing||easing==='linear')return x*x/2;
 if(easing==='step')return 0; // endpoint value has zero integration measure
 if(easing==='easeIn')return x*x*x/3;
 if(easing==='easeOut')return x*x-x*x*x/3;
 if(easing==='easeInOut')return x<=.5?2*x*x*x/3:-x+2*x*x-2*x*x*x/3+1/6;
 const [x1,y1,x2,y2]=easing.bezier;
 const cx=[0,3*x1,3*x2-6*x1,1+3*x1-3*x2],cy=[0,3*y1,3*y2-6*y1,1+3*y1-3*y2];
 const cubic=(a:number[],t:number)=>((a[3]*t+a[2])*t+a[1])*t;
 let lo=0,hi=1;
 // Same monotone CSS x-domain / 36-step precision as Core easingAt. This integrates, never interpolates key values.
 if(x>0&&x<1)for(let i=0;i<36;i++){const t=(lo+hi)/2;if(cubic(cx,t)<x)lo=t;else hi=t;}
 const u=x<=0?0:x>=1?1:(lo+hi)/2;let area=0;
 for(let i=1;i<=3;i++)for(let j=0;j<=2;j++)area+=cy[i]*(j+1)*cx[j+1]*u**(i+j+1)/(i+j+1);
 return finite(area,'easing integral');
}
export interface SpeedRampOptions {originFrame?:number;sourceTime?:number}
/**
 * Integrate an immutable snapshot of an EXISTING numeric Keyframes velocity track.
 * Values are source-seconds / local-second, not positions. Outside keys hold endpoint speed.
 * Absolute analytic evaluation enables reverse, holds and arbitrary seek with no accumulated frame history.
 */
export function createSpeedRamp(speed:Keyframes<number>,options:SpeedRampOptions={}){
 if(!speed||typeof speed!=='object'||!Array.isArray(speed.$keyframes))fail('speed must be existing numeric Keyframes');
 validateKeyframes(speed.$keyframes);
 if(speed.$keyframes.some(k=>typeof k.value!=='number'))fail('Speed key values must be numeric');
 const keys=speed.$keyframes.map(k=>({...k,...typeof k.easing==='object'?{easing:{bezier:[...k.easing.bezier] as [number,number,number,number]}}:{}})),snapshot={$keyframes:keys};
 const origin=finite(options.originFrame??0,'originFrame'),base=finite(options.sourceTime??0,'sourceTime'),prefix=[0];
 const segment=(i:number,u:number)=>{const a=keys[i],b=keys[i+1];return finite((b.frame-a.frame)*(a.value*u+(b.value-a.value)*easingIntegral(b.easing,u)),'integrated speed segment');};
 let sum=0,correction=0;
 for(let i=0;i<keys.length-1;i++){const y=segment(i,1)-correction,next=finite(sum+y,'integrated speed prefix');correction=(next-sum)-y;sum=next;prefix.push(sum);}
 function primitive(frame:number):number{
  finite(frame,'frame');const last=keys.length-1;
  if(frame<=keys[0].frame)return finite((frame-keys[0].frame)*keys[0].value,'leading integral');
  if(frame>=keys[last].frame)return finite(prefix[last]+(frame-keys[last].frame)*keys[last].value,'trailing integral');
  let lo=0,hi=last;while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(keys[mid].frame<=frame)lo=mid;else hi=mid;}
  return finite(prefix[lo]+segment(lo,(frame-keys[lo].frame)/(keys[lo+1].frame-keys[lo].frame)),'partial integral');
 }
 const originArea=primitive(origin);
 return {
  timeAt(context:FrameContext):number{const fps=rational(context.fps);return finite(base+(primitive(context.frame)-originArea)*fps.den/fps.num,'ramped source time');},
  speedAt(context:FrameContext):number{return scalar(snapshot,context,'speed');},
 };
}
