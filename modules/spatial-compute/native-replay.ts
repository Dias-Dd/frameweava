import {FixedStepRunner} from '../../src/core/simulation.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {NativeGpuScope} from '../native-gpu/authoring.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {time as checkTime} from '../spatial-fields/parameters.ts';
export interface NativeReplayOptions {
 /** Fixed substeps per authored frame; work is never automatically reduced. */
 substeps?:number;
 /** Adjustable compute/state-only submission threshold, not a program limit. */
 segmentPasses?:number;
 /** Existing FixedStepRunner replay limit, default 100000. */
 maxSteps?:number;
}
export interface NativeReplayStep {context:FrameContext;dt:number;step:number}
const fail=(code:string,message:string):never=>{throw Object.assign(new Error(message),{code:'E_NATIVE_REPLAY_'+code});};
/** Recording adapter over Core FixedStepRunner + Native stateStep. It does not
 * implement another simulation clock or store GPU handles in checkpoints.
 * Every requested frame resets to the immutable seed and replays all steps.
 * CPU checkpoints here contain ONLY the absolute planning step. GPU snapshots
 * are not claimed. The scope/leases remain borrowed, with native ordered slots.
 */
export function createNativeReplay(gpu:NativeGpuScope,state:readonly GpuDataBuffer[],options:NativeReplayOptions={}){
 if(!options||Object.keys(options).some(k=>!['substeps','maxSteps','segmentPasses'].includes(k)))fail('PARAMETER','Unknown replay option');
 const substeps=options.substeps??1,maxSteps=options.maxSteps??100000,segmentPasses=options.segmentPasses??768;
 if(!Number.isSafeInteger(segmentPasses)||segmentPasses<1||!Number.isSafeInteger(substeps)||substeps<1||!Number.isSafeInteger(maxSteps)||maxSteps<1)fail('PARAMETER','Positive integer substeps/maxSteps required');
 if(!state.length||new Set(state).size!==state.length)fail('STATE','Nonempty distinct managed state leases required');
 const leases=[...state];let epoch=0,busy=false;
 return {
  async record(context:FrameContext,step:(value:NativeReplayStep)=>Promise<void>,execution:{signal?:AbortSignal}={}){
   if(busy)fail('BUSY','Await the preceding Native replay recording');checkTime(context);if(typeof step!=='function')fail('PARAMETER','Explicit step callback required');
   if(!execution||Object.keys(execution).some(k=>k!=='signal')||execution.signal!==undefined&&!(execution.signal instanceof AbortSignal))fail('PARAMETER','Expected local execution signal');
   const cancelled=()=>{if(execution.signal?.aborted)throw Object.assign(new Error('Native replay recording cancelled'),{code:'E_RENDER_CANCELLED'});};cancelled();
   const target=context.frame*substeps,rate=context.fps.num/context.fps.den*substeps;
   if(!Number.isSafeInteger(target)||target>maxSteps)fail('BUDGET','Complete reset/replay exceeds maxSteps; no quality/time reduction');
   if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(Math.fround(1/rate))||Math.fround(1/rate)===0)fail('TIME','Fixed step must remain representable for GPU parameters');
   if(epoch>0xffffffff)fail('EPOCH','Native u32 epoch exhausted; recreate the Session');
   const plans:{dt:number;step:number}[]=[];let current=0;
   // This is the existing Core planner. Its cloneable snapshots are numbers.
   const planner=new FixedStepRunner({reset(){current=0;plans.length=0;},step(dt,frame){current=frame;plans.push({dt,step:frame});},snapshot:()=>current,restore(value){current=value;}},{fps:rate,maxSteps});planner.seek(target);
   const currentEpoch=epoch++;busy=true;
   try{
    await gpu.stateStep(leases,{version:1,epoch:currentEpoch,step:0,reset:true,signal:execution.signal});
    for(const plan of plans){cancelled();await gpu.stateStep(leases,{version:1,epoch:currentEpoch,step:plan.step,signal:execution.signal});
     const frame=plan.step/substeps,localTime=frame*context.fps.den/context.fps.num,globalFrame=context.globalFrame-context.frame+frame,globalTime=context.globalTime-context.time+localTime;
     const sample={...context,frame,time:localTime,globalFrame,globalTime,dt:plan.dt,progress:context.durationInFrames>1?frame/(context.durationInFrames-1):0};
     // Explicit step Context/Signals use subframe time. The enclosing Stage's
     // global Date/performance clock is deliberately not changed by this adapter.
     await step({context:sample,dt:plan.dt,step:plan.step});
     const stats=gpu.stats?.();if(stats&&stats.stateSegmentEligible!==false&&stats.pendingPasses>=segmentPasses&&typeof gpu.flushState==='function')await gpu.flushState({version:1,signal:execution.signal});
    }cancelled();return {epoch:currentEpoch,steps:target,substeps,reset:true as const,gpuCheckpoint:false as const};
   }finally{busy=false;}
  }
 };
}
