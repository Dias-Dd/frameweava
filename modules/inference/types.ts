/** Backend-neutral, versioned model/tensor contracts. No native pointers or API objects. */
export const INFERENCE_VERSION=1 as const;
export const inferenceProviders=['directml','cuda','tensorrt','coreml','openvino','migraphx','cpu'] as const;
export type InferenceProvider=typeof inferenceProviders[number];
export type TensorDType='float32'|'float16'|'int32'|'int64';
export interface TensorDescription {
 name:string;dtype:TensorDType;shape:readonly number[];
 /** Storage order only. Color/normalization belong to explicit pre/postprocessing. */
 layout:'NCHW'|'NHWC'|'NC'|'linear';semantic?:string;
}
export interface InferenceSource {
 version:1;id:string;model:{resource:string;sha256:string;bytes:number};
 inputs:readonly TensorDescription[];outputs:readonly TensorDescription[];
 execution:{provider:InferenceProvider|'auto';allowCpuFallback:boolean;precision:'float32';temporal:'stateless'};
}
export interface ProviderStatus {
 provider:InferenceProvider;status:'available'|'unavailable'|'not-probed';reason?:string;
 /** Eligibility is not a successful model execution. */
 runtimeVerified:boolean;transfer:'resident'|'host-explicit'|'unavailable';
 device?:{id:string;name:string;kind:'gpu'|'npu'|'cpu'};
}
export interface InferenceCapabilities {version:1;runtime:{id:string;version:string};providers:readonly ProviderStatus[]}
export interface InferenceExecution {
 version:1;provider:InferenceProvider;modelSha256:string;runtimeVerified:boolean;
 device:{id:string;name:string;kind:'gpu'|'npu'|'cpu'};
 precision:'float32';transfer:'resident'|'host-explicit';cpuFallback:boolean;
}
/** Engine data handles may be GPU tensors; host arrays must use a distinct driver. */
export interface InferenceDriver<Tensor,Model> {
 capabilities(signal?:AbortSignal):Promise<InferenceCapabilities>;
 load(source:Readonly<InferenceSource>,provider:InferenceProvider,signal?:AbortSignal):Promise<Model>;
 run(model:Model,inputs:Readonly<Record<string,Tensor>>,signal?:AbortSignal):Promise<{outputs:Record<string,Tensor>;execution:InferenceExecution}>;
 dispose(model:Model):void|Promise<void>;
}
