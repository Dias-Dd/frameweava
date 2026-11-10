import type {NativePortPacket} from '../stage-orchestration/native-port-types.ts';
import {inputValueMatches} from '../../src/core/ports.ts';
import {exrSelection} from '../../src/media/exr-selection.ts';
import {fontGlyphResource} from './font-image.ts';
import {binaryResource,nanoIndexLayout,deepBufferLayout,type NativeBufferResource,type NativeResourceBuffer} from './binary-resource.ts';
import type {NativeRayGeometry,NativeRayScene,NativeRaySceneOptions,NativeRayRequest,NativeRayDefinition} from './rays.ts';
import {inferenceSource,tensorBytes} from '../inference/schema.ts';
import type {InferenceSource} from '../inference/types.ts';
import type {NativeInferenceModel,NativeInferenceRunOptions} from '../inference/native.ts';
import type {GpuPixelScope,GpuPixelKernelSource,GpuPixelImageInfo,GpuPixelImage,GpuPixelKernel,GpuPixelRunOptions} from '../gpu-effects/pixel-types.ts';
import type {GpuComputeKernelSource,GpuComputeKernel,GpuDataBuffer,GpuDataInfo,GpuWords,GpuBufferDescriptor,GpuFieldDescriptor,GpuDispatchOptions} from '../gpu-effects/compute-types.ts';
import {validatePixelKernel,nativePixelShader,pixelHeaderWordCount,samePixelColor} from '../gpu-effects/pixel-shader.ts';
import {nativePixelInfo,nativeTextureInfo} from './image-info.ts';
import {computeSource,fieldInfo,bufferInfo,checkWords,bufferRange,dispatchPlan,computeAbort} from '../gpu-effects/compute-contract.ts';
import {nativeComputeShader,computeHeaderVectors} from '../gpu-effects/compute-shader.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {NativeProgram} from './client.ts';
import {nativeMeshShader,nativeTexturedMeshShader,nativeMeshRasterShader} from './mesh-shader.ts';
import {nativeColorShader,nativeColorParameters,type NativeColorConversion} from './color.ts';
import type {NativeGpuScope,NativeMeshOptions} from './authoring.ts';
import {registerNativeScope,revokeNativeScope,registerNativeLeaseRetirement,type NativeScopeEvidence} from './provenance.ts';
import {nativeModuleSource,nativeModuleParameters,MODULE_PARAMETER_WORDS,type NativeModule,type NativeModuleSource,type NativeModuleRunOptions} from './module.ts';
import {linear709} from '../../src/media/surface.ts';
import type {NativeStateDefinition,NativeStateStep} from './state.ts';
import type {NativeBufferOutput} from './data-output.ts';
import type {NativeImageResource,NativeResource} from './resources.ts';
import {pixelsFromSurface,type ProfessionalSurface} from '../../src/media/surface.ts';

function fail(message:string):never{throw new EngineError('E_NATIVE_SCOPE',message);}
const noJSON=():never=>fail('GPU resources are owner-local; publish a named native output');
const bits=(data:Float32Array|Uint32Array|Int32Array)=>Array.from(new Uint32Array(data.buffer,data.byteOffset,data.length));
const alpha=(i:GpuPixelImageInfo)=>i.alpha==='premultiplied'?0:i.alpha==='straight'?1:2;
function dataHeader(header:number[],offset:number,info:GpuDataInfo){header.splice(offset,12,...info.dimensions,info.components,...info.origin,0,...info.domain,0);}
async function digest(source:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(source))))).map(v=>v.toString(16).padStart(2,'0')).join('');}

/** Shared engine recording adapter. It owns no second device. Existing effect
 * functions emit the same pixel/compute contracts; the native owner executes
 * the admitted WGSL. No browser rasterization or per-frame image transfer. */
