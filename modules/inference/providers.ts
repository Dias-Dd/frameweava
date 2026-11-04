import type {InferenceCapabilities,InferenceProvider} from './types.ts';import {inferenceError} from './schema.ts';
/** Caller-visible policy, no second capability registry or remote discovery. */
export function selectInferenceProvider(c:InferenceCapabilities,requested:InferenceProvider|'auto',allowCpuFallback:boolean,preference:readonly InferenceProvider[]=['tensorrt','cuda','directml','coreml','openvino','migraphx','cpu']):InferenceProvider{
 if(c.version!==1)inferenceError('E_INFERENCE_VERSION','Unsupported inference capabilities version');
 const available=(p:InferenceProvider)=>c.providers.some(v=>v.provider===p&&v.status==='available');
 if(requested!=='auto'){if(requested==='cpu'&&!allowCpuFallback)inferenceError('E_INFERENCE_CPU_POLICY','CPU execution needs explicit permission');if(!available(requested))inferenceError('E_INFERENCE_PROVIDER_UNAVAILABLE',`${requested}: ${c.providers.find(v=>v.provider===requested)?.reason??'not present in the configured runtime'}`);return requested;}
 for(const p of preference)if((p!=='cpu'||allowCpuFallback)&&available(p))return p;
 return inferenceError('E_INFERENCE_PROVIDER_UNAVAILABLE','No compatible accelerated provider is available; CPU fallback has not been silently enabled');
}
