import {EngineError} from '../../src/core/errors.ts';
import type {InferenceSource,InferenceDriver,InferenceExecution} from './types.ts';import {inferenceSource,inferenceAbort,inferenceError} from './schema.ts';import {selectInferenceProvider} from './providers.ts';
/** Reusable by CLI/MCP/analysis adapters; scheduling stays in the existing caller. */
export class InferenceSession<Tensor,Model>{
 private closed=false;private failed=false;private tail:Promise<unknown>=Promise.resolve();private closing?:Promise<void>;
 private constructor(readonly source:Readonly<InferenceSource>,private driver:InferenceDriver<Tensor,Model>,private model:Model,readonly selectedProvider:InferenceExecution['provider']){}
 static async create<T,M>(source:InferenceSource,driver:InferenceDriver<T,M>,signal?:AbortSignal){
  inferenceAbort(signal);const spec=inferenceSource(source),c=await driver.capabilities(signal),provider=selectInferenceProvider(c,spec.execution.provider,spec.execution.allowCpuFallback);inferenceAbort(signal);const model=await driver.load(spec,provider,signal);
  if(signal?.aborted){await driver.dispose(model);inferenceAbort(signal);}return new InferenceSession(spec,driver,model,provider);
 }
 run(inputs:Readonly<Record<string,Tensor>>,options:{signal?:AbortSignal}={}){
  if(this.closed||this.failed)return Promise.reject(new EngineError(this.closed?'E_INFERENCE_CLOSED':'E_INFERENCE_FAILED','Session is closed or failed; create a new session'));
  const names=inputs&&typeof inputs==='object'&&!Array.isArray(inputs)?Object.keys(inputs):[];if(!inputs||names.length!==this.source.inputs.length||this.source.inputs.some(t=>!Object.hasOwn(inputs,t.name)))return Promise.reject(new EngineError('E_INFERENCE_INPUTS','Exact named input set required'));
  let entered=false;const task=this.tail.then(async()=>{if(this.failed)inferenceError('E_INFERENCE_FAILED','Previous execution failed; recreate the session');inferenceAbort(options.signal);entered=true;const result=await this.driver.run(this.model,inputs,options.signal);inferenceAbort(options.signal);const e=result.execution;if(e.version!==1||e.provider!==this.selectedProvider||e.modelSha256!==this.source.model.sha256||e.precision!==this.source.execution.precision||!e.runtimeVerified||e.cpuFallback&&!this.source.execution.allowCpuFallback)inferenceError('E_INFERENCE_EXECUTION_IDENTITY','Driver execution contradicts admitted provider/model/precision/fallback policy');if(!result.outputs||typeof result.outputs!=='object'||Array.isArray(result.outputs)||Object.keys(result.outputs).length!==this.source.outputs.length||this.source.outputs.some(t=>!Object.hasOwn(result.outputs,t.name)))inferenceError('E_INFERENCE_OUTPUTS','Exact named output set required');return result;});this.tail=task.catch((error)=>{if(entered)this.failed=true;});return task;
 }
 dispose():Promise<void>{if(this.closing)return this.closing;this.closed=true;return this.closing=(async()=>{await this.tail;await this.driver.dispose(this.model);})();}
}
export * from './types.ts';export * from './schema.ts';export * from './providers.ts';
