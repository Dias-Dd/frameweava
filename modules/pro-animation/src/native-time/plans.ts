// SPDX-License-Identifier: Apache-2.0
// Time-coordinate and lazy sampling adapters. Core owns Signals, easing and time.
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import {rational,seededRandom} from '../../../../src/core/time.ts';
import type {FrameContext,Rational,Signal} from '../../../../src/core/types.ts';
import {shutterSamples,type ShutterSamplingOptions} from '../shutter-sampling.ts';

export const timeFail=(message:string):never=>{throw new EngineError('E_PA_NATIVE_TIME',message);};
export function finite(value:number,name:string){if(typeof value!=='number'||!Number.isFinite(value))timeFail(name+' must be finite');return value;}
export function scalar(value:Signal<number>,context:FrameContext,name:string){return finite(evaluate(value,context),name);}
export function count(value:number,name:string,minimum=1){if(!Number.isSafeInteger(value)||value<minimum)timeFail(name+' must be a safe integer >= '+minimum);return value;}
export function fields(value:object,names:readonly string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!names.includes(k)))timeFail('Unknown time option');}

export interface TimeSample {readonly index:number;readonly time:number;readonly weight:number;readonly context:Readonly<FrameContext>}
export interface TimeSamplePlan extends Iterable<TimeSample>{readonly count:number;at(index:number):Readonly<TimeSample>}
export interface SourceTimeRange {start:number;end:number;boundary?:'error'|'clamp'|'loop'|'ping-pong'|'transparent'}
/** Closed finite sample-centre interval. An empty interval is never inferred from image changes. */
export function resolveTimeRange(time:number,range?:SourceTimeRange):number|null{
 finite(time,'source time');if(!range)return time;fields(range,['start','end','boundary']);
 const {start,end}=range,mode=range.boundary??'error';finite(start,'range start');finite(end,'range end');
 if(end<start||!['error','clamp','loop','ping-pong','transparent'].includes(mode))timeFail('Ordered range and known boundary required');
 if(time>=start&&time<=end)return time;
 if(mode==='transparent')return null;if(mode==='error')timeFail('Source time outside the explicit sample-centre range');
 if(mode==='clamp')return Math.max(start,Math.min(end,time));
 const span=finite(end-start,'range span');if(span===0)timeFail('Loop/ping-pong needs a positive range');
 const delta=finite(time-start,'relative time'),cycles=delta/span;if(!Number.isFinite(cycles)||Math.abs(cycles)>Number.MAX_SAFE_INTEGER)timeFail('Boundary phase exceeds Float64 resolution');
 let phase=delta%span;if(phase<0)phase+=span;
 return mode==='loop'?start+phase:Math.abs(Math.floor(cycles)%2)===1?end-phase:start+phase;
}
/** Source retiming changes LOCAL time/frame only. Output/global time and progress stay authoritative. */
export function sourceTimeContext(context:FrameContext,time:number):Readonly<FrameContext>{
 const rate=rational(context.fps);finite(time,'source time');return Object.freeze({...context,time,frame:finite(time*rate.num/rate.den,'source frame')});
}
/** Real shutter subframe: invert the existing finite affine Stage mapping. No Stage seek or runner. */
export function shutterTimeContext(context:FrameContext,time:number):Readonly<FrameContext>{
 const rate=rational(context.fps);finite(context.dt,'Stage dt');if(context.dt===0)timeFail('Shutter subframes require nonzero affine Stage dt');
 if(!Number.isSafeInteger(context.durationInFrames)||context.durationInFrames<1)timeFail('Finite Stage duration required');
 const local=sourceTimeContext(context,time),delta=finite((time-context.time)/context.dt,'global frame delta');
 return Object.freeze({...local,globalFrame:finite(context.globalFrame+delta,'global subframe'),globalTime:finite(context.globalTime+delta*rate.den/rate.num,'global subtime'),progress:context.durationInFrames<=1?0:finite(context.progress+delta/(context.durationInFrames-1),'subframe progress')});
}
function plan(length:number,at:(index:number)=>TimeSample):TimeSamplePlan{
 count(length,'sample count');return Object.freeze({count:length,at(index:number){count(index,'sample index',0);if(index>=length)timeFail('Sample index out of range');return Object.freeze(at(index));},*[Symbol.iterator](){for(let i=0;i<length;i++)yield this.at(i);}});
}
const item=(index:number,time:number,weight:number,context:FrameContext):TimeSample=>({index,time:finite(time,'sample time'),weight:finite(weight,'sample weight'),context:sourceTimeContext(context,time)});
export interface FrameBlendOptions {time?:Signal<number>;fps?:number|Rational;origin?:number;method?:'hold'|'nearest'|'linear'}
/** Exact integer frames request one source, linear requests the two neighbours. Ties for nearest go forward. */
export function frameBlendSamples(options:FrameBlendOptions,context:FrameContext):TimeSamplePlan{
 fields(options,['time','fps','origin','method']);const time=scalar(options.time??context.time,context,'time'),rate=rational(options.fps??context.fps),origin=finite(options.origin??0,'origin'),method=options.method??'linear';
 if(!['hold','nearest','linear'].includes(method))timeFail('Known frame sampling method required');
 const x=finite((time-origin)*rate.num/rate.den,'source frame');if(Math.abs(x)>Number.MAX_SAFE_INTEGER-1)timeFail('Source frame exceeds exact integer domain');
 const low=Math.floor(x),fraction=x-low,first=method==='nearest'?Math.floor(x+.5):low,length=method==='linear'&&fraction>0?2:1;
 return plan(length,i=>item(i,origin+(first+i)*rate.den/rate.num,length===1?1:i===0?1-fraction:fraction,context));
}
export interface EchoSamplingOptions {time?:Signal<number>;echoes?:number;interval?:Signal<number>;intensity?:Signal<number>;decay?:Signal<number>}
/** N echoes plus the current image. No 255 echo cap or persistent historical buffer. */
export function echoSamples(options:EchoSamplingOptions,context:FrameContext):TimeSamplePlan{
 fields(options,['time','echoes','interval','intensity','decay']);const echoes=count(options.echoes??8,'echoes',0);if(echoes===Number.MAX_SAFE_INTEGER)timeFail('Echo count plus current sample is not representable');
 const time=scalar(options.time??context.time,context,'time'),dt=scalar(options.interval??(-context.fps.den/context.fps.num),context,'interval'),intensity=scalar(options.intensity??1,context,'intensity'),decay=scalar(options.decay??.75,context,'decay');
 if(intensity<0||decay<0||decay>1)timeFail('Nonnegative intensity and decay in [0,1] required');
 return plan(echoes+1,i=>{const weight=intensity*decay**i;if(intensity>0&&decay>0&&weight===0)timeFail('Echo weight underflow; shorten range or explicitly use zero decay');return item(i,time+i*dt,weight,context);});
}
export interface TrailSamplingOptions {time?:Signal<number>;duration:number;count?:number;direction?:'past'|'future';falloff?:'box'|'linear'|'exponential';decay?:number}
/** Finite absolute-time trail, including both endpoints. A duration is not a simulation history. */
export function trailSamples(options:TrailSamplingOptions,context:FrameContext):TimeSamplePlan{
 fields(options,['time','duration','count','direction','falloff','decay']);const n=count(options.count??16,'count'),duration=finite(options.duration,'duration'),time=scalar(options.time??context.time,context,'time'),direction=options.direction??'past',falloff=options.falloff??'exponential',decay=finite(options.decay??.15,'decay');
 if(duration<0||!['past','future'].includes(direction)||!['box','linear','exponential'].includes(falloff)||decay<0||decay>1)timeFail('Invalid trail range/falloff');
 return plan(n,i=>{const u=n===1?0:i/(n-1),w=falloff==='box'?1:falloff==='linear'?1-u:decay**u;return item(i,time+(direction==='past'?-1:1)*duration*u,w,context);});
}
export interface WideTimeSamplingOptions {time?:Signal<number>;before:number;after:number;count?:number;weight?:'box'|'triangle'}
/** Midpoint finite temporal window, centred or asymmetric. Negative scene time is not silently clamped. */
export function wideTimeSamples(options:WideTimeSamplingOptions,context:FrameContext):TimeSamplePlan{
 fields(options,['time','before','after','count','weight']);const n=count(options.count??16,'count'),time=scalar(options.time??context.time,context,'time'),before=finite(options.before,'before'),after=finite(options.after,'after'),weight=options.weight??'box';
 if(before<0||after<0||!['box','triangle'].includes(weight))timeFail('Nonnegative window extents and known weight required');
 const span=finite(before+after,'window span'),start=finite(time-before,'window start');
 return plan(n,i=>{const u=(i+.5)/n;return item(i,start+u*span,weight==='box'?1:1-Math.abs(2*u-1),context);});
}
/** Reuse the existing quadrature, including its time-resolution diagnostics. */
export function shutterTimeSamples(options:ShutterSamplingOptions,context:FrameContext):TimeSamplePlan{
 const shutter=shutterSamples(options,context);return plan(shutter.count,i=>{const s=shutter.at(i);return {index:i,time:s.time,weight:s.weight,context:shutterTimeContext(context,s.time)};});
}
export interface FreezeTimeOptions {start:number;end:number;hold?:number;after?:'resume'|'delay'}
/** A finite hold; delay shifts subsequent source time, resume jumps back to the unmodified clock. */
export function freezeTimeRange(time:number,options:FreezeTimeOptions):number{
 fields(options,['start','end','hold','after']);finite(time,'time');const {start,end}=options,hold=finite(options.hold??start,'hold'),after=options.after??'delay';finite(start,'start');finite(end,'end');
 if(end<start||!['resume','delay'].includes(after))timeFail('Ordered hold range and known continuation required');
 return time<start?time:time<end?hold:after==='resume'?time:finite(time-(end-start),'delayed source time');
}
/** Reverse exactly one finite source interval. Outside remains unchanged; no reverse decoder is implied. */
export function reverseTimeRange(time:number,options:{start:number;end:number}):number{
 fields(options,['start','end']);finite(time,'time');finite(options.start,'start');finite(options.end,'end');if(options.end<options.start)timeFail('Ordered reverse range required');
 return time<options.start||time>options.end?time:finite(options.start+(options.end-time),'reversed source time');
}
/** Deterministic smooth temporal turbulence; existing seeded hash, never wall-clock randomness. */
export function jitterTime(time:number,options:{frequency:number;amplitude:number;seed?:number;interpolation?:'hold'|'smooth'}):number{
 fields(options,['frequency','amplitude','seed','interpolation']);finite(time,'time');const frequency=finite(options.frequency,'frequency'),amplitude=finite(options.amplitude,'amplitude'),seed=options.seed??0,method=options.interpolation??'smooth';
 if(frequency<=0||amplitude<0||!Number.isSafeInteger(seed)||!['hold','smooth'].includes(method))timeFail('Positive frequency, nonnegative amplitude and integer seed required');
 const phase=finite(time*frequency,'noise phase'),i=Math.floor(phase);if(Math.abs(i)>Number.MAX_SAFE_INTEGER-1)timeFail('Noise cell exceeds exact integer domain');const f=phase-i,u=f*f*f*(f*(f*6-15)+10),a=seededRandom(seed,i,'time')*2-1,b=seededRandom(seed,i+1,'time')*2-1;
 return finite(time+amplitude*(method==='hold'?a:a+(b-a)*u),'jittered time');
}
export interface StrobeTimeOptions {period:number;onDuration:number;origin?:number;off?:'transparent'|'hold'}
/** On windows follow time. Off windows either return transparent or hold the final on-window boundary. */
export function strobeTime(time:number,options:StrobeTimeOptions):number|null{
 fields(options,['period','onDuration','origin','off']);finite(time,'time');const period=finite(options.period,'period'),on=finite(options.onDuration,'onDuration'),origin=finite(options.origin??0,'origin'),off=options.off??'transparent';
 if(period<=0||on<0||on>period||!['transparent','hold'].includes(off))timeFail('Require 0 <= onDuration <= positive period');
 const phase=(time-origin)/period;if(!Number.isFinite(phase)||Math.abs(phase)>Number.MAX_SAFE_INTEGER)timeFail('Strobe phase exceeds Float64 domain');const cycle=Math.floor(phase),start=finite(origin+cycle*period,'cycle start');
 return time-start<on?time:off==='hold'?finite(start+on,'held strobe time'):null;
}
