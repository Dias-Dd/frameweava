import type {Diagnostic, Json} from '../core/types.ts';

export interface AnalysisProgress {phase:string; completed:number; total?:number}
export interface AnalysisIdentity {
  inputs:{id:string; sha256:string; bytes:number; resource?:string}[];
  algorithm:{id:string; version:string; integrity:string};
  models:{id:string; version:string; integrity:string}[];
  parameters:Json;
  runtime:{id:string; version:string; integrity:string; environment:Json;
    executor?:{id:string;version:string;environment:Json}};
  time?:Json;
}
export interface AnalysisArtifact<Output = unknown> {
  schemaVersion:1;
  kind:'frameweave.analysis-artifact';
  cacheKey:string;
  identity:Omit<AnalysisIdentity,'parameters'> & {parametersHash:string};
  createdAt:string;
  output:Output;
  files:{path:string; format:string; bytes:number; sha256:string}[];
}
export interface AnalysisContext {
  signal:AbortSignal;
  reportProgress(progress:AnalysisProgress):void;
  /** Register immediately after acquisition. Cleanup runs in reverse order on every path. */
  deferCleanup(name:string, release:()=>void|Promise<void>):void;
}
export interface AnalysisExecutionContext extends AnalysisContext {
  directory:string;
  cacheKey:string;
  identity:AnalysisIdentity;
}
/** Algorithm module, not a queue or a Stage. Only JSON is transported across the executor boundary. */
export interface AnalysisDefinition<Input, Output> {
  describe(input:Input, context:AnalysisContext):Promise<AnalysisIdentity>;
  execute(input:Input, context:AnalysisExecutionContext):Promise<{
    output:Output;
    files:{path:string; format:string}[];
  }>;
  validateOutput(value:unknown):void;
}
export const defineAnalysisTask = <I,O>(definition:AnalysisDefinition<I,O>):AnalysisDefinition<I,O> => definition;
export interface AnalysisCleanup {
  complete:boolean;
  resources:Record<string,boolean>;
  errors:Diagnostic[];
  stagingRemoved:boolean;
  processExited:boolean;
  forced:boolean;
}
export interface AnalysisResult<Output> {
  artifact:{directory:string; manifest:AnalysisArtifact<Output>};
  output:Output;
  cacheHit:boolean;
  publication:'cache'|'created'|'concurrent-winner';
  elapsedMs:number;
  cleanup:AnalysisCleanup;
}
export interface AnalysisExecutorContext {
  signal:AbortSignal;
  reportProgress(progress:AnalysisProgress):void;
  executionFinished():void;
  /** Required linearization point before publication / successful cache return. */
  beginCommit():boolean;
}
export interface AnalysisExecutor<Input,Output> {
  execute(input:Input, context:AnalysisExecutorContext):Promise<AnalysisResult<Output>>;
}
export type AnalysisState='created'|'running'|'cancelling'|'succeeded'|'failed'|'cancelled';
export interface AnalysisSnapshot<Output=unknown> {
  id:string;
  state:AnalysisState;
  phase:string;
  completed:number;
  total?:number;
  progress?:number;
  executionFinished:boolean;
  cleanupFinished:boolean;
  error?:Diagnostic;
  cleanup?:AnalysisCleanup;
  result?:AnalysisResult<Output>;
}
