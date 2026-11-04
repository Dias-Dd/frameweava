import {EngineError} from '../../src/core/errors.ts';
import {MAX_NATIVE_FRAMES} from './memory.ts';

export interface NativeSchedulingPolicy {mode:'interactive'|'throughput';capacity:number;initial?:number;targetLatencyMs?:number}
export interface NativeSchedulingSample {concurrency:number;frames:number;wallMs:number;fps:number;next:number}
/** Bounded hill-climbing using complete-batch wall time, never GPU-query time.
 * Callers submit frames in deterministic order. Only independent GPU resource
 * slots overlap; state updates still run in authored order. */
export class NativeFrameScheduler {
 private current:number;private previous?:{concurrency:number;fps:number};private stable=0;private frames=0;
 readonly samples:NativeSchedulingSample[]=[];
 constructor(readonly policy:NativeSchedulingPolicy){
  if(!Number.isSafeInteger(policy.capacity)||policy.capacity<1||policy.initial!==undefined&&(!Number.isInteger(policy.initial)||policy.initial<1||policy.initial>policy.capacity)||policy.targetLatencyMs!==undefined&&(!Number.isFinite(policy.targetLatencyMs)||policy.targetLatencyMs<=0))throw new EngineError('E_NATIVE_SCHEDULER','Invalid native concurrency policy');
  this.current=policy.initial??Math.min(policy.mode==='interactive'?2:8,policy.capacity);
 }
 get concurrency(){return this.current;}
 observe(frames:number,wallMs:number){
  if(!Number.isInteger(frames)||frames<1||!Number.isFinite(wallMs)||wallMs<=0)throw new EngineError('E_NATIVE_SCHEDULER','Expected actual completed frames and positive wall duration');
  const concurrency=this.current,fps=1000*frames/wallMs;
  this.frames+=frames;
  if(this.policy.mode==='interactive'){
   const target=this.policy.targetLatencyMs??16.67;
   // Retain one executing and one preparing slot when the device budget
   // permits it. Falling to one serializes JS recording behind GPU completion.
   if(wallMs>target*1.25)this.current=Math.max(Math.min(2,this.policy.capacity),concurrency-1);
   else if(wallMs<target*.65)this.current=Math.min(this.policy.capacity,concurrency+1);
  }else if(frames!==concurrency){
   const sample={concurrency,frames,wallMs,fps,next:this.current};this.samples.push(sample);if(this.samples.length>128)this.samples.shift();return sample;
  }else if(this.previous&&this.previous.concurrency<concurrency&&fps<this.previous.fps*.95){
   this.current=this.previous.concurrency;this.stable=4;
  }else if(this.stable>0){this.stable--;}
  else this.current=Math.min(this.policy.capacity,Math.max(concurrency+1,Math.ceil(concurrency*1.5)));
  this.previous={concurrency,fps};
  const sample={concurrency,frames,wallMs,fps,next:this.current};this.samples.push(sample);if(this.samples.length>128)this.samples.shift();return sample;
 }
 stats(){return {version:1,mode:this.policy.mode,capacity:this.policy.capacity,concurrency:this.current,completedFrames:this.frames,samples:[...this.samples]};}
}