export class NativeRecordingScope {
 private kernelTokens=new WeakMap<object,{index:number;pixel?:GpuPixelKernelSource;compute?:GpuComputeKernelSource}>();
 private compiled=new Map<string,Promise<GpuPixelKernel|GpuComputeKernel>>();
 private imageTokens=new Map<object,number>();private bufferTokens=new Map<object,{index:number;info:GpuDataInfo}>();
 private kernels:NativeProgram['kernels']=[];private images:GpuPixelImageInfo[]=[];private data:NonNullable<NativeProgram['data']>=[];
 private passes:NativeProgram['passes']=[];private parameters:number[][]=[];private failed=false;private disposed=false;
 private output?:number;
 private external:Record<number,number>={};
 private retiredInitializationBuffer=false;
 private checkpointing=false;
 private residentUsed=false;private residentSerial=0;private residentRecords=new Map<GpuDataBuffer,NonNullable<NativeProgram['data']>[number]>();private residentSent=new Set<string>();private retiredResidents=new WeakSet<object>();private residentBytes=0;
 private initialData:NonNullable<NativeProgram['data']>=[];private initialBuffers=new Map<object,{index:number;info:GpuDataInfo}>();private sentSeeds=new Set<number>();private sentKernels=0;
 private moduleWordKernels=new Map<string,number>();
 private modules:NativeModuleSource[]=[];private moduleTokens=new Map<object,{index:number;kernel:number}>();private sentModules=0;
 private inferences:Readonly<InferenceSource>[]=[];private inferenceTokens=new WeakMap<object,{index:number;kernel:number}>();
 private rayTokens=new Map<object,NativeRaySceneOptions>();private initialRayTokens=new Map<object,NativeRaySceneOptions>();private rayBuilds=new Map<object,number>();private rayKernels=new Map<string,number>();
 private frameEpoch=0;private temporalTransaction:any;
 private initializing=true;private stateIds=new Set<string>();private stateKernels=new Map<number,number>();
 private bufferOutputs:NativeBufferOutput[]=[];
 private colorKernel?:number;
 private inlineUploads=0;private inlineUploadBytes=0;
 private resourceBuffers:{buffer:number;source:NativeBufferResource}[]=[];private initialResourceBuffers:{buffer:number;source:NativeBufferResource}[]=[];
 private resourceImages:{image:number;source:NativeResource}[]=[];
 readonly api:NativeGpuScope;
 constructor(evidence?:NativeScopeEvidence,private onStateSegment?:(packet:ReturnType<NativeRecordingScope['packet']>)=>Promise<void>,private residentBudget=Number.MAX_SAFE_INTEGER){this.api={
  compile:s=>this.compile(s),run:(k,i,o)=>this.run(k,i,o),drawMesh:o=>this.drawMesh(o),convertColor:(i,o)=>this.convertColor(i,o),
  createRayScene:o=>this.createRayScene(o),traceRayScene:(s,o)=>this.traceRayScene(s,o),releaseRayScene:async s=>{this.temporalAllowed();this.check();if(!this.rayTokens.delete(s))fail('Foreign or released ray scene');this.initialRayTokens.delete(s);},
  createInference:s=>this.createInference(s),runInference:(m,i,o)=>this.runInference(m,i,o),releaseInference:async m=>{this.temporalAllowed();this.check();if(!this.inferenceTokens.delete(m))fail('Foreign or released inference model');},
  createModule:s=>this.createModule(s),runModule:(m,i,o)=>this.runModule(m,i,o),releaseModule:async m=>{this.temporalAllowed();this.check();if(!this.moduleTokens.delete(m))fail('Foreign or released native module');},
  createResidentBuffer:(d,v)=>this.resident(bufferInfo(d),v),createResidentField:(d,v)=>this.resident(fieldInfo(d),v),
  replaceResidentBuffer:async(b,v)=>{this.check();if(!this.residentRecords.has(b))throw new EngineError('E_NATIVE_RESIDENT_SCOPE','Replace requires a live resident buffer from this scope');const out=await this.resident(this.buffer(b).info,v);this.dropBuffer(b);return out;},
  createBuffer:(d,v)=>this.allocate(bufferInfo(d),v),createField:(d,v)=>this.allocate(fieldInfo(d),v),
  writeBuffer:(b,v,o)=>this.write(b,v,o),clearBuffer:(b,r)=>this.clear(b,r),copyBuffer:(s,t,r)=>this.copy(s,t,r),
  cloneBuffer:async b=>{const d=this.buffer(b),{readOnly:_r,...info}=d.info,out=await this.allocate(info);await this.copy(b,out);return out;},
  releaseBuffer:async b=>{this.temporalMutable('buffer',b);if(this.retiredResidents.has(b))return;this.dropBuffer(b);},
  compileCompute:s=>this.compileCompute(s),dispatch:(k,b,o)=>this.dispatch(k,b,o),
  imageToBuffer:(i,o)=>this.imageToBuffer(i,o),
  importResource:(s,o)=>this.importResource(s,o),importBufferResource:(s,o)=>this.importBufferResource(s,o),
  createStateBuffer:(d,v,s)=>this.createState(bufferInfo(d),v,s),createStateField:(d,v,s)=>this.createState(fieldInfo(d),v,s),stateStep:(b,o)=>this.stateStep(b,o),
  publishBuffer:async(id,b,o)=>{this.temporalAllowed();this.check();const value=this.buffer(b);if(!o||o.version!==1||Object.keys(o).length!==1||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)||this.bufferOutputs.some(v=>v.id===id))fail('Expected a unique named buffer publication v1');this.bufferOutputs.push({version:1,id,buffer:value.index,info:value.info});},
  release:async i=>{this.temporalMutable('image',i);this.image(i);this.imageTokens.delete(i);},
      flushState:async o=>{this.check();computeAbort(o?.signal);if(!o||o.version!==1||Object.keys(o).some(k=>!['version','signal'].includes(k)))fail('Expected state flush v1');if(this.initializing||this.temporalTransaction)throw new EngineError('E_NATIVE_SEGMENT_PROFILE','State flush requires ordinary frame execution, outside temporal windows');if(!this.passes.length)return;if(!this.onStateSegment)throw new EngineError('E_NATIVE_SEGMENT_UNAVAILABLE','This recorder has no Core state continuation');await this.onStateSegment(this.packet(false));this.passes=[];this.parameters=[];computeAbort(o.signal);},
    complete:async o=>{computeAbort(o?.signal);this.check();},
  readback:async()=>fail('CPU image readback is an explicit export operation, unavailable inside a native effect'),
  readBuffer:async()=>fail('CPU buffer readback is unavailable in a resident effect; connect the buffer to compute, pixel ABI2 or native drawMesh'),
  upload:(s,o)=>this.upload(s,o),present:async()=>fail('The native renderer owns presentation'),
  stats:()=>({residentBuffers:{version:1,live:this.residentRecords.size,bytes:this.residentBytes},stateSegmentEligible:!this.modules.length&&!this.rayTokens.size&&!this.passes.some(p=>p.draw!==undefined),version:1,backend:'native-wgpu',uploads:this.inlineUploads,uploadBytes:this.inlineUploadBytes,runs:this.passes.length,submissions:0,readbacks:0,readbackBytes:0,validationReadbackBytes:0,pendingPasses:this.passes.length,activeImages:this.images.length,liveBytes:0,peakOwnedBytes:0,buffersCreated:this.data.length,buffersDestroyed:0,reusedBuffers:0,compiledKernels:this.kernels.length,failed:this.failed,disposed:this.disposed,physicalGpuMemoryBytes:null,activeDataBuffers:this.data.length,bufferUploadBytes:0,bufferReadbacks:0,bufferReadbackBytes:0,queryReadbackBytes:0,presentations:0}),
  capabilities:()=>evidence?.capabilities??({version:1,backend:'native-wgpu',execution:'recording',hardwareVerified:false,pixelKernelAbis:[1,2],computeKernelAbis:[1],storageTypes:['f32','u32','i32'],maxPendingPasses:Number.MAX_SAFE_INTEGER,maxKernels:Number.MAX_SAFE_INTEGER,f16WorkingBytesPerPixel:16,crossStageGpuHandles:false,profiling:'disabled',limits:{maxBufferSize:1024**3,maxStorageBufferBindingSize:1024**3,maxStorageBuffersPerShaderStage:8,maxUniformBufferBindingSize:65536,maxComputeWorkgroupsPerDimension:0xffffffff,maxComputeInvocationsPerWorkgroup:1024,maxComputeWorkgroupSizeX:1024,maxComputeWorkgroupSizeY:1024,maxComputeWorkgroupSizeZ:64,maxComputeWorkgroupStorageSize:32768}}),
  timings:()=>({status:'unavailable',reason:'GPU timing is reported by the native owner'} as unknown as ReturnType<GpuPixelScope['timings']>),
  dispose:async()=>{this.temporalAllowed();this.disposed=true;this.residentRecords.clear();this.residentSent.clear();this.residentBytes=0;revokeNativeScope(this.api);this.images=[];this.imageTokens.clear();this.bufferTokens.clear();this.data=[];this.initialData=[];this.initialBuffers.clear();this.sentSeeds.clear();this.passes=[];this.parameters=[];this.compiled.clear();this.modules=[];this.moduleTokens.clear();this.rayTokens.clear();this.initialRayTokens.clear();this.rayBuilds.clear();this.rayKernels.clear();this.inferences=[];this.inferenceTokens=new WeakMap();this.stateIds.clear();this.stateKernels.clear();this.bufferOutputs=[];this.resourceImages=[];this.resourceBuffers=[];this.initialResourceBuffers=[];},
 };registerNativeLeaseRetirement(this.api,(kind,value)=>this.retireTemporalLeaseResource(kind,value));if(evidence)evidence=registerNativeScope(this.api,evidence);
 }
 private rayPermission(){this.check();const cap=(this.api.capabilities() as any).nativeRayQuery;if(cap&&!cap.enabled)throw new EngineError('E_NATIVE_RAY_PERMISSION','Hardware ray query requires operator opt-in and a qualified Vulkan adapter',{hint:'Use nativeGpu.rayQuery:true / --allow-ray-query explicitly'});}
 private async createRayScene(o:NativeRaySceneOptions):Promise<NativeRayScene>{
  this.temporalAllowed();this.rayPermission();if(!o||o.version!==1||o.invalidGeometry!=='discard'||!Array.isArray(o.geometries)||!o.geometries.length||o.backend!==undefined&&!['vulkan','optix'].includes(o.backend)||o.quality!==undefined&&!['trace','build'].includes(o.quality)||Object.keys(o).some(k=>!['version','geometries','invalidGeometry','quality','backend'].includes(k)))throw new EngineError('E_NATIVE_RAY_SCHEMA','Expected opaque-triangles scene v1 and explicit discard-invalid policy');
  const geometries=o.geometries.map((g:NativeRayGeometry,i:number)=>{if(!g||typeof g!=='object'||Array.isArray(g))throw new EngineError('E_NATIVE_RAY_GEOMETRY','Triangle geometry object required');const p=this.buffer(g.positions),ix=g.indices?this.buffer(g.indices):undefined,count=g.count??(ix?.info.length??p.info.length/3),transform=Array.from(g.transform??[1,0,0,0,0,1,0,0,0,0,1,0]),mask=g.mask??255,id=g.id??i;
   if(Object.keys(g).some(k=>!['positions','indices','count','transform','mask','id'].includes(k))||p.info.type!=='f32'||p.info.components!==3||ix&&ix.info.type!=='u32'||!Number.isSafeInteger(count)||count<3||count%3||count>(ix?.info.length??p.info.length/3)||transform.length!==12||transform.some(v=>typeof v!=='number'||!Number.isFinite(Math.fround(v)))||!Number.isInteger(mask)||mask<0||mask>255||!Number.isInteger(id)||id<0||id>0xffffff)throw new EngineError('E_NATIVE_RAY_GEOMETRY','Expected owned XYZ vertices, optional u32 indices, triangles and a finite row-major 3x4 transform');return{...g,count,transform,mask,id};});
  const token=Object.freeze({info:Object.freeze({version:1 as const,geometries:geometries.length,profile:'opaque-triangles-v1' as const,backend:o.backend??'vulkan'}),toJSON:noJSON});this.rayTokens.set(token,{...o,geometries});return token;
 }
 private async traceRayScene(scene:NativeRayScene,o:NativeRayRequest){
  this.temporalAllowed();this.rayPermission();if(!o||typeof o!=='object')throw new EngineError('E_NATIVE_RAY_INPUT','Ray request required');computeAbort(o?.signal);const spec=this.rayTokens.get(scene);if(!spec)fail('Foreign or released ray scene');if(this.initializing)fail('Trace rays inside renderAt');const origins=this.buffer(o.origins),directions=this.buffer(o.directions),count=o.count??Math.min(origins.info.length,directions.info.length)/3,tMin=Math.fround(o.tMin??.0001),tMax=Math.fround(o.tMax??1e6),mask=o.mask??255;
  if(o.version!==1||Object.keys(o).some(k=>!['version','origins','directions','count','tMin','tMax','mask','signal','output','coverage'].includes(k))||origins.info.type!=='f32'||directions.info.type!=='f32'||origins.info.components!==3||directions.info.components!==3||!Number.isSafeInteger(count)||count<1||count*3>Math.min(origins.info.length,directions.info.length)||o.tMin!==undefined&&typeof o.tMin!=='number'||o.tMax!==undefined&&typeof o.tMax!=='number'||!Number.isFinite(tMin)||!Number.isFinite(tMax)||tMin<0||tMax<=tMin||!Number.isInteger(mask)||mask<0||mask>255)throw new EngineError('E_NATIVE_RAY_INPUT','Ray v1 requires XYZ origins/directions, positive count and finite distance interval/mask');
  if(o.output!==undefined){
   if(!o.output||typeof o.output!=='object'||Object.keys(o.output).some(k=>!['hits','measurements','normals'].includes(k)))throw new EngineError('E_NATIVE_RAY_OUTPUT','Expected three writable ray result buffers');
   const targets=[o.output.hits,o.output.measurements,o.output.normals].map(b=>this.bufferTokens.get(b));
   const seen=new Set([origins.index,directions.index]);
   for(const [i,target]of targets.entries()){
    const d=target&&this.data[target.index];
    if(!target||!d||target.info.type!==(i===0?'u32':'f32')||target.info.length!==count*4||target.info.readOnly||d.immutable||d.persistent||d.sourceImage!==undefined||seen.has(target.index))throw new EngineError('E_NATIVE_RAY_OUTPUT','Expected distinct frame-local u32/f32/f32 outputs with four words per ray');
    seen.add(target.index);
   }
  }
  const coverage=o.coverage;
  let alpha: number[]=[];
  if(coverage!==undefined && (!coverage||typeof coverage!=='object'))
    throw new EngineError('E_NATIVE_RAY_COVERAGE','Expected material coverage object');
  if(coverage) {
   if(spec.backend==='optix')throw new EngineError('E_NATIVE_RAY_COVERAGE','Material coverage requires the Vulkan query backend');
   if(![1,2].includes(coverage.version)||Object.keys(coverage).some(k=>!['version','layout','texels','seed'].includes(k))||
     coverage.seed!==undefined&&(!Number.isInteger(coverage.seed)||coverage.seed<0||coverage.seed>0xffffffff))
    throw new EngineError('E_NATIVE_RAY_COVERAGE','Expected material coverage v1/v2 with a UInt32 seed');
   const layout=this.buffer(coverage.layout),texels=this.buffer(coverage.texels);
   if(layout.info.type!=='u32'||!['f32','u32'].includes(texels.info.type)||texels.info.length%4!==0||
      spec.geometries.some(g=>layout.info.length<1+(g.id!+1)*(coverage.version===2?16:14)))
    throw new EngineError('E_NATIVE_RAY_COVERAGE','Material coverage requires complete versioned instance records and RGBA texels');
   alpha=[layout.index,texels.index];
  }
  const kernel=(kind:'ray-build'|'ray-query')=>{let n=this.rayKernels.get(kind);if(n===undefined){n=this.kernels.push({kind,code:'// engine-owned opaque hardware ray profile v1',inputCount:0,parameterWords:0,headerWords:16})-1;this.rayKernels.set(kind,n);}return n;};let build=this.rayBuilds.get(scene);
  if(build===undefined){const transform=await this.allocate(bufferInfo({type:'f32',length:spec.geometries.length*12}),Float32Array.from(spec.geometries.flatMap(g=>Array.from(g.transform!)))),definition:NativeRayDefinition={version:1,...spec.backend?{backend:spec.backend}:{},quality:spec.quality??'trace',invalidGeometry:'discard',transforms:this.buffer(transform).index,geometries:spec.geometries.map(g=>({positions:this.buffer(g.positions).index,...g.indices?{indices:this.buffer(g.indices).index}:{},count:g.count!,mask:g.mask!,id:g.id!}))};build=this.passes.length;this.passes.push({kernel:kernel('ray-build'),inputs:[],output:0,header:Array(16).fill(0),rayBuild:definition,buffers:definition.geometries.flatMap(g=>g.indices===undefined?[g.positions]:[g.positions,g.indices])});this.parameters.push([]);this.rayBuilds.set(scene,build);}
  const field=(type:'f32'|'u32',channels:string[])=>this.allocate(fieldInfo({type,dimensions:[count,1,1],components:4,semantic:'generic',channels,metadata:{profile:'native-ray-query-v1',space:'world'}}));const hits=o.output?.hits??await field('u32',['hit','instance','primitive','status']),measurements=o.output?.measurements??await field('f32',['distance','barycentricU','barycentricV','reserved']),normals=o.output?.normals??await field('f32',['normalX','normalY','normalZ','frontFace']);const header=[count,...bits(Float32Array.of(tMin,tMax)),mask,...Array(12).fill(0)];
  const written=[hits,measurements,normals].map(b=>this.buffer(b).index);
  if(alpha.some(index=>written.includes(index)))throw new EngineError('E_NATIVE_RAY_OUTPUT','Coverage inputs cannot alias ray outputs');
  if(coverage){header[4]=coverage.version;header[5]=coverage.seed??0;}
  this.passes.push({kernel:kernel('ray-query'),inputs:[],output:0,header,rayQuery:build,buffers:[origins.index,directions.index,...written,...alpha]});this.parameters.push([]);this.invalidateRayBuilds(written);return{version:1 as const,count,hits,measurements,normals};
 }
 private invalidateRayBuilds(written: readonly number[]){
  if(!this.rayBuilds.size||!written.length)return;
  for(const scene of this.rayBuilds.keys()){
   const spec=this.rayTokens.get(scene);
   if(!spec||spec.geometries.some(g=>[g.positions,g.indices].some(b=>{
    const index=b&&this.bufferTokens.get(b)?.index;
    return index!==undefined&&written.includes(index);
   })))this.rayBuilds.delete(scene);
  }
 }
 private async createInference(source:InferenceSource):Promise<NativeInferenceModel>{
  this.check();if(!this.initializing)fail('Create model sessions during Stage initialization');const spec=inferenceSource(source);if([...spec.inputs,...spec.outputs].some(t=>t.dtype!=='float32'))throw new EngineError('E_INFERENCE_DTYPE','Resident inference v1 requires explicit float32 tensors');
  const index=this.inferences.push(spec)-1,kernel=this.kernels.push({kind:'inference',code:'// engine-owned inference pass v1',inputCount:0,parameterWords:0,headerWords:16})-1;const token=Object.freeze({info:spec,toJSON:noJSON}) as NativeInferenceModel;this.inferenceTokens.set(token,{index,kernel});return token;
 }
 private async runInference(model:NativeInferenceModel,inputs:Readonly<Record<string,GpuDataBuffer>>,options:NativeInferenceRunOptions={}):Promise<Record<string,GpuDataBuffer>>{this.temporalAllowed();
  this.check();if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['outputs','signal'].includes(k)))throw new EngineError('E_INFERENCE_OPTIONS','Expected outputs/signal inference options');computeAbort(options.signal);const token=this.inferenceTokens.get(model);if(!token)fail('Foreign or released inference model');const spec=this.inferences[token.index];if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.keys(inputs).length!==spec.inputs.length||spec.inputs.some(t=>!Object.hasOwn(inputs,t.name)))throw new EngineError('E_INFERENCE_INPUTS','Exact named model inputs required');
  const ids=spec.inputs.map(t=>{const b=this.buffer(inputs[t.name]);if(b.info.type!=='f32'||b.info.length*4!==tensorBytes(t))throw new EngineError('E_INFERENCE_SHAPE','Tensor buffer dtype/length differs from model contract');return b.index;});
  const requested=options.outputs,outputs:Record<string,GpuDataBuffer>=Object.create(null);
  if(requested!==undefined){
   if(!requested||typeof requested!=='object'||Array.isArray(requested)||Object.keys(requested).length!==spec.outputs.length||spec.outputs.some(t=>!Object.hasOwn(requested,t.name)))throw new EngineError('E_INFERENCE_OUTPUTS','Exact named model outputs required');
   const seen=new Set(ids),targets=spec.outputs.map(t=>{const buffer=requested[t.name],b=this.buffer(buffer),d=this.data[b.index];if(b.info.type!=='f32'||b.info.length*4!==tensorBytes(t))throw new EngineError('E_INFERENCE_SHAPE','Output dtype/length differs from model contract');if(d.immutable||d.sourceImage!==undefined||d.sourceResource||b.info.readOnly||seen.has(b.index))throw new EngineError('E_INFERENCE_OUTPUTS','Outputs require distinct writable owner-local buffers without input aliasing');seen.add(b.index);return buffer;});
   for(let i=0;i<targets.length;i++){outputs[spec.outputs[i].name]=targets[i];ids.push(this.buffer(targets[i]).index);}
  }else for(const t of spec.outputs){const b=await this.allocate(bufferInfo({type:'f32',length:tensorBytes(t)/4}));outputs[t.name]=b;ids.push(this.buffer(b).index);}
  this.passes.push({kernel:token.kernel,inference:token.index,inputs:[],output:0,buffers:ids,header:Array(16).fill(0)});this.parameters.push([]);this.invalidateRayBuilds(ids.slice(spec.inputs.length));return outputs;
 }

 private async createModule(source:NativeModuleSource):Promise<NativeModule>{
  this.temporalAllowed();this.check();const spec=nativeModuleSource(source);
  const index=this.modules.push(spec)-1,kernel=this.kernels.push({kind:'module',code:'// engine-owned native module extension v1',inputCount:Number(spec.input),parameterWords:MODULE_PARAMETER_WORDS,headerWords:32})-1;
  const token=Object.freeze({info:spec,toJSON:noJSON}) as NativeModule;this.moduleTokens.set(token,{index,kernel});return token;
 }
 private async runModule(module:NativeModule,inputs:readonly GpuPixelImage[],options:NativeModuleRunOptions):Promise<GpuPixelImage>{this.temporalAllowed();
  this.check();computeAbort(options.signal);const token=this.moduleTokens.get(module);if(!token)fail('Foreign or released native module');const spec=this.modules[token.index];
  if(inputs.length!==Number(spec.input))fail('Native module input count mismatch');const ids=inputs.map(i=>this.image(i));
  if(inputs.some(i=>i.info.width!==spec.width||i.info.height!==spec.height||!samePixelColor(i.info.color,linear709)))fail('Servo SDR8 boundary needs matching dimensions and explicit scene-linear Rec.709; convert upstream explicitly');
  const info=this.imageInfo({width:spec.width,height:spec.height,format:'rgba32float',alpha:'premultiplied',color:linear709}),header=Array<number>(32).fill(0);header.splice(0,4,info.width,info.height,0,0);
  inputs.forEach((v,i)=>header.splice(4*(i+1),4,v.info.width,v.info.height,alpha(v.info),0));
  const parameters=nativeModuleParameters(options),output=this.images.push(info)-1;let kernel=token.kernel;if(parameters.length!==this.kernels[kernel].parameterWords){const key=token.index+":"+parameters.length,known=this.moduleWordKernels.get(key);kernel=known??this.kernels.push({...this.kernels[token.kernel],parameterWords:parameters.length})-1;this.moduleWordKernels.set(key,kernel);}this.passes.push({kernel,module:token.index,inputs:ids,output,header});this.parameters.push(parameters);
  const image=Object.freeze({info,toJSON:noJSON}) as GpuPixelImage;this.imageTokens.set(image,output);this.output=output;return image;
 }
 async drawMesh(o:NativeMeshOptions):Promise<GpuPixelImage>{
  this.check();const positions=this.buffer(o.positions),indices=o.indices?this.buffer(o.indices):undefined,info=this.imageInfo(o.output);
  if(positions.info.type!=='f32'||positions.info.components!==3||positions.info.semantic!=='position'||indices&&indices.info.type!=='u32')fail('Mesh requires explicit f32 XYZ positions and optional u32 indices');
  const count=o.count??(indices?.info.length??positions.info.length/3),matrix=o.matrix??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],color=o.color??[1,1,1,1];
  if(!Number.isInteger(count)||count<3||count%3||count>(indices?.info.length??positions.info.length/3)||matrix.length!==16||matrix.some(v=>!Number.isFinite(v))||color.length!==4||color.some(v=>!Number.isFinite(v))||color[3]<0||color[3]>1)fail('Invalid triangle count, transform or HDR color');
  const t=o.texture,uv=t?this.buffer(t.uvs):undefined,texture=t?this.image(t.image):undefined;
  const addresses=['clamp','repeat','mirror','transparent'];
  if(t&&(t.version!==1||Object.keys(t).some(k=>!['version','image','uvs','filter','addressU','addressV'].includes(k))||!['nearest','linear'].includes(t.filter??'linear')||!addresses.includes(t.addressU??'clamp')||!addresses.includes(t.addressV??'clamp')||uv!.info.type!=='f32'||uv!.info.components!==2||uv!.info.length/2<(indices?positions.info.length/3:count)||!samePixelColor(t.image.info.color,info.color)||info.alpha==='opaque'))fail('Texture v1 requires owner-local f32 UV pairs, matching scene-linear color and straight/premultiplied output');
  const raster=o.raster,mode=raster?.mode,modeId=mode==='cutout'?1:mode==='source-over'?2:mode==='depth-peel'?3:0;
  if(raster&&(raster.version!==1||!modeId||Object.keys(raster).some(k=>!['version','mode',...mode==='cutout'?['alphaCutoff']:mode==='source-over'?['order']:[]].includes(k))||mode==='source-over'&&raster.order!=='back-to-front'||mode==='cutout'&&(!Number.isFinite(raster.alphaCutoff??.5)||(raster.alphaCutoff??.5)<0||(raster.alphaCutoff??.5)>1)||info.alpha==='opaque'))fail('Expected raster v1 with explicit Alpha and back-to-front order for source-over');
  nativeTextureInfo(info,this.api.capabilities());
  if(mode==='source-over'&&this.api.capabilities().nativeMesh?.float32Blendable===false)throw new EngineError('E_NATIVE_MESH_CAPABILITY','F32 hardware blending unavailable; use explicit GPU depth-peel');
  const key='mesh:'+info.format+':'+Number(!!t)+':'+(mode??'replace');let compiled=this.compiled.get(key);if(!compiled){compiled=Promise.resolve().then(()=>{const index=this.kernels.push({kind:'mesh',replayImage:'whole-output-v1',code:mode?nativeMeshRasterShader(!!t,mode):t?nativeTexturedMeshShader:nativeMeshShader,inputCount:Number(!!t),parameterWords:20,headerWords:32,targetFormat:info.format,...mode?{meshMode:mode}:{}})-1,token=Object.freeze({}) as GpuPixelKernel;this.kernelTokens.set(token,{index});return token;});this.compiled.set(key,compiled);}
  const token=await compiled,header=Array<number>(32).fill(0);header.splice(0,4,info.width,info.height,Number(info.format==='rgba16float'),alpha(info));
  if(t){header.splice(4,7,t.image.info.width,t.image.info.height,alpha(t.image.info),Number((t.filter??'linear')==='linear'),addresses.indexOf(t.addressU??'clamp'),addresses.indexOf(t.addressV??'clamp'),1);}
  header[11]=modeId;header[13]=new Uint32Array(Float32Array.of(mode==='cutout'?raster!.alphaCutoff??.5:0).buffer)[0];
  const output=this.images.push(info)-1;this.passes.push({kernel:this.kernelTokens.get(token)!.index,inputs:texture===undefined?[]:[texture],output,header,draw:{positions:positions.index,...indices?{indices:indices.index}:{},...uv?{uvs:uv.index,textureVersion:1 as const}:{},count}});this.parameters.push(bits(new Float32Array([...matrix,...color])));
  const image=Object.freeze({info,toJSON:noJSON}) as GpuPixelImage;this.imageTokens.set(image,output);this.output=output;return image;
 }
 private async convertColor(image:GpuPixelImage,o:NativeColorConversion):Promise<GpuPixelImage>{
  this.check();computeAbort(o?.signal);const input=this.image(image);
  if(!o||o.version!==1||Object.keys(o).some(k=>!['version','color','format','signal'].includes(k)))fail('Expected explicit color conversion v1');
  const info=this.imageInfo({...image.info,color:o.color,format:o.format??image.info.format}),parameters=nativeColorParameters(image.info.color,info.color);
  if(this.colorKernel===undefined)this.colorKernel=this.kernels.push({kind:'color',replayImage:'whole-output-v1',code:nativeColorShader,inputCount:1,parameterWords:20,headerWords:32})-1;
  const header=Array<number>(32).fill(0);header.splice(0,4,info.width,info.height,Number(info.format==='rgba16float'),alpha(info));header.splice(4,4,image.info.width,image.info.height,alpha(image.info),0);
  const output=this.images.push(info)-1;this.passes.push({kernel:this.colorKernel,inputs:[input],output,header});this.parameters.push(bits(parameters));
  const result=Object.freeze({info,toJSON:noJSON}) as GpuPixelImage;this.imageTokens.set(result,output);this.output=output;return result;
 }
 private imageInfo(info:Omit<GpuPixelImageInfo,'version'>){return nativePixelInfo(info,this.api.capabilities());}
 private check(){this.assertNotCheckpointing();if(this.disposed||this.failed)fail('Recording scope is closed');}
 private image(i:GpuPixelImage){this.check();const n=this.imageTokens.get(i);if(n===undefined)fail('Foreign, released or stale native image');return n;}
 private buffer(b:GpuDataBuffer){this.check();const d=this.bufferTokens.get(b);if(!d)fail('Foreign, released or stale native data buffer');return d;}
 private async compile(s:GpuPixelKernelSource){
  this.check();const source=validatePixelKernel(s,true),key='pixel:'+JSON.stringify(source);let p=this.compiled.get(key);
  if(!p){p=(async()=>{const sha256=await digest(source),{code,...info}=source,index=this.kernels.push({replayImage:'whole-output-v1',code:nativePixelShader(source),inputCount:source.inputCount,parameterWords:source.parameterWords,headerWords:pixelHeaderWordCount(source)})-1;
   const token=Object.freeze({info:Object.freeze({...info,sha256}),toJSON:noJSON}) as GpuPixelKernel;this.kernelTokens.set(token,{index,pixel:source});return token;})();this.compiled.set(key,p);}
  return await p as GpuPixelKernel;
 }
 private async run(k:GpuPixelKernel,inputs:readonly GpuPixelImage[],o:GpuPixelRunOptions={}){
  this.check();computeAbort(o.signal);const kernel=this.kernelTokens.get(k),s=kernel?.pixel;if(!kernel||!s)fail('Foreign pixel kernel');
  if(inputs.length!==s.inputCount||(o.data?.length??0)!==(s.abiVersion===2?s.dataInputs.length:0))fail('Native pixel binding count mismatch');
  const info=this.imageInfo({...inputs[0]?.info,...o.output} as GpuPixelImageInfo),ids=inputs.map(i=>this.image(i)),buffers=(o.data??[]).map((d,i)=>{const b=this.buffer(d);if(s.abiVersion!==2||b.info.type!==s.dataInputs[i].type)fail('Pixel data binding type mismatch');return b;});
  if(inputs.some(i=>!samePixelColor(i.info.color,info.color)))fail('Native inputs require explicit color conversion');
  const header=Array<number>(pixelHeaderWordCount(s)).fill(0);header.splice(0,4,info.width,info.height,Number(info.format==='rgba16float'),alpha(info));
  inputs.forEach((v,i)=>header.splice(4*(i+1),4,v.info.width,v.info.height,alpha(v.info),0));buffers.forEach((b,i)=>dataHeader(header,24+12*i,b.info));
  const p=o.parameters??new Uint32Array(s.parameterWords);if(p.length!==s.parameterWords)fail('Pixel parameter count mismatch');
  const output=this.images.push(info)-1;this.passes.push({kernel:kernel.index,inputs:ids,output,header,...buffers.length?{data:buffers.map(b=>b.index)}:{}});this.parameters.push(bits(p));
  const image=Object.freeze({info,toJSON:noJSON}) as GpuPixelImage;this.imageTokens.set(image,output);this.output=output;return image;
 }
 private async compileCompute(source:GpuComputeKernelSource){
  this.check();const s=computeSource(source,true),key='compute:'+JSON.stringify(s);let p=this.compiled.get(key);
  if(!p){p=(async()=>{const {code,...info}=s,sha256=await digest(s),index=this.kernels.push({kind:'compute',code:nativeComputeShader(s),inputCount:s.bindings.length,parameterWords:s.parameterWords,headerWords:computeHeaderVectors(s.bindings.length)*4})-1;
   const token=Object.freeze({info:Object.freeze({...info,sha256}),toJSON:noJSON}) as GpuComputeKernel;this.kernelTokens.set(token,{index,compute:s});return token;})();this.compiled.set(key,p);}
  return await p as GpuComputeKernel;
 }
 private dropBuffer(b:GpuDataBuffer){this.buffer(b);const resident=this.residentRecords.get(b);if(resident){this.residentBytes-=resident.length*4;this.residentRecords.delete(b);this.retiredResidents.add(b);}this.bufferTokens.delete(b);if(this.initialBuffers.delete(b))this.retiredInitializationBuffer=true;}
 private async resident(input:GpuDataInfo,values:GpuWords){
  this.check();if(this.temporalTransaction)throw new EngineError('E_NATIVE_RESIDENT_SCOPE','Create resident geometry outside temporal sampling windows');
  if(this.api.capabilities().hardwareVerified&&!this.api.capabilities().nativeResidentBuffers)throw new EngineError('E_NATIVE_RESIDENT_UNAVAILABLE','This native owner does not support resident buffers; use a matching reviewed binary');
  checkWords(input,values);if(values.length!==input.length)throw new EngineError('E_NATIVE_RESIDENT_DATA','Resident buffers require a complete initial typed array');const bytes=input.length*4;if(this.residentBytes+bytes>this.residentBudget)throw new EngineError('E_NATIVE_RESIDENT_BUDGET','Live resident geometry exceeds the configured session byte budget');
  if(!Number.isSafeInteger(this.residentSerial+1))throw new EngineError('E_NATIVE_RESIDENT_BUDGET','Resident identity address space exhausted');
  const info=Object.freeze({...input,readOnly:true as const}),definition={length:info.length,type:info.type,initial:bits(values),immutable:true,resident:{version:1 as const,id:'r'+(++this.residentSerial)}},index=this.data.push(definition)-1,token=Object.freeze({info,toJSON:noJSON}) as GpuDataBuffer;
  this.bufferTokens.set(token,{index,info});this.residentUsed=true;this.residentRecords.set(token,definition);this.residentBytes+=bytes;return token;
 }
 private async allocate(info:GpuDataInfo,initial?:GpuWords){
  this.check();if(initial)checkWords(info,initial);const index=this.data.push({length:info.length,type:info.type,initial:initial?bits(initial):[]})-1;
  const token=Object.freeze({info,toJSON:noJSON}) as GpuDataBuffer;this.bufferTokens.set(token,{index,info});return token;
 }
 private async imageToBuffer(image:GpuPixelImage,options:{version:1;signal?:AbortSignal}){
  this.check();computeAbort(options?.signal);if(options?.version!==1||Object.keys(options).some(k=>!['version','signal'].includes(k)))fail('Expected image-to-buffer contract v1');
  const sourceImage=this.image(image),i=image.info;
  const info=Object.freeze({...fieldInfo({type:'f32',dimensions:[i.width,i.height,1],components:4,semantic:'generic',channels:['r','g','b','a'],metadata:{source:'surface-components',sourceVersion:1,format:i.format,alpha:i.alpha,color:{...i.color}}}),readOnly:true as const});
  const index=this.data.push({length:info.length,type:'f32',initial:[],sourceImage})-1,token=Object.freeze({info,toJSON:noJSON}) as GpuDataBuffer;this.bufferTokens.set(token,{index,info});return token;
 }
 private async importBufferResource(input:NativeBufferResource,options:{signal?:AbortSignal}={}):Promise<NativeResourceBuffer>{
  this.temporalAllowed();this.check();computeAbort(options.signal);const source=binaryResource(input),storageByteLength=source.profile==='deep-exr-indexed-v1'?deepBufferLayout(source).storageByteLength:source.profile==='nanovdb-float-indexed-v1'?nanoIndexLayout(source.bytes,source.maxRootTiles).storageByteLength:Math.ceil(source.byteLength/4)*4,info=Object.freeze({...bufferInfo({type:'u32',length:storageByteLength/4}),readOnly:true as const}),index=this.data.push({length:info.length,type:'u32',initial:[],immutable:true})-1,buffer=Object.freeze({info,toJSON:noJSON}) as GpuDataBuffer;this.bufferTokens.set(buffer,{index,info});this.resourceBuffers.push({buffer:index,source});return Object.freeze({version:1,buffer,sourceBytes:source.bytes,byteOffset:source.byteOffset,byteLength:source.byteLength,storageByteLength,access:'read-only',toJSON:noJSON});
 }
 private async importResource(source:NativeResource,options:{signal?:AbortSignal}={},temporal=false){if(!temporal)this.temporalAllowed();
  this.check();computeAbort(options.signal);if(source?.decode==='font-glyph-v1')source=fontGlyphResource(source);else if(!source||source.version!==1||(typeof source.id!=='string'||source.id.length<1||source.id.length>4096||source.id.includes('\0'))||!['surface-v2','icc-sdr','exr','video'].includes(source.decode)||Object.keys(source).some(k=>!['version','id','decode','output',...source.decode==='video'?['decoder','position','boundary','interpretation','metadataPolicy','cacheBytes']:source.decode==='exr'?['selection']:['missingProfile']].includes(k))||'missingProfile' in source&&source.missingProfile!==undefined&&!['error','assume-srgb'].includes(source.missingProfile))fail('Expected declared image resource v1');
  if(source.decode==='exr')source={...source,selection:exrSelection(source.selection)};
  if(source.decode==='video'&&(!['cpu','hardware'].includes(source.decoder)||!source.position||!['error','clamp','loop'].includes(source.boundary)||!['validate','override'].includes(source.metadataPolicy)||source.output.alpha!=='opaque'||source.cacheBytes!==undefined&&(!Number.isSafeInteger(source.cacheBytes)||source.cacheBytes<1)))fail('Explicit video decoder, time/boundary, colour policy and opaque output required');
  const info=this.imageInfo(source.output),{version:_v,...output}=info,index=this.images.push(info)-1,image=Object.freeze({info,toJSON:noJSON}) as GpuPixelImage;this.imageTokens.set(image,index);this.resourceImages.push({image:index,source:{...source,output}});this.output=index;return image;
 }
 private async upload(surface:ProfessionalSurface,options:{signal?:AbortSignal}={}){this.temporalAllowed();
  this.check();computeAbort(options.signal);if(surface.format!=='rgba16float'&&surface.format!=='rgba32float')fail('Inline import requires an explicit float Surface');const info=this.imageInfo({width:surface.width,height:surface.height,format:surface.format,alpha:surface.alpha,color:surface.color});
  const values=pixelsFromSurface(surface),data=await this.allocate(fieldInfo({type:'f32',dimensions:[info.width,info.height,1],components:4,semantic:'generic',metadata:{source:'explicit-cpu-value'}}),values);
  const kernel=await this.compile({abiVersion:2,id:'frameweave/native/inline-image',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let n=(p.y*outputSize().x+p.x)*4u;return vec4f(data0(n),data0(n+1u),data0(n+2u),data0(n+3u));}'});const image=await this.run(kernel,[],{data:[data],output:info});await this.api.releaseBuffer(data);this.inlineUploads++;this.inlineUploadBytes+=values.byteLength;return image;
 }
 private async createState(info:GpuDataInfo,initial:GpuWords|undefined,state:NativeStateDefinition){
  this.check();if(!this.initializing||!state||state.version!==1||!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(state.id)||Object.keys(state).some(k=>!['version','id'].includes(k))||this.stateIds.has(state.id))fail('Create uniquely named state v1 buffers once during initialization');
  const token=await this.allocate(info,initial),d=this.buffer(token);this.data[d.index].persistent={...state};this.stateIds.add(state.id);return token;
 }
 private async stateStep(buffers:readonly GpuDataBuffer[],options:NativeStateStep){this.temporalAllowed();
  this.check();computeAbort(options?.signal);if(!options||options.version!==1||Object.keys(options).some(k=>!['version','epoch','step','reset','signal'].includes(k))||![options.epoch,options.step].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)||options.reset!==undefined&&typeof options.reset!=='boolean'||!buffers.length||new Set(buffers).size!==buffers.length)fail('Expected bounded explicit state step v1');
  const ids=buffers.map(b=>this.buffer(b).index);if(ids.some(i=>!this.data[i].persistent))fail('State steps require explicit persistent leases');
  let kernel=this.stateKernels.get(ids.length);if(kernel===undefined){kernel=this.kernels.push({kind:'state',code:'// engine-owned state control v1',inputCount:ids.length,parameterWords:3,headerWords:16})-1;this.stateKernels.set(ids.length,kernel);}
  this.passes.push({kernel,inputs:[],output:0,header:Array(16).fill(0),buffers:ids,state:true});this.parameters.push([options.epoch,options.step,Number(options.reset===true)]);this.invalidateRayBuilds(ids);
 }
 private async dispatch(k:GpuComputeKernel,b:readonly GpuDataBuffer[],o:GpuDispatchOptions){
  this.check();const kernel=this.kernelTokens.get(k),s=kernel?.compute;if(!kernel||!s)fail('Foreign compute kernel');
  const bindings=b.map(v=>this.buffer(v));if(bindings.length!==s.bindings.length||bindings.some((v,i)=>v.info.type!==s.bindings[i].type))fail('Compute binding layout mismatch');
  if(this.temporalTransaction&&bindings.some((v,i)=>v.index<this.temporalTransaction.data&&s.bindings[i].access==='read_write'))throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Temporal windows cannot write pre-existing buffers');
  if(bindings.some((v,i)=>(this.data[v.index].immutable||v.info.readOnly)&&s.bindings[i].access==='read_write'))fail('Initialization buffers and image views are read-only; clone into a mutable frame buffer before dispatch');
  const plan=dispatchPlan(o,s.workgroupSize,{maxComputeWorkgroupsPerDimension:this.api.capabilities().limits.maxComputeWorkgroupsPerDimension}),header=Array<number>(computeHeaderVectors(bindings.length)*4).fill(0);
  header.splice(0,4,...plan.workItems,0);header.splice(4,4,...plan.origin,0);header.splice(8,4,...plan.domain,0);bindings.forEach((v,i)=>dataHeader(header,16+12*i,v.info));
  const p=o.parameters??new Uint32Array(s.parameterWords);if(p.length!==s.parameterWords)fail('Compute parameter count mismatch');
  this.invalidateRayBuilds(bindings.flatMap((v,i)=>s.bindings[i].access==='read_write'?[v.index]:[]));this.passes.push({kernel:kernel.index,inputs:[],output:0,buffers:bindings.map(v=>v.index),groups:plan.groups as [number,number,number],header});this.parameters.push(bits(p));
 }
 private async write(b:GpuDataBuffer,v:GpuWords,offset=0){
  this.temporalMutable('buffer',b);const d=this.buffer(b);checkWords(d.info,v,offset);
  if(this.data[d.index].immutable||d.info.readOnly)fail('Initialization data and image views are read-only');
  for(let start=0;start<v.length;start+=1000){const n=Math.min(1000,v.length-start),k=await this.compileCompute({abiVersion:1,id:'frameweave/native/write-'+n,version:'1.0.0',bindings:[{type:'u32',access:'read_write'}],parameterWords:n+1,workgroupSize:[64,1,1],code:'fn compute(g:vec3u,l:vec3u,w:vec3u){store0(paramU32(0u)+g.x,paramU32(g.x+1u));}'});
   // Raw bit writes preserve f32/i32, without changing the public buffer type.
   const header=Array<number>(28).fill(0);header.splice(0,4,n,1,1,0);header.splice(8,4,n,1,1,0);dataHeader(header,16,d.info);
   this.invalidateRayBuilds([d.index]);this.passes.push({kernel:this.kernelTokens.get(k)!.index,inputs:[],output:0,buffers:[d.index],groups:[Math.ceil(n/64),1,1],header});this.parameters.push([offset+start,...bits(v.subarray(start,start+n))]);
  }
 }
 /** Split utility operations at the actual device dispatch limit. Origins
  * preserve linear word addresses; bindings and public buffer ABI are unchanged. */
 private async bufferSpan(kernel:GpuComputeKernel,buffers:GpuDataBuffer[],length:number,parameters:Uint32Array,signal?:AbortSignal){
  const capabilities=this.api.capabilities();
  const groups=capabilities.hardwareVerified?capabilities.limits.maxComputeWorkgroupsPerDimension:Math.min(65535,capabilities.limits.maxComputeWorkgroupsPerDimension);
  const span=Math.min(0xffffffff,groups*64);
  for(let start=0;start<length;start+=span){
   computeAbort(signal);
   await this.dispatch(kernel,buffers,{workItems:[Math.min(span,length-start),1,1],origin:[start,0,0],domain:[length,1,1],parameters,signal});
  }
 }
 private async clear(b:GpuDataBuffer,r:{offset?:number;length?:number;signal?:AbortSignal}={}){
  computeAbort(r.signal);const d=this.buffer(b);if(this.data[d.index].immutable)fail('Initialization data is immutable');
  const range=bufferRange(d.info,r.offset,r.length),k=await this.compileCompute({abiVersion:1,id:'frameweave/native/clear-'+d.info.type,version:'1.0.0',bindings:[{type:d.info.type,access:'read_write'}],parameterWords:1,workgroupSize:[64,1,1],code:`fn compute(g:vec3u,l:vec3u,w:vec3u){store0(g.x+paramU32(0u),${d.info.type==='f32'?'0.':d.info.type==='i32'?'0':'0u'});}`});
  await this.bufferSpan(k,[b],range.length,new Uint32Array([range.offset]),r.signal);
 }
 private async copy(s:GpuDataBuffer,t:GpuDataBuffer,r:{sourceOffset?:number;targetOffset?:number;length?:number}={}){
  const a=this.buffer(s),b=this.buffer(t);if(a.info.type!==b.info.type||a.index===b.index)fail('Copy requires distinct buffers of the same type');
  const range=bufferRange(a.info,r.sourceOffset,r.length),target=bufferRange(b.info,r.targetOffset,range.length),k=await this.compileCompute({abiVersion:1,id:'frameweave/native/copy-'+a.info.type,version:'1.0.0',bindings:[{type:a.info.type,access:'read'},{type:b.info.type,access:'read_write'}],parameterWords:2,workgroupSize:[64,1,1],code:'fn compute(g:vec3u,l:vec3u,w:vec3u){store1(g.x+paramU32(1u),load0(g.x+paramU32(0u)));}'});
  await this.bufferSpan(k,[s,t],range.length,new Uint32Array([range.offset,target.offset]));
 }
 /** Core-only recorder transaction. Kernel compilation caches are intentionally retained. */
 private assertNotCheckpointing(){
  if(this.checkpointing)throw new EngineError('E_NATIVE_PREVIEW_CHECKPOINT_DATA','Checkpoint hooks cannot record or release GPU work');
 }
 async previewCheckpoint<T>(operation:()=>T|Promise<T>){
  this.check();
  if(this.residentUsed||this.retiredInitializationBuffer||this.modules.length||this.inferences.length)
   throw new EngineError('E_NATIVE_PREVIEW_CHECKPOINT_UNSUPPORTED','The Stage has resources outside the preview checkpoint contract');
  this.checkpointing=true;
  try{return await operation();}finally{this.checkpointing=false;}
 }
 temporalBranchCompatible(){return !this.initialData.some(d=>d.persistent)&&!this.bufferOutputs.length&&!this.modules.length;}
 temporalEpoch(){this.check();return this.frameEpoch;}
 private temporalAllowed(){this.assertNotCheckpointing();if(this.temporalTransaction)throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','History, modules, imports, publications and owner disposal are not temporal window operations');}
 private temporalMutable(kind:'image'|'buffer',value:object){const t=this.temporalTransaction;if(t&&(kind==='image'?t.images.has(value):t.buffers.has(value)))throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Temporal windows cannot release or write pre-existing allocations');}
 importTemporalResource(ticket:ReturnType<NativeRecordingScope['beginTemporalWindow']>,source:NativeResource){this.temporalTicket(ticket);return this.importResource(source,{},true);}
 beginTemporalWindow(){this.check();if(this.initializing||this.temporalTransaction)throw new EngineError('E_NATIVE_TEMPORAL_BUSY','Open a single temporal window during renderAt');const t={epoch:this.frameEpoch,imageCount:this.images.length,data:this.data.length,passes:this.passes.length,parameters:this.parameters.length,output:this.output,external:{...this.external},resourceImages:this.resourceImages.length,images:new Map(this.imageTokens),buffers:new Map(this.bufferTokens),rayBuilds:new Map(this.rayBuilds),sources:new Set<object>(),granted:new Set<object>()};this.temporalTransaction=t;return t;}
 private temporalTicket(t:any){this.check();if(t!==this.temporalTransaction||t.epoch!==this.frameEpoch)throw new EngineError('E_NATIVE_TEMPORAL_EPOCH','Foreign or expired temporal window');}
 temporalSourceImage(t:ReturnType<NativeRecordingScope['beginTemporalWindow']>,image:GpuPixelImage){this.temporalTicket(t);if(this.image(image)<t.imageCount||t.sources.has(image))throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Source must return a fresh window image');t.sources.add(image);}
 claimTemporalImage(t:ReturnType<NativeRecordingScope['beginTemporalWindow']>,image:GpuPixelImage){this.temporalTicket(t);this.image(image);if(!t.sources.has(image)||t.granted.has(image))throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Only fresh, not-yet-transferred source images may be granted');t.granted.add(image);}
 finishTemporalWindow(t:ReturnType<NativeRecordingScope['beginTemporalWindow']>,result?:GpuPixelImage){this.temporalTicket(t);if(result!==undefined){const index=this.image(result);if(index<t.imageCount)throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Window must return a fresh caller-owned result');for(const [image,n]of this.imageTokens)if(n>=t.imageCount&&image!==result)this.imageTokens.delete(image);for(const [buffer,v]of this.bufferTokens)if(v.index>=t.data)this.bufferTokens.delete(buffer);this.output=index;}else{this.images.length=t.imageCount;this.data.length=t.data;this.passes.length=t.passes;this.parameters.length=t.parameters;this.imageTokens=t.images;this.bufferTokens=t.buffers;this.rayBuilds=t.rayBuilds;this.output=t.output;this.external=t.external;this.resourceImages.length=t.resourceImages;}this.temporalTransaction=undefined;}
 /** Lease disposal is authoritative even while a recording window rolls back. */
 retireTemporalLeaseResource(kind:'image'|'buffer',value:object){if(kind==='image'){this.image(value as GpuPixelImage);this.imageTokens.delete(value);this.temporalTransaction?.images.delete(value);}else{this.dropBuffer(value as GpuDataBuffer);this.temporalTransaction?.buffers.delete(value);}}
 /** Frame resources are recreated logically, with stable compiled kernels. */
 sealInitialization(){this.check();if(this.passes.length||this.images.length)fail('Record GPU operations inside renderAt; initialization may compile kernels and create immutable input buffers');this.initializing=false;this.initialResourceBuffers=[...this.resourceBuffers];this.initialRayTokens=new Map(this.rayTokens);const indices=new Map<number,number>();this.initialData=[];for(let i=0;i<this.data.length;i++){const d=this.data[i];if(d.resident)continue;indices.set(i,this.initialData.length);this.initialData.push({...d,immutable:!d.persistent});}this.initialBuffers=new Map([...this.bufferTokens].filter(([b])=>!this.residentRecords.has(b as GpuDataBuffer)).map(([b,v])=>[b,{...v,index:indices.get(v.index)!}]));this.data=this.initialData;}

 initialSeedCount(){this.check();if(this.initializing)fail('Initialization must finish before declaring the seed prefix');return this.initialData.length;}
 beginFrame(){this.check();if(this.temporalTransaction)throw new EngineError('E_NATIVE_TEMPORAL_BUSY','Temporal window must finish before another frame');for(const i of this.sentSeeds)if(i>=this.initialData.length)this.sentSeeds.delete(i);const liveResidentIds=new Set([...this.residentRecords.values()].map(d=>d.resident!.id));for(const id of this.residentSent)if(!liveResidentIds.has(id))this.residentSent.delete(id);this.frameEpoch++;this.rayTokens=new Map(this.initialRayTokens);this.rayBuilds.clear();this.bufferOutputs=[];this.resourceImages=[];this.resourceBuffers=[...this.initialResourceBuffers];this.images=[];this.data=[...this.initialData];this.passes=[];this.parameters=[];this.imageTokens=new Map();this.bufferTokens=new Map(this.initialBuffers);for(const [token,d]of this.residentRecords){const index=this.data.push(d)-1;this.bufferTokens.set(token,{index,info:token.info});}this.output=undefined;this.external={};}
 importImage(info:GpuPixelImageInfo,producer:number){this.check();const metadata=this.imageInfo(info),index=this.images.push(metadata)-1,token=Object.freeze({info:metadata,toJSON:noJSON}) as GpuPixelImage;this.imageTokens.set(token,index);this.external[index]=producer;return token;}
 encodePorts(value:unknown):NativePortPacket {
  this.check();if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new EngineError('E_STAGE_CALL_PORTS','Ports must be a plain object');
  const ports:NativePortPacket={values:Object.create(null),images:Object.create(null)};
  for(const [name,item]of Object.entries(value)){if(!name)throw new EngineError('E_STAGE_CALL_PORTS','Empty port name');
   if(item&&typeof item==='object'&&this.imageTokens.has(item as GpuPixelImage)){const image=this.image(item as GpuPixelImage);ports.images[name]={image,info:this.images[image]};}
   else{if(!inputValueMatches('json',item))throw new EngineError('E_STAGE_CALL_PORTS','Expected finite JSON or an owned live GPU image');ports.values[name]=structuredClone(item) as import('../../src/core/types.ts').Json;}
  }return ports;
 }
 decodePorts(ports:NativePortPacket):import('../stage-orchestration/native-port-types.ts').NativeStagePorts {
  this.check();if(!ports||!ports.values||!ports.images||Object.keys(ports).some(k=>k!=='values'&&k!=='images'))throw new EngineError('E_STAGE_CALL_PROTOCOL','Invalid scoped port packet');
  const result:import('../stage-orchestration/native-port-types.ts').NativeStagePorts=Object.create(null);
  for(const [name,value]of Object.entries(ports.values)){if(Object.hasOwn(ports.images,name)||!inputValueMatches('json',value))throw new EngineError('E_STAGE_CALL_PROTOCOL','Invalid child data port');result[name]=structuredClone(value);}
  for(const [name,value]of Object.entries(ports.images)){if(!Number.isSafeInteger(value.image)||value.image<0)throw new EngineError('E_STAGE_CALL_PROTOCOL','Invalid child image grant');result[name]=this.importImage(value.info,value.image);}
  return result;
 }
 outputPorts(output:unknown):NativePortPacket {return output&&typeof output==='object'&&this.imageTokens.has(output as GpuPixelImage)?this.encodePorts({surface:output}):this.encodePorts(output);}
 takePacket(){const packet=this.packet(false);this.passes=[];this.parameters=[];return packet;}
 publish(image:GpuPixelImage){this.output=this.image(image);}
 packet(requireOutput=true,portOutputs?:NativePortPacket){this.check();if(requireOutput&&this.output===undefined)fail('Native frame must publish an image');const kernelOffset=this.sentKernels,kernels=this.kernels.slice(kernelOffset);this.sentKernels=this.kernels.length;const moduleOffset=this.sentModules,modules=this.modules.slice(moduleOffset);this.sentModules=this.modules.length;const data:(NonNullable<NativeProgram['data']>[number]&{seedOmitted?:boolean})[]=this.data.map((d,i)=>{if(d.resident){if(this.residentSent.has(d.resident.id))return {...d,initial:[],seedOmitted:true};this.residentSent.add(d.resident.id);return {...d};}if((d.immutable||d.persistent)&&this.sentSeeds.has(i))return {...d,initial:[],seedOmitted:true};if(d.immutable||d.persistent)this.sentSeeds.add(i);return {...d};});return {...this.residentUsed?{residentLive:[...this.residentRecords.values()].map(d=>d.resident!.id)}:{},...portOutputs?{portOutputs}:{},version:1 as const,images:this.images.map(({version:_v,...m})=>m),data,kernels,kernelOffset,passes:this.passes,parameters:this.parameters,output:this.output??(portOutputs?Object.values(portOutputs.images)[0]?.image:undefined)??0,external:this.external,...this.inferences.length?{inferences:this.inferences.map(s=>({...structuredClone(s),file:''}))}:{},...this.resourceBuffers.length?{resourceBuffers:[...this.resourceBuffers]}:{},...this.resourceImages.length?{resourceImages:[...this.resourceImages]}:{},...this.bufferOutputs.length?{bufferOutputs:[...this.bufferOutputs]}:{},...this.modules.length?{modules,moduleOffset}:{}};}
}
