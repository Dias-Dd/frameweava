#include "bridge.h"
#define NOMINMAX
#include <windows.h>
#include <d3d12.h>
#include <dxgi1_6.h>
#include <wrl/client.h>
#include "vendor/dml_provider_factory.h"
#include <map>
#include <vector>
#include <memory>
#include <string>
#include <stdexcept>
#include <fstream>
#include <algorithm>
#include <cstdio>
#include <filesystem>
using Microsoft::WRL::ComPtr;
static thread_local std::string last_error;
static void hr(HRESULT h,const char*msg){if(FAILED(h)){char s[192];sprintf_s(s,"%s: HRESULT %08lx",msg,(unsigned long)h);throw std::runtime_error(s);}}
struct Owner;struct Model;
struct Tensor {
 Owner*owner=nullptr;ComPtr<ID3D12Resource>resource;HANDLE shared=nullptr;void*allocation=nullptr;OrtValue*value=nullptr;uint64_t bytes=0,allocation_bytes=0;
 ~Tensor();
};
struct Slot{
 Owner*owner=nullptr;ComPtr<ID3D12Fence>fence;HANDLE shared=nullptr;ComPtr<ID3D12CommandAllocator>before_allocator,after_allocator;ComPtr<ID3D12GraphicsCommandList>before,after;
 std::vector<std::unique_ptr<Tensor>>tensors;OrtIoBinding*binding=nullptr;
 ~Slot();
};
struct Spec{std::string name;std::vector<int64_t>shape;uint64_t bytes;};
struct Owner{
 std::string runtime_version;HMODULE ort=nullptr,dml_dll=nullptr;const OrtApi*api=nullptr;const OrtDmlApi*dml_api=nullptr;OrtEnv*env=nullptr;
 ComPtr<ID3D12Device>device;ComPtr<ID3D12CommandQueue>queue;ComPtr<IDMLDevice>dml;ComPtr<ID3D12Fence>retirement;uint64_t retire_value=0;
 std::map<uint64_t,std::unique_ptr<Model>>models;
 void check(OrtStatus*s){if(s){std::string m=api->GetErrorMessage(s);api->ReleaseStatus(s);throw std::runtime_error(m);}}
 void idle(){if(!queue||!retirement)return;HANDLE event=CreateEventW(nullptr,FALSE,FALSE,nullptr);if(!event)return;auto value=++retire_value;if(SUCCEEDED(queue->Signal(retirement.Get(),value))&&SUCCEEDED(retirement->SetEventOnCompletion(value,event)))WaitForSingleObject(event,INFINITE);CloseHandle(event);}
 ~Owner();
};
struct Model{
 Owner*owner;OrtSession*session=nullptr;OrtRunOptions*run=nullptr;std::vector<Spec>specs;uint32_t inputs=0;uint64_t executions=0;bool profiled=false;std::string profile;std::filesystem::path profile_prefix;
 std::map<uint32_t,std::unique_ptr<Slot>>slots;
 ~Model(){if(session&&!profiled){OrtAllocator*a=nullptr;auto status=owner->api->GetAllocatorWithDefaultOptions(&a);if(!status){char*path=nullptr;status=owner->api->SessionEndProfiling(session,a,&path);if(!status&&path){std::error_code ec;std::filesystem::remove(std::filesystem::u8path(path),ec);a->Free(a,path);}}if(status)owner->api->ReleaseStatus(status);}slots.clear();if(run)owner->api->ReleaseRunOptions(run);if(session)owner->api->ReleaseSession(session);if(!profile_prefix.empty()){std::error_code ec;const auto parent=profile_prefix.parent_path();const auto prefix=profile_prefix.filename().wstring()+L"_";for(auto it=std::filesystem::directory_iterator(parent,ec);!ec&&it!=std::filesystem::directory_iterator();it.increment(ec)){auto file=it->path();if(file.filename().wstring().rfind(prefix,0)==0&&file.extension()==L".json"&&!it->is_symlink(ec)&&it->is_regular_file(ec))std::filesystem::remove(file,ec);}}}
};
Tensor::~Tensor(){if(value)owner->api->ReleaseValue(value);if(allocation){auto s=owner->dml_api->FreeGPUAllocation(allocation);if(s)owner->api->ReleaseStatus(s);}if(shared)CloseHandle(shared);}
Slot::~Slot(){if(binding)owner->api->ReleaseIoBinding(binding);tensors.clear();if(shared)CloseHandle(shared);}
Owner::~Owner(){idle();models.clear();dml.Reset();queue.Reset();device.Reset();if(env)api->ReleaseEnv(env);if(ort)FreeLibrary(ort);if(dml_dll)FreeLibrary(dml_dll);}
static std::map<uint64_t,std::unique_ptr<Owner>> owners;
static Model&model(uint64_t id){for(auto&o:owners){auto m=o.second->models.find(id);if(m!=o.second->models.end())return*m->second;}throw std::runtime_error("stale model handle");}
static ComPtr<IDXGIAdapter1>adapter(uint64_t luid){ComPtr<IDXGIFactory4>factory;hr(CreateDXGIFactory1(IID_PPV_ARGS(&factory)),"DXGI factory");ComPtr<IDXGIAdapter1>a;for(UINT i=0;factory->EnumAdapters1(i,&a)!=DXGI_ERROR_NOT_FOUND;i++){DXGI_ADAPTER_DESC1 d;hr(a->GetDesc1(&d),"adapter description");uint64_t v;memcpy(&v,&d.AdapterLuid,8);if(v==luid)return a;a.Reset();}throw std::runtime_error("GPU adapter LUID does not match native owner");}
extern "C" uint64_t fw_inference_open(const wchar_t*runtime,uint64_t luid){try{
 auto o=std::make_unique<Owner>();std::wstring root(runtime);
 o->dml_dll=LoadLibraryExW((root+L"/DirectML.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);if(!o->dml_dll)throw std::runtime_error("reviewed DirectML runtime unavailable");
 o->ort=LoadLibraryExW((root+L"/onnxruntime.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);if(!o->ort)throw std::runtime_error("reviewed ONNX Runtime unavailable");
 using Get=const OrtApiBase*(ORT_API_CALL*)();auto get=(Get)GetProcAddress(o->ort,"OrtGetApiBase");if(!get)throw std::runtime_error("ORT API entry missing");o->runtime_version=get()->GetVersionString();o->api=get()->GetApi(ORT_API_VERSION);if(!o->api)throw std::runtime_error("ORT C API 23 compatibility unavailable");
 o->check(o->api->CreateEnv(ORT_LOGGING_LEVEL_ERROR,"frameweave/inference",&o->env));o->check(o->api->GetExecutionProviderApi("DML",ORT_API_VERSION,(const void**)&o->dml_api));
 auto a=adapter(luid);hr(D3D12CreateDevice(a.Get(),D3D_FEATURE_LEVEL_12_0,IID_PPV_ARGS(&o->device)),"D3D12 device");D3D12_COMMAND_QUEUE_DESC q={};q.Type=D3D12_COMMAND_LIST_TYPE_DIRECT;hr(o->device->CreateCommandQueue(&q,IID_PPV_ARGS(&o->queue)),"D3D12 queue");
 using Create=HRESULT(WINAPI*)(ID3D12Device*,DML_CREATE_DEVICE_FLAGS,REFIID,void**);auto create=(Create)GetProcAddress(o->dml_dll,"DMLCreateDevice");if(!create)throw std::runtime_error("DirectML API unavailable");hr(create(o->device.Get(),DML_CREATE_DEVICE_FLAG_NONE,IID_PPV_ARGS(&o->dml)),"DirectML device");hr(o->device->CreateFence(0,D3D12_FENCE_FLAG_NONE,IID_PPV_ARGS(&o->retirement)),"retirement fence");
 uint64_t id=(uint64_t)o.get();owners.emplace(id,std::move(o));return id;
 }catch(const std::exception&e){last_error=e.what();return 0;}}
extern "C" int fw_inference_close(uint64_t id){return owners.erase(id)?0:-1;}
static Spec copy(const FwTensor&t){if(!t.name||!*t.name||(!t.shape&&t.rank)||!t.bytes||t.bytes%4)throw std::runtime_error("invalid tensor metadata");Spec s{t.name,std::vector<int64_t>(t.shape,t.shape+t.rank),t.bytes};uint64_t count=1;for(auto d:s.shape){if(d<1||uint64_t(d)>UINT64_MAX/count)throw std::runtime_error("tensor dimensions overflow");count*=d;}if(count>UINT64_MAX/4||count*4!=s.bytes)throw std::runtime_error("tensor bytes mismatch");return s;}
extern "C" uint64_t fw_inference_model(uint64_t owner,const uint8_t*onnx,uint64_t bytes,const FwTensor*inputs,uint32_t in_count,const FwTensor*outputs,uint32_t out_count,const wchar_t*profile){try{
 auto it=owners.find(owner);if(it==owners.end()||!onnx||!bytes||!in_count||!out_count)throw std::runtime_error("invalid inference admission");auto&o=*it->second;auto m=std::make_unique<Model>();m->owner=&o;m->profile_prefix=profile;m->inputs=in_count;for(uint32_t i=0;i<in_count;i++)m->specs.push_back(copy(inputs[i]));for(uint32_t i=0;i<out_count;i++)m->specs.push_back(copy(outputs[i]));
 OrtSessionOptions*options=nullptr;o.check(o.api->CreateSessionOptions(&options));
 try{o.check(o.api->DisableMemPattern(options));o.check(o.api->SetSessionExecutionMode(options,ORT_SEQUENTIAL));o.check(o.api->AddSessionConfigEntry(options,"session.disable_cpu_ep_fallback","1"));o.check(o.api->EnableProfiling(options,profile));o.check(o.dml_api->SessionOptionsAppendExecutionProvider_DML1(options,o.dml.Get(),o.queue.Get()));o.check(o.api->CreateSessionFromArray(o.env,onnx,size_t(bytes),options,&m->session));o.api->ReleaseSessionOptions(options);}catch(...){o.api->ReleaseSessionOptions(options);throw;}
 OrtAllocator*allocator=nullptr;o.check(o.api->GetAllocatorWithDefaultOptions(&allocator));
 size_t in=0,out=0;o.check(o.api->SessionGetInputCount(m->session,&in));o.check(o.api->SessionGetOutputCount(m->session,&out));if(in!=in_count||out!=out_count)throw std::runtime_error("model input/output count differs from declared contract");
 for(size_t i=0;i<m->specs.size();i++){bool input=i<in_count;size_t j=input?i:i-in_count;char*name=nullptr;OrtTypeInfo*info=nullptr;if(input){o.check(o.api->SessionGetInputName(m->session,j,allocator,&name));o.check(o.api->SessionGetInputTypeInfo(m->session,j,&info));}else{o.check(o.api->SessionGetOutputName(m->session,j,allocator,&name));o.check(o.api->SessionGetOutputTypeInfo(m->session,j,&info));}std::string actual(name);allocator->Free(allocator,name);const OrtTensorTypeAndShapeInfo*shape=nullptr;auto status=o.api->CastTypeInfoToTensorInfo(info,&shape);if(status){o.api->ReleaseTypeInfo(info);o.check(status);}ONNXTensorElementDataType type;o.check(o.api->GetTensorElementType(shape,&type));size_t rank;o.check(o.api->GetDimensionsCount(shape,&rank));std::vector<int64_t>dims(rank);o.check(o.api->GetDimensions(shape,dims.data(),rank));o.api->ReleaseTypeInfo(info);if(actual!=m->specs[i].name||type!=ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT||rank!=m->specs[i].shape.size())throw std::runtime_error("model tensor name/dtype/rank differs from declared contract");for(size_t k=0;k<rank;k++)if(dims[k]>0&&dims[k]!=m->specs[i].shape[k])throw std::runtime_error("model tensor shape differs from declared static profile");}
 o.check(o.api->CreateRunOptions(&m->run));o.check(o.api->AddRunConfigEntry(m->run,"disable_synchronize_execution_providers","1"));uint64_t id=(uint64_t)m.get();o.models.emplace(id,std::move(m));return id;
 }catch(const std::exception&e){last_error=e.what();return 0;}}
static Slot&slot(Model&m,uint32_t id){auto&entry=m.slots[id];if(entry)return*entry;auto&o=*m.owner;auto s=std::make_unique<Slot>();s->owner=&o;hr(o.device->CreateFence(0,D3D12_FENCE_FLAG_SHARED,IID_PPV_ARGS(&s->fence)),"shared tensor fence");hr(o.device->CreateSharedHandle(s->fence.Get(),nullptr,GENERIC_ALL,nullptr,&s->shared),"tensor fence handle");o.check(o.api->CreateIoBinding(m.session,&s->binding));
 OrtMemoryInfo*memory=nullptr;o.check(o.api->CreateMemoryInfo("DML",OrtDeviceAllocator,0,OrtMemTypeDefault,&memory));
 try{for(size_t i=0;i<m.specs.size();i++){auto&t=m.specs[i];auto value=std::make_unique<Tensor>();value->owner=&o;value->bytes=(t.bytes+255)/256*256;D3D12_HEAP_PROPERTIES heap={};heap.Type=D3D12_HEAP_TYPE_DEFAULT;D3D12_RESOURCE_DESC d={};d.Dimension=D3D12_RESOURCE_DIMENSION_BUFFER;d.Width=value->bytes;d.Height=d.DepthOrArraySize=d.MipLevels=d.SampleDesc.Count=1;d.Layout=D3D12_TEXTURE_LAYOUT_ROW_MAJOR;d.Flags=D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS;hr(o.device->CreateCommittedResource(&heap,D3D12_HEAP_FLAG_SHARED,&d,D3D12_RESOURCE_STATE_COMMON,nullptr,IID_PPV_ARGS(&value->resource)),"shared tensor buffer");value->allocation_bytes=o.device->GetResourceAllocationInfo(0,1,&d).SizeInBytes;hr(o.device->CreateSharedHandle(value->resource.Get(),nullptr,GENERIC_ALL,nullptr,&value->shared),"tensor memory handle");o.check(o.dml_api->CreateGPUAllocationFromD3DResource(value->resource.Get(),&value->allocation));o.check(o.api->CreateTensorWithDataAsOrtValue(memory,value->allocation,size_t(value->bytes),t.shape.data(),t.shape.size(),ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&value->value));if(i<m.inputs)o.check(o.api->BindInput(s->binding,t.name.c_str(),value->value));else o.check(o.api->BindOutput(s->binding,t.name.c_str(),value->value));s->tensors.push_back(std::move(value));}o.api->ReleaseMemoryInfo(memory);}catch(...){o.api->ReleaseMemoryInfo(memory);throw;}
 for(bool before:{true,false}){auto&allocator=before?s->before_allocator:s->after_allocator;auto&list=before?s->before:s->after;hr(o.device->CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT,IID_PPV_ARGS(&allocator)),"tensor command allocator");hr(o.device->CreateCommandList(0,D3D12_COMMAND_LIST_TYPE_DIRECT,allocator.Get(),nullptr,IID_PPV_ARGS(&list)),"tensor command list");std::vector<D3D12_RESOURCE_BARRIER>barriers;for(auto&t:s->tensors){D3D12_RESOURCE_BARRIER b={};b.Type=D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;b.Transition.pResource=t->resource.Get();b.Transition.Subresource=D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;b.Transition.StateBefore=before?D3D12_RESOURCE_STATE_COMMON:D3D12_RESOURCE_STATE_UNORDERED_ACCESS;b.Transition.StateAfter=before?D3D12_RESOURCE_STATE_UNORDERED_ACCESS:D3D12_RESOURCE_STATE_COMMON;barriers.push_back(b);}list->ResourceBarrier((UINT)barriers.size(),barriers.data());hr(list->Close(),"tensor command close");}
 entry=std::move(s);return*entry;}
extern "C" int fw_inference_tensor(uint64_t id,uint32_t frame_slot,uint32_t index,FwTensorLease*out){try{auto&m=model(id);auto&s=slot(m,frame_slot);if(index>=s.tensors.size())throw std::runtime_error("unknown tensor binding");auto&t=*s.tensors[index];*out={1,0,t.bytes,t.allocation_bytes,(uintptr_t)t.shared,(uintptr_t)s.shared};return 0;}catch(const std::exception&e){last_error=e.what();return -1;}}
extern "C" int fw_inference_run(uint64_t id,uint32_t frame_slot,uint64_t wait,uint64_t ready){try{auto&m=model(id);auto&o=*m.owner;auto&s=slot(m,frame_slot);if(ready<=wait)throw std::runtime_error("invalid tensor fence sequence");hr(o.queue->Wait(s.fence.Get(),wait),"tensor queue wait");ID3D12CommandList*before=s.before.Get();o.queue->ExecuteCommandLists(1,&before);o.check(o.api->RunWithBinding(m.session,m.run,s.binding));ID3D12CommandList*after=s.after.Get();o.queue->ExecuteCommandLists(1,&after);hr(o.queue->Signal(s.fence.Get(),ready),"tensor queue ready");m.executions++;
 if(!m.profiled){OrtAllocator*a=nullptr;o.check(o.api->GetAllocatorWithDefaultOptions(&a));char*path=nullptr;o.check(o.api->SessionEndProfiling(m.session,a,&path));std::ifstream trace(std::filesystem::u8path(path),std::ios::binary);m.profile.assign(std::istreambuf_iterator<char>(trace),{});trace.close();std::filesystem::remove(std::filesystem::u8path(path));a->Free(a,path);m.profiled=true;}return 0;
 }catch(const std::exception&e){last_error=e.what();return -1;}}
extern "C" int fw_inference_release_model(uint64_t id){for(auto&o:owners)if(o.second->models.count(id)){o.second->idle();o.second->models.erase(id);return 0;}return -1;}
extern "C" uint32_t fw_inference_error(char*out,uint32_t size){auto n=std::min(size,uint32_t(last_error.size()));memcpy(out,last_error.data(),n);return n;}

extern "C" uint32_t fw_inference_profile(uint64_t id,char*out,uint32_t size){try{auto&m=model(id);uint32_t n=uint32_t(m.profile.size());if(out&&size>=n){memcpy(out,m.profile.data(),n);m.profile.clear();}return n;}catch(...){return UINT32_MAX;}}
extern "C" int fw_inference_slots(uint64_t id,uint32_t count){try{auto&m=model(id);bool shrink=m.slots.lower_bound(count)!=m.slots.end();if(shrink)m.owner->idle();m.slots.erase(m.slots.lower_bound(count),m.slots.end());return 0;}catch(const std::exception&e){last_error=e.what();return -1;}}

extern "C" uint32_t fw_inference_info(uint64_t id,char*out,uint32_t size){auto o=owners.find(id);if(o==owners.end())return UINT32_MAX;std::string info="{\"version\":1,\"runtimeVersion\":\""+o->second->runtime_version+"\",\"apiVersion\":"+std::to_string(ORT_API_VERSION)+"}";if(out&&size>=info.size())memcpy(out,info.data(),info.size());return uint32_t(info.size());}
