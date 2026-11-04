// Optional reviewed-local NVIDIA adapter. The existing native owner owns its
// lifetime, adapter identity, frame slots, shared leases and completion tickets.
#define NOMINMAX
#include <windows.h>
#include <d3d12.h>
#include <dxgi1_6.h>
#include <wrl/client.h>
#include <cuda.h>
#include <cuda_runtime_api.h>
#include <NvInfer.h>
#include <NvOnnxParser.h>
#include "../native-inference/bridge.h"
#ifdef FW_CUDA_ORT
#include "../native-inference/vendor/onnxruntime_c_api.h"
#include <fstream>
#endif
#include <map>
#include <vector>
#include <string>
#include <memory>
#include <stdexcept>
#include <algorithm>
#include <cstring>
#include <filesystem>
using Microsoft::WRL::ComPtr;
static thread_local std::string last_error;
static void hr(HRESULT h,const char* message){if(FAILED(h))throw std::runtime_error(message);}
static void cu(cudaError_t e){if(e!=cudaSuccess)throw std::runtime_error(std::string("CUDA: ")+cudaGetErrorString(e));}
static void require(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
struct Logger:nvinfer1::ILogger{std::string error;void log(Severity s,const char*m)noexcept override{if(s<=Severity::kERROR)error=m;}};
struct Owner;
#ifdef FW_OPTIX
struct FwOptixOwner;
#endif
struct Buffer{
 ComPtr<ID3D12Resource>resource;HANDLE shared=nullptr;cudaExternalMemory_t memory=nullptr;void*pointer=nullptr;uint64_t bytes=0,allocation=0;
 ~Buffer(){if(pointer)cudaFree(pointer);if(memory)cudaDestroyExternalMemory(memory);if(shared)CloseHandle(shared);}
};
struct Slot{
 ComPtr<ID3D12Fence>fence;HANDLE shared=nullptr;cudaExternalSemaphore_t semaphore=nullptr;std::vector<std::unique_ptr<Buffer>>buffers;
 std::unique_ptr<nvinfer1::IExecutionContext>context;
#ifdef FW_CUDA_ORT
 Owner*owner=nullptr;OrtIoBinding*binding=nullptr;std::vector<OrtValue*>values;
#endif
 ~Slot();
};
struct Spec{std::string name;std::vector<int64_t>shape;uint64_t bytes;};
struct Model{
 Owner*owner=nullptr;std::vector<Spec>specs;uint32_t inputs=0;uint64_t budget=0,executions=0;
 #ifdef FW_CUDA_ORT
 OrtSession*session=nullptr;OrtRunOptions*run=nullptr;bool profiled=false;std::string trace;std::filesystem::path profile;
#endif
 ~Model();
 std::unique_ptr<nvinfer1::IRuntime>runtime;std::unique_ptr<nvinfer1::ICudaEngine>engine;std::map<uint32_t,std::unique_ptr<Slot>>slots;
};
struct Owner{
 ComPtr<ID3D12Device>device;cudaStream_t stream=nullptr;int ordinal=-1;uint64_t luid=0;HMODULE trt=nullptr,parser=nullptr;
 #ifdef FW_CUDA_ORT
 HMODULE ort=nullptr;const OrtApi*api=nullptr;OrtEnv*env=nullptr;std::string runtime_version;
 void check(OrtStatus*s){if(s){std::string m=api->GetErrorMessage(s);api->ReleaseStatus(s);throw std::runtime_error(m);}}
#endif
 #ifdef FW_OPTIX
 std::shared_ptr<FwOptixOwner>optix;
#endif
 Logger logger;std::map<uint64_t,std::unique_ptr<Model>>models;std::vector<HMODULE>dependencies;
 ~Owner(){if(stream)cudaStreamSynchronize(stream);models.clear();
#ifdef FW_OPTIX
 optix.reset();
#endif
 if(stream)cudaStreamDestroy(stream);
#ifdef FW_CUDA_ORT
 if(env)api->ReleaseEnv(env);if(ort)FreeLibrary(ort);
#endif
 if(parser)FreeLibrary(parser);if(trt)FreeLibrary(trt);for(auto i=dependencies.rbegin();i!=dependencies.rend();++i)FreeLibrary(*i);}
};
Slot::~Slot(){
#ifdef FW_CUDA_ORT
 if(binding)owner->api->ReleaseIoBinding(binding);for(auto*v:values)owner->api->ReleaseValue(v);
#endif
 context.reset();buffers.clear();if(semaphore)cudaDestroyExternalSemaphore(semaphore);if(shared)CloseHandle(shared);}
Model::~Model(){slots.clear();
#ifdef FW_CUDA_ORT
 if(run)owner->api->ReleaseRunOptions(run);if(session)owner->api->ReleaseSession(session);
#endif
}
static std::map<uint64_t,std::unique_ptr<Owner>>owners;
static Owner&owner(uint64_t id){auto i=owners.find(id);if(i==owners.end())throw std::runtime_error("stale NVIDIA owner");return *i->second;}
static Model&model(uint64_t id){for(auto&o:owners){auto m=o.second->models.find(id);if(m!=o.second->models.end())return *m->second;}throw std::runtime_error("stale NVIDIA model");}
static HMODULE library(const std::filesystem::path&file){auto m=LoadLibraryExW(file.c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);if(!m)throw std::runtime_error("reviewed NVIDIA runtime DLL unavailable: "+file.filename().string());return m;}
static std::unique_ptr<Buffer> shared_tensor(Owner&o,uint64_t bytes){auto b=std::make_unique<Buffer>();b->bytes=(bytes+255)/256*256;D3D12_HEAP_PROPERTIES heap={};heap.Type=D3D12_HEAP_TYPE_DEFAULT;D3D12_RESOURCE_DESC d={};d.Dimension=D3D12_RESOURCE_DIMENSION_BUFFER;d.Width=b->bytes;d.Height=d.DepthOrArraySize=d.MipLevels=d.SampleDesc.Count=1;d.Layout=D3D12_TEXTURE_LAYOUT_ROW_MAJOR;d.Flags=D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS;
  hr(o.device->CreateCommittedResource(&heap,D3D12_HEAP_FLAG_SHARED,&d,D3D12_RESOURCE_STATE_COMMON,nullptr,IID_PPV_ARGS(&b->resource)),"shared CUDA tensor allocation");b->allocation=o.device->GetResourceAllocationInfo(0,1,&d).SizeInBytes;hr(o.device->CreateSharedHandle(b->resource.Get(),nullptr,GENERIC_ALL,nullptr,&b->shared),"CUDA tensor handle");
  cudaExternalMemoryHandleDesc memory={};memory.type=cudaExternalMemoryHandleTypeD3D12Resource;memory.handle.win32.handle=b->shared;memory.size=b->allocation;memory.flags=cudaExternalMemoryDedicated;cu(cudaImportExternalMemory(&b->memory,&memory));cudaExternalMemoryBufferDesc range={};range.size=b->bytes;cu(cudaExternalMemoryGetMappedBuffer(&b->pointer,b->memory,&range));return b;}
#ifdef FW_OPTIX
#include "optix.inc"
#endif
extern "C" uint64_t fw_inference_open(const wchar_t*directory,uint64_t luid){try{
 auto o=std::make_unique<Owner>();o->luid=luid;int count=0;require(cuInit(0)==CUDA_SUCCESS,"CUDA driver initialization failed");cu(cudaGetDeviceCount(&count));
 for(int i=0;i<count;i++){char bytes[8];unsigned int mask=0;require(cuDeviceGetLuid(bytes,&mask,i)==CUDA_SUCCESS,"CUDA device LUID query failed");uint64_t id;memcpy(&id,bytes,8);if(id==luid){o->ordinal=i;break;}}
 require(o->ordinal>=0,"CUDA adapter LUID differs from existing native owner");cu(cudaSetDevice(o->ordinal));cu(cudaStreamCreateWithFlags(&o->stream,cudaStreamNonBlocking));
 ComPtr<IDXGIFactory4>factory;hr(CreateDXGIFactory1(IID_PPV_ARGS(&factory)),"DXGI factory");LUID id;memcpy(&id,&luid,8);ComPtr<IDXGIAdapter1>a;hr(factory->EnumAdapterByLuid(id,IID_PPV_ARGS(&a)),"same LUID adapter");hr(D3D12CreateDevice(a.Get(),D3D_FEATURE_LEVEL_12_0,IID_PPV_ARGS(&o->device)),"shared tensor D3D12 device");
 const auto root=std::filesystem::path(directory);
#ifdef FW_OPTIX
 o->optix=fw_create_optix(*o,root);
#elif defined(FW_CUDA_ORT)
 for(const auto*name:{L"cudnn64_9.dll",L"cudnn_adv64_9.dll",L"cudnn_cnn64_9.dll",L"cudnn_engines_precompiled64_9.dll",L"cudnn_engines_runtime_compiled64_9.dll",L"cudnn_engines_tensor_ir64_9.dll",L"cudnn_ext64_9.dll",L"cudnn_graph64_9.dll",L"cudnn_heuristic64_9.dll",L"cudnn_ops64_9.dll"})o->dependencies.push_back(library(root/name));o->ort=library(root/L"onnxruntime.dll");using Get=const OrtApiBase*(ORT_API_CALL*)();auto get=(Get)GetProcAddress(o->ort,"OrtGetApiBase");require(bool(get),"ORT API entry missing");o->runtime_version=get()->GetVersionString();o->api=get()->GetApi(ORT_API_VERSION);require(bool(o->api),"ORT API23 unavailable");o->check(o->api->CreateEnv(ORT_LOGGING_LEVEL_ERROR,"frameweave/cuda",&o->env));
#else
 o->trt=library(root/L"nvinfer_11.dll");o->parser=library(root/L"nvonnxparser_11.dll");o->dependencies.push_back(library(root/L"nvinfer_builder_resource_sm120_11.dll"));o->dependencies.push_back(library(root/L"nvinfer_builder_resource_ptx_11.dll"));
#endif
 uint64_t handle=(uint64_t)o.get();owners.emplace(handle,std::move(o));return handle;
 }catch(const std::exception&e){last_error=e.what();return 0;}}
extern "C" int fw_inference_close(uint64_t id){return owners.erase(id)?0:-1;}
extern "C" uint64_t fw_inference_model(uint64_t id,const uint8_t*onnx,uint64_t bytes,const FwTensor*inputs,uint32_t ni,const FwTensor*outputs,uint32_t no,const wchar_t*profile){try{
 auto&o=owner(id);
#ifdef FW_OPTIX
 throw std::runtime_error("OptiX runtime does not admit inference models");
#endif
 cu(cudaSetDevice(o.ordinal));auto m=std::make_unique<Model>();m->owner=&o;m->inputs=ni;
 for(auto pair:{std::make_pair(inputs,ni),std::make_pair(outputs,no)})for(uint32_t i=0;i<pair.second;i++){const auto&t=pair.first[i];require(t.rank>0&&t.bytes>0&&t.bytes%4==0,"invalid static F32 tensor");m->specs.push_back({t.name,{t.shape,t.shape+t.rank},t.bytes});}
#ifdef FW_CUDA_ORT
 OrtSessionOptions*options=nullptr;o.check(o.api->CreateSessionOptions(&options));OrtCUDAProviderOptionsV2*cuda=nullptr;
 try{o.check(o.api->CreateCUDAProviderOptions(&cuda));std::string ordinal=std::to_string(o.ordinal);const char*keys[]={"device_id","do_copy_in_default_stream","use_tf32","enable_cuda_graph","cudnn_conv_use_max_workspace"};const char*values[]={ordinal.c_str(),"1","0","0","0"};o.check(o.api->UpdateCUDAProviderOptions(cuda,keys,values,5));o.check(o.api->UpdateCUDAProviderOptionsWithValue(cuda,"user_compute_stream",o.stream));o.check(o.api->SessionOptionsAppendExecutionProvider_CUDA_V2(options,cuda));o.api->ReleaseCUDAProviderOptions(cuda);cuda=nullptr;o.check(o.api->AddSessionConfigEntry(options,"session.disable_cpu_ep_fallback","1"));o.check(o.api->EnableProfiling(options,profile));m->profile=profile;o.check(o.api->CreateSessionFromArray(o.env,onnx,size_t(bytes),options,&m->session));o.api->ReleaseSessionOptions(options);options=nullptr;size_t actualInputs=0,actualOutputs=0;o.check(o.api->SessionGetInputCount(m->session,&actualInputs));o.check(o.api->SessionGetOutputCount(m->session,&actualOutputs));require(actualInputs==ni&&actualOutputs==no,"CUDA model tensor count mismatch");OrtAllocator*allocator=nullptr;o.check(o.api->GetAllocatorWithDefaultOptions(&allocator));for(size_t i=0;i<m->specs.size();i++){char*name=nullptr;OrtTypeInfo*info=nullptr;const size_t j=i<ni?i:i-ni;if(i<ni){o.check(o.api->SessionGetInputName(m->session,j,allocator,&name));o.check(o.api->SessionGetInputTypeInfo(m->session,j,&info));}else{o.check(o.api->SessionGetOutputName(m->session,j,allocator,&name));o.check(o.api->SessionGetOutputTypeInfo(m->session,j,&info));}const std::string actual(name);allocator->Free(allocator,name);const OrtTensorTypeAndShapeInfo*tensor=nullptr;auto status=o.api->CastTypeInfoToTensorInfo(info,&tensor);if(status){o.api->ReleaseTypeInfo(info);o.check(status);}ONNXTensorElementDataType type;o.check(o.api->GetTensorElementType(tensor,&type));size_t rank=0;o.check(o.api->GetDimensionsCount(tensor,&rank));std::vector<int64_t>dims(rank);o.check(o.api->GetDimensions(tensor,dims.data(),rank));o.api->ReleaseTypeInfo(info);require(actual==m->specs[i].name&&type==ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT&&rank==m->specs[i].shape.size(),"CUDA model tensor type/rank/name mismatch");for(size_t k=0;k<rank;k++)require(dims[k]<=0||dims[k]==m->specs[i].shape[k],"CUDA model static shape mismatch");}o.check(o.api->CreateRunOptions(&m->run));o.check(o.api->AddRunConfigEntry(m->run,"disable_synchronize_execution_providers","1"));}
 catch(...){if(cuda)o.api->ReleaseCUDAProviderOptions(cuda);if(options)o.api->ReleaseSessionOptions(options);throw;}
#else
 using BuilderFn=void*(*)(void*,int);using RuntimeFn=void*(*)(void*,int);using ParserFn=void*(*)(void*,void*,int);
 const auto makeBuilder=(BuilderFn)GetProcAddress(o.trt,"createInferBuilder_INTERNAL");const auto makeRuntime=(RuntimeFn)GetProcAddress(o.trt,"createInferRuntime_INTERNAL");const auto makeParser=(ParserFn)GetProcAddress(o.parser,"createNvOnnxParser_INTERNAL");require(makeBuilder&&makeRuntime&&makeParser,"TensorRT factory ABI unavailable");
 std::unique_ptr<nvinfer1::IBuilder>b((nvinfer1::IBuilder*)makeBuilder(&o.logger,NV_TENSORRT_VERSION));if(!b)throw std::runtime_error("TensorRT builder creation: "+o.logger.error);
 std::unique_ptr<nvinfer1::INetworkDefinition>network(b->createNetworkV2(0));require(bool(network),"TensorRT network creation failed");std::unique_ptr<nvonnxparser::IParser>parser((nvonnxparser::IParser*)makeParser(network.get(),&o.logger,NV_ONNX_PARSER_VERSION));require(bool(parser),"ONNX parser factory failed");
 if(!parser->parse(onnx,size_t(bytes)))throw std::runtime_error("TensorRT ONNX parse: "+o.logger.error);
 require(network->getNbInputs()==int(ni)&&network->getNbOutputs()==int(no),"TensorRT tensor count differs from declared contract");
 for(size_t i=0;i<m->specs.size();i++){auto*t=i<ni?network->getInput(int(i)):network->getOutput(int(i-ni));auto&s=m->specs[i];auto dims=t->getDimensions();require(t->getType()==nvinfer1::DataType::kFLOAT&&s.name==t->getName()&&dims.nbDims==int(s.shape.size()),"TensorRT tensor name/type/rank mismatch");for(int j=0;j<dims.nbDims;j++){require(dims.d[j]<=0||dims.d[j]==s.shape[j],"TensorRT tensor static shape mismatch");dims.d[j]=s.shape[j];}if(i<ni)t->setDimensions(dims);}
 std::unique_ptr<nvinfer1::IBuilderConfig>config(b->createBuilderConfig());require(bool(config),"TensorRT builder config failed");config->clearFlag(nvinfer1::BuilderFlag::kTF32);
 std::unique_ptr<nvinfer1::IHostMemory>plan(b->buildSerializedNetwork(*network,*config));if(!plan)throw std::runtime_error("TensorRT F32 engine build: "+o.logger.error);
 m->runtime.reset((nvinfer1::IRuntime*)makeRuntime(&o.logger,NV_TENSORRT_VERSION));require(bool(m->runtime),"TensorRT runtime creation failed");m->engine.reset(m->runtime->deserializeCudaEngine(plan->data(),plan->size()));require(bool(m->engine),"TensorRT engine deserialization failed");for(const auto&s:m->specs){auto dims=m->engine->getTensorShape(s.name.c_str());require(dims.nbDims==int(s.shape.size())&&m->engine->getTensorDataType(s.name.c_str())==nvinfer1::DataType::kFLOAT,"TensorRT engine tensor type/rank mismatch");for(int j=0;j<dims.nbDims;j++)require(dims.d[j]==s.shape[j],"TensorRT specialized engine output shape mismatch");}
#endif
 const auto handle=(uint64_t)m.get();o.models.emplace(handle,std::move(m));return handle;
 }catch(const std::exception&e){last_error=e.what();return 0;}}
static Slot&slot(Model&m,uint32_t id){auto&entry=m.slots[id];if(entry)return *entry;auto&o=*m.owner;cu(cudaSetDevice(o.ordinal));auto s=std::make_unique<Slot>();
 hr(o.device->CreateFence(0,D3D12_FENCE_FLAG_SHARED,IID_PPV_ARGS(&s->fence)),"shared CUDA fence");hr(o.device->CreateSharedHandle(s->fence.Get(),nullptr,GENERIC_ALL,nullptr,&s->shared),"shared CUDA fence handle");
 cudaExternalSemaphoreHandleDesc semaphore={};semaphore.type=cudaExternalSemaphoreHandleTypeD3D12Fence;semaphore.handle.win32.handle=s->shared;cu(cudaImportExternalSemaphore(&s->semaphore,&semaphore));
 #ifdef FW_CUDA_ORT
 s->owner=&o;o.check(o.api->CreateIoBinding(m.session,&s->binding));
#else
 s->context.reset(m.engine->createExecutionContext());require(bool(s->context),"TensorRT slot context creation failed");
#endif
 for(const auto&t:m.specs){auto b=shared_tensor(o,t.bytes);
#ifdef FW_CUDA_ORT
 OrtMemoryInfo*ortMemory=nullptr;o.check(o.api->CreateMemoryInfo("Cuda",OrtDeviceAllocator,o.ordinal,OrtMemTypeDefault,&ortMemory));OrtValue*value=nullptr;auto status=o.api->CreateTensorWithDataAsOrtValue(ortMemory,b->pointer,size_t(t.bytes),t.shape.data(),t.shape.size(),ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&value);o.api->ReleaseMemoryInfo(ortMemory);o.check(status);s->values.push_back(value);if(s->values.size()<=m.inputs)o.check(o.api->BindInput(s->binding,t.name.c_str(),value));else o.check(o.api->BindOutput(s->binding,t.name.c_str(),value));
#else
 require(s->context->setTensorAddress(t.name.c_str(),b->pointer),"TensorRT tensor address binding failed");
#endif
s->buffers.push_back(std::move(b));
 }
 entry=std::move(s);return *entry;}
extern "C" int fw_inference_tensor(uint64_t id,uint32_t frame,uint32_t tensor,FwTensorLease*out){try{auto&m=model(id);auto&s=slot(m,frame);require(tensor<s.buffers.size(),"unknown CUDA tensor binding");auto&b=*s.buffers[tensor];*out={1,0,b.bytes,b.allocation,(uintptr_t)b.shared,(uintptr_t)s.shared};return 0;}catch(const std::exception&e){last_error=e.what();return -1;}}
extern "C" int fw_inference_run(uint64_t id,uint32_t frame,uint64_t wait,uint64_t ready){try{auto&m=model(id);auto&o=*m.owner;cu(cudaSetDevice(o.ordinal));auto&s=slot(m,frame);require(ready>wait,"invalid CUDA fence sequence");cudaExternalSemaphoreWaitParams w={};w.params.fence.value=wait;cu(cudaWaitExternalSemaphoresAsync(&s.semaphore,&w,1,o.stream));
#ifdef FW_CUDA_ORT
 o.check(o.api->RunWithBinding(m.session,m.run,s.binding));
#else
 require(s.context->enqueueV3(o.stream),"TensorRT F32 enqueue failed");
#endif
cudaExternalSemaphoreSignalParams r={};r.params.fence.value=ready;cu(cudaSignalExternalSemaphoresAsync(&s.semaphore,&r,1,o.stream));m.executions++;
#ifdef FW_CUDA_ORT
 if(!m.profiled){OrtAllocator*a=nullptr;o.check(o.api->GetAllocatorWithDefaultOptions(&a));char*path=nullptr;o.check(o.api->SessionEndProfiling(m.session,a,&path));std::ifstream input(std::filesystem::u8path(path),std::ios::binary);m.trace.assign(std::istreambuf_iterator<char>(input),{});input.close();std::filesystem::remove(std::filesystem::u8path(path));a->Free(a,path);m.profiled=true;}
#endif
 return 0;}catch(const std::exception&e){last_error=e.what();return -1;}}
extern "C" int fw_inference_release_model(uint64_t id){try{for(auto&o:owners)if(o.second->models.count(id)){cu(cudaSetDevice(o.second->ordinal));cu(cudaStreamSynchronize(o.second->stream));o.second->models.erase(id);return 0;}return -1;}catch(const std::exception&e){last_error=e.what();return -1;}
}
extern "C" int fw_inference_slots(uint64_t id,uint32_t count){try{auto&m=model(id);if(m.slots.lower_bound(count)!=m.slots.end()){cu(cudaSetDevice(m.owner->ordinal));cu(cudaStreamSynchronize(m.owner->stream));m.slots.erase(m.slots.lower_bound(count),m.slots.end());}return 0;}catch(const std::exception&e){last_error=e.what();return -1;}}
static uint32_t json(const std::string&text,char*out,uint32_t size){if(out&&size>=text.size())memcpy(out,text.data(),text.size());return uint32_t(text.size());}
extern "C" uint32_t fw_inference_profile(uint64_t id,char*out,uint32_t size){try{
#ifdef FW_CUDA_ORT
 auto&m=model(id);return json(m.trace,out,size);
#else
 model(id);return json("[{\"args\":{\"provider\":\"TensorRTNative\"}}]",out,size);
#endif
}catch(...){return UINT32_MAX;}}
extern "C" uint32_t fw_inference_info(uint64_t id,char*out,uint32_t size){try{auto&o=owner(id);int runtime=0;cu(cudaRuntimeGetVersion(&runtime));
#ifdef FW_CUDA_ORT
 std::string version=o.runtime_version;
#elif defined(FW_OPTIX)
 std::string version="OptiX-9.1.0";
#else
 std::string version="TensorRT-11.4.0.106";
#endif
 return json("{\"version\":1,\"runtimeVersion\":\""+version+"\",\"cudaRuntimeVersion\":"+std::to_string(runtime)+",\"cudaDevice\":"+std::to_string(o.ordinal)+",\"tf32\":false,\"float16\":false}",out,size);}catch(...){return UINT32_MAX;}}
extern "C" uint32_t fw_inference_error(char*out,uint32_t size){auto n=std::min(size,uint32_t(last_error.size()));memcpy(out,last_error.data(),n);return n;}
