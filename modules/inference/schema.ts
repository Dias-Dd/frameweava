import {EngineError} from '../../src/core/errors.ts';
import {inferenceProviders,type InferenceSource,type TensorDescription,type TensorDType} from './types.ts';
export function inferenceError(code:string,message:string):never{throw new EngineError(code,message);}
export function inferenceAbort(signal?:AbortSignal){if(signal?.aborted)inferenceError('E_INFERENCE_CANCELLED','Inference operation cancelled');}
function keys(v:object,allowed:readonly string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))inferenceError('E_INFERENCE_SCHEMA','Unknown inference contract field');}
const named=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!v.includes('\0');
const bytes:Record<TensorDType,number>={float32:4,float16:2,int32:4,int64:8};
export function tensorBytes(t:TensorDescription):number{
 if(!t||!named(t.name)||!Object.hasOwn(bytes,t.dtype)||!['NCHW','NHWC','NC','linear'].includes(t.layout)||!Array.isArray(t.shape))inferenceError('E_INFERENCE_SCHEMA','Invalid named tensor descriptor');
 keys(t,['name','dtype','shape','layout','semantic']);if(t.semantic!==undefined&&typeof t.semantic!=='string')inferenceError('E_INFERENCE_SCHEMA','Tensor semantic must be text');
 let count=1;for(const n of t.shape){if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(count*=n))inferenceError('E_INFERENCE_SHAPE','Tensor shape requires positive safe dimensions');}
 const size=count*bytes[t.dtype];if(!Number.isSafeInteger(size))inferenceError('E_INFERENCE_SHAPE','Tensor byte length is not a safe integer');return size;
}
export function inferenceSource(value:InferenceSource):Readonly<InferenceSource>{
 if(!value||value.version!==1||!named(value.id)||!value.model||!named(value.model.resource)||!/^([0-9a-f]{64})$/.test(value.model.sha256)||!Number.isSafeInteger(value.model.bytes)||value.model.bytes<1||!Array.isArray(value.inputs)||!value.inputs.length||!Array.isArray(value.outputs)||!value.outputs.length||!value.execution||![...inferenceProviders,'auto'].includes(value.execution.provider)||typeof value.execution.allowCpuFallback!=='boolean'||value.execution.precision!=='float32'||value.execution.temporal!=='stateless')inferenceError('E_INFERENCE_SCHEMA','Expected embedded-model inference source v1 with explicit provider, fallback, precision and temporal policy');
 keys(value,['version','id','model','inputs','outputs','execution']);keys(value.model,['resource','sha256','bytes']);keys(value.execution,['provider','allowCpuFallback','precision','temporal']);
 for(const list of [value.inputs,value.outputs]){const names=new Set<string>();for(const t of list){tensorBytes(t);if(names.has(t.name))inferenceError('E_INFERENCE_SCHEMA','Duplicate tensor name');names.add(t.name);}}
 const clone=structuredClone(value);for(const t of [...clone.inputs,...clone.outputs]){Object.freeze(t.shape);Object.freeze(t);}Object.freeze(clone.inputs);Object.freeze(clone.outputs);Object.freeze(clone.model);Object.freeze(clone.execution);return Object.freeze(clone);
}
