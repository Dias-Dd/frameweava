/** Optional execution observer. Counts describe completed work, never submissions. */
export interface RenderProgress {
 phase:'compile'|'initialize'|'first-frame'|'render'|'audio'|'mux'|'finalize'|'ready'|'complete'|'error'|'cancelled';
 completed?:number;total?:number;unit?:'frames'|'samples';message?:string;
}
export type ProgressSink=(progress:Readonly<RenderProgress>)=>void;
export function reportProgress(sink:ProgressSink|undefined,progress:RenderProgress){
 if(sink)try{sink(Object.freeze({...progress}));}catch{/* Presentation observers cannot change execution. */}
}
