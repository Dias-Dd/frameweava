import {performance} from 'node:perf_hooks';

/** Host wall-clock spans. Nested/parallel spans overlap; these are not GPU timer queries. */
export interface PerformanceEvent {
  phase:string;durationMs:number;outcome:'ok'|'error';stageId?:string;frame?:number;
}
export type PerformanceSink=(event:PerformanceEvent)=>void;
function emit(sink:PerformanceSink|undefined,event:PerformanceEvent){try{sink?.(event);}catch{/* Observers cannot change rendering. */}}
export async function measure<T>(sink:PerformanceSink|undefined,phase:string,run:()=>Promise<T>,context:{stageId?:string;frame?:number}={}):Promise<T>{
  if(!sink)return run();const start=performance.now();let outcome:PerformanceEvent['outcome']='error';
  try{const result=await run();outcome='ok';return result;}finally{emit(sink,{phase,durationMs:performance.now()-start,outcome,...context});}
}
/** Sequential compiler checkpoints include host work since the previous checkpoint. */
export function checkpoints(sink?:PerformanceSink){let last=performance.now();return(phase:string)=>{const now=performance.now();emit(sink,{phase,durationMs:now-last,outcome:'ok'});last=now;};}
