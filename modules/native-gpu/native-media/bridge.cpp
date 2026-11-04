#include "bridge.h"
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <d3d11_4.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <wrl/client.h>
#include <string>
#include <map>
#include <memory>
#include <stdexcept>
#include <cstdio>
#include <cstring>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <future>
#include <functional>
#include <vector>
#include <deque>
#include "video-shader.generated.h"
#include "file-stream.h"
using Microsoft::WRL::ComPtr;
static thread_local std::string error;
static void check(HRESULT value,const char* what){if(FAILED(value)){char text[256];sprintf_s(text,"%s: %08lx",what,(unsigned long)value);throw std::runtime_error(text);}}
struct Surface {
 ComPtr<ID3D11Texture2D> texture;ComPtr<ID3D11UnorderedAccessView> view;ComPtr<ID3D11Fence> fence;
 HANDLE texture_handle=nullptr,fence_handle=nullptr;
 ~Surface(){if(texture_handle)CloseHandle(texture_handle);if(fence_handle)CloseHandle(fence_handle);}
};
struct Owner;
struct Video {
 Owner* owner=nullptr;FwVideoConfig config={};ComPtr<IMFSourceReader> reader;ComPtr<IMFSample> sample;
 ComPtr<ID3D11Texture2D> planes;ComPtr<ID3D11ShaderResourceView> y,uv;ComPtr<ID3D11Buffer> constants;
 std::map<uint32_t,std::unique_ptr<Surface>> surfaces;
 int64_t index=-1,origin=0,pts=0;bool origin_known=false;
};
struct Owner {
 ComPtr<ID3D11Device> device;ComPtr<ID3D11DeviceContext> context;ComPtr<ID3D11Device5> device5;ComPtr<ID3D11DeviceContext4> context4;ComPtr<ID3D11Multithread> multithread;
 ComPtr<IMFDXGIDeviceManager> manager;ComPtr<ID3D11ComputeShader> shader;ComPtr<ID3D11SamplerState> sampler;
 std::map<uint64_t,std::unique_ptr<Video>> videos;
};
static std::map<uint64_t,std::unique_ptr<Owner>> owners;
static Video& video(uint64_t id){for(auto&entry:owners){auto v=entry.second->videos.find(id);if(v!=entry.second->videos.end())return *v->second;}throw std::runtime_error("stale video");}
static std::unique_ptr<Surface> surface(Owner&o,uint32_t w,uint32_t h){
 auto s=std::make_unique<Surface>();D3D11_TEXTURE2D_DESC d={};d.Width=w;d.Height=h;d.MipLevels=d.ArraySize=d.SampleDesc.Count=1;d.Format=DXGI_FORMAT_R32G32B32A32_FLOAT;d.Usage=D3D11_USAGE_DEFAULT;d.BindFlags=D3D11_BIND_UNORDERED_ACCESS|D3D11_BIND_SHADER_RESOURCE|D3D11_BIND_RENDER_TARGET;d.MiscFlags=D3D11_RESOURCE_MISC_SHARED_NTHANDLE|D3D11_RESOURCE_MISC_SHARED;
 check(o.device->CreateTexture2D(&d,nullptr,&s->texture),"shared RGBA32F");check(o.device->CreateUnorderedAccessView(s->texture.Get(),nullptr,&s->view),"RGBA32F UAV");
 ComPtr<IDXGIResource1> dxgi;check(s->texture.As(&dxgi),"shared resource");check(dxgi->CreateSharedHandle(nullptr,DXGI_SHARED_RESOURCE_READ|DXGI_SHARED_RESOURCE_WRITE,nullptr,&s->texture_handle),"texture handle");
 check(o.device5->CreateFence(0,D3D11_FENCE_FLAG_SHARED,IID_PPV_ARGS(&s->fence)),"fence");check(s->fence->CreateSharedHandle(nullptr,GENERIC_ALL,nullptr,&s->fence_handle),"fence handle");return s;
}
// Encoder shares this exact owner/device with hardware video.
#include "encoder.h"
static uint64_t impl_fw_media_open(uint64_t luid){bool com=false,mf=false;try{
 check(CoInitializeEx(nullptr,COINIT_MULTITHREADED),"COM");com=true;check(MFStartup(MF_VERSION),"MF startup");mf=true;auto o=std::make_unique<Owner>();
 ComPtr<IDXGIFactory1> factory;check(CreateDXGIFactory1(IID_PPV_ARGS(&factory)),"DXGI");ComPtr<IDXGIAdapter1> adapter;
 for(UINT i=0;;i++){ComPtr<IDXGIAdapter1>a;if(factory->EnumAdapters1(i,&a)==DXGI_ERROR_NOT_FOUND)break;DXGI_ADAPTER_DESC1 d;check(a->GetDesc1(&d),"adapter");uint64_t n;memcpy(&n,&d.AdapterLuid,8);if(n==luid){adapter=a;break;}}
 if(!adapter)throw std::runtime_error("adapter LUID does not match native GPU owner");
 check(D3D11CreateDevice(adapter.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_VIDEO_SUPPORT|D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&o->device,nullptr,&o->context),"D3D11");
 check(o->device.As(&o->device5),"D3D11 shared fences");check(o->context.As(&o->context4),"D3D11 queue fences");check(o->context.As(&o->multithread),"D3D11 codec multithread protection");o->multithread->SetMultithreadProtected(TRUE);
 UINT token;check(MFCreateDXGIDeviceManager(&token,&o->manager),"DXGI manager");check(o->manager->ResetDevice(o->device.Get(),token),"DXGI manager device");
 ComPtr<ID3DBlob> blob,messages;HRESULT hr=D3DCompile(video_shader,strlen(video_shader),"frameweave/video",nullptr,nullptr,"main","cs_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&blob,&messages);
 if(FAILED(hr)&&messages)throw std::runtime_error(std::string((char*)messages->GetBufferPointer(),messages->GetBufferSize()));check(hr,"video shader");check(o->device->CreateComputeShader(blob->GetBufferPointer(),blob->GetBufferSize(),nullptr,&o->shader),"video compute");
 D3D11_SAMPLER_DESC sampler={};sampler.Filter=D3D11_FILTER_MIN_MAG_LINEAR_MIP_POINT;sampler.AddressU=sampler.AddressV=sampler.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP;sampler.MaxLOD=D3D11_FLOAT32_MAX;check(o->device->CreateSamplerState(&sampler,&o->sampler),"sampler");
 uint64_t id=(uint64_t)o.get();owners.emplace(id,std::move(o));return id;
 }catch(const std::exception&e){error=e.what();if(mf)MFShutdown();if(com)CoUninitialize();return 0;}}
static int impl_fw_media_close(uint64_t id){auto i=owners.find(id);if(i==owners.end())return -1;for(auto e=encoders.begin();e!=encoders.end();){if(e->second->owner==i->second.get())e=encoders.erase(e);else ++e;}owners.erase(i);MFShutdown();CoUninitialize();return 0;}
static uint64_t impl_fw_video_open(uint64_t owner,const wchar_t*path,const FwVideoConfig*config){try{
 auto i=owners.find(owner);if(i==owners.end()||!config||config->version!=1||!config->width||!config->height||config->transfer<1||config->transfer>3)throw std::runtime_error("invalid video descriptor");
 auto v=std::make_unique<Video>();v->owner=i->second.get();v->config=*config;ComPtr<IMFAttributes>a;check(MFCreateAttributes(&a,4),"attributes");check(a->SetUnknown(MF_SOURCE_READER_D3D_MANAGER,v->owner->manager.Get()),"D3D manager");
 check(a->SetUINT32(MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,TRUE),"hardware transforms");check(a->SetUINT32(MF_SOURCE_READER_DISABLE_DXVA,FALSE),"DXVA enabled");
 ComPtr<IStream> file;file.Attach(new LocalFileStream(path));if(!((LocalFileStream*)file.Get())->valid())throw std::runtime_error("private video file unavailable");ComPtr<IMFByteStream> bytes;check(MFCreateMFByteStreamOnStream(file.Get(),&bytes),"local byte stream");
 check(MFCreateSourceReaderFromByteStream(bytes.Get(),a.Get(),&v->reader),"source reader");check(v->reader->SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS,FALSE),"select streams");check(v->reader->SetStreamSelection(MF_SOURCE_READER_FIRST_VIDEO_STREAM,TRUE),"select video");
 ComPtr<IMFMediaType>type;check(MFCreateMediaType(&type),"type");check(type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video),"video type");check(type->SetGUID(MF_MT_SUBTYPE,config->ten_bit?MFVideoFormat_P010:MFVideoFormat_NV12),"decode format");check(v->reader->SetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM,nullptr,type.Get()),"GPU decode format");
 D3D11_BUFFER_DESC b={};b.ByteWidth=96;b.Usage=D3D11_USAGE_DEFAULT;b.BindFlags=D3D11_BIND_CONSTANT_BUFFER;check(v->owner->device->CreateBuffer(&b,nullptr,&v->constants),"constants");
 uint64_t id=(uint64_t)v.get();i->second->videos.emplace(id,std::move(v));return id;
 }catch(const std::exception&e){error=e.what();return 0;}}
static int impl_fw_video_close(uint64_t id){for(auto&o:owners)if(o.second->videos.erase(id))return 0;return -1;}
static int impl_fw_video_slots(uint64_t id,uint32_t count){try{auto&v=video(id);for(auto i=v.surfaces.begin();i!=v.surfaces.end();)if(i->first>=count)i=v.surfaces.erase(i);else ++i;return 0;}catch(const std::exception&e){error=e.what();return -1;}}
static int impl_fw_video_surface(uint64_t id,uint32_t slot,FwMediaSurface*out){try{auto&v=video(id);auto&entry=v.surfaces[slot];if(!entry)entry=surface(*v.owner,v.config.width,v.config.height);*out={1,v.config.width,v.config.height,0,(uintptr_t)entry->texture_handle,(uintptr_t)entry->fence_handle};return 0;}catch(const std::exception&e){error=e.what();return -1;}}
static int impl_fw_video_frame(uint64_t id,uint32_t slot,uint64_t frame,int64_t expected,uint64_t wait,uint64_t ready){try{
 auto&v=video(id);auto&o=*v.owner;auto s=v.surfaces.find(slot);if(s==v.surfaces.end())throw std::runtime_error("surface not admitted");
 if(frame>uint64_t(INT64_MAX)||ready<=wait)throw std::runtime_error("invalid frame/fence");
 if(v.index>(int64_t)frame){PROPVARIANT p;PropVariantInit(&p);p.vt=VT_I8;p.hVal.QuadPart=0;check(v.reader->SetCurrentPosition(GUID_NULL,p),"reset video");v.index=-1;v.sample.Reset();v.origin_known=false;}
 while(v.index<(int64_t)frame){DWORD stream,flags;LONGLONG pts;ComPtr<IMFSample>sample;check(v.reader->ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM,0,&stream,&flags,&pts,&sample),"read sample");if(flags&MF_SOURCE_READERF_ENDOFSTREAM)throw std::runtime_error("frame beyond video EOS");if(!sample)continue;if(!v.origin_known){v.origin=pts;v.origin_known=true;}v.sample=sample;v.pts=pts;++v.index;}
 if(!v.sample||llabs((v.pts-v.origin)-expected)>2)throw std::runtime_error("decoder PTS does not match source presentation timeline");
 ComPtr<IMFMediaBuffer>b;check(v.sample->GetBufferByIndex(0,&b),"sample buffer");ComPtr<IMFDXGIBuffer>dxgi;check(b.As(&dxgi),"GPU sample required (no CPU fallback)");ComPtr<ID3D11Texture2D>input;check(dxgi->GetResource(IID_PPV_ARGS(&input)),"decode texture");UINT sub;check(dxgi->GetSubresourceIndex(&sub),"decode array slice");D3D11_TEXTURE2D_DESC d;input->GetDesc(&d);
 if(!(d.BindFlags&D3D11_BIND_DECODER))throw std::runtime_error("decoder-owned DXVA surface required (no software upload fallback)");
 if(d.Width<v.config.source_width||d.Height<v.config.source_height||d.Format!=(v.config.ten_bit?DXGI_FORMAT_P010:DXGI_FORMAT_NV12))throw std::runtime_error("decoder format/dimensions changed");
 if(!v.planes){d.ArraySize=1;d.MipLevels=1;d.Usage=D3D11_USAGE_DEFAULT;d.BindFlags=D3D11_BIND_SHADER_RESOURCE;d.CPUAccessFlags=d.MiscFlags=0;check(o.device->CreateTexture2D(&d,nullptr,&v.planes),"plane sampling texture");D3D11_SHADER_RESOURCE_VIEW_DESC desc={};desc.ViewDimension=D3D11_SRV_DIMENSION_TEXTURE2D;desc.Texture2D.MipLevels=1;desc.Format=v.config.ten_bit?DXGI_FORMAT_R16_UNORM:DXGI_FORMAT_R8_UNORM;check(o.device->CreateShaderResourceView(v.planes.Get(),&desc,&v.y),"luma view");desc.Format=v.config.ten_bit?DXGI_FORMAT_R16G16_UNORM:DXGI_FORMAT_R8G8_UNORM;check(o.device->CreateShaderResourceView(v.planes.Get(),&desc,&v.uv),"chroma view");}
 auto&output=*s->second;check(o.context4->Wait(output.fence.Get(),wait),"GPU input lease wait");
 o.context->CopySubresourceRegion(v.planes.Get(),0,0,0,0,input.Get(),sub,nullptr);
 struct Constants{uint32_t dimensions[4],source[4];float matrix[12],light[4];}c={};
 c.dimensions[0]=v.config.width;c.dimensions[1]=v.config.height;c.dimensions[2]=d.Width;c.dimensions[3]=d.Height;c.source[0]=v.config.source_width;c.source[1]=v.config.source_height;c.source[2]=v.config.ten_bit;c.source[3]=v.config.transfer;memcpy(c.matrix,v.config.output_matrix,sizeof(c.matrix));c.light[0]=v.config.reference_white;c.light[1]=v.config.peak_nits;c.light[2]=v.config.hlg_gamma;c.light[3]=v.config.primaries==2?.2627f:.2126f;
 o.context->UpdateSubresource(v.constants.Get(),0,nullptr,&c,0,0);ID3D11ShaderResourceView*inputs[]={v.y.Get(),v.uv.Get()};ID3D11UnorderedAccessView*outputs[]={output.view.Get()};ID3D11Buffer*constants[]={v.constants.Get()};ID3D11SamplerState*samplers[]={o.sampler.Get()};o.context->CSSetShader(o.shader.Get(),nullptr,0);o.context->CSSetShaderResources(0,2,inputs);o.context->CSSetUnorderedAccessViews(0,1,outputs,nullptr);o.context->CSSetConstantBuffers(0,1,constants);o.context->CSSetSamplers(0,1,samplers);o.context->Dispatch((v.config.width+7)/8,(v.config.height+7)/8,1);
 ID3D11UnorderedAccessView*empty[]={nullptr};o.context->CSSetUnorderedAccessViews(0,1,empty,nullptr);check(o.context4->Signal(output.fence.Get(),ready),"GPU decode ready");o.context->Flush();return 0;
 }catch(const std::exception&e){error=e.what();return -1;}}
static uint32_t impl_fw_media_error(char*out,uint32_t size){uint32_t n=(uint32_t)error.size();if(n>size)n=size;if(n)memcpy(out,error.data(),n);return n;}
// Media Foundation stays on a dedicated MTA; Servo may use another apartment.
// The queue carries control only. Pixel resources stay on the owning GPU.
class MediaThread {
 std::mutex mutex;std::condition_variable changed;std::queue<std::function<void()>> tasks;bool stopping=false;std::thread thread;
 public:
 MediaThread():thread([this]{for(;;){std::function<void()>task;{std::unique_lock<std::mutex>lock(mutex);changed.wait(lock,[this]{return stopping||!tasks.empty();});if(stopping&&tasks.empty())return;task=std::move(tasks.front());tasks.pop();}task();}}){}
 ~MediaThread(){{std::lock_guard<std::mutex>lock(mutex);stopping=true;}changed.notify_one();thread.join();}
 template<class F>auto call(F f)->decltype(f()){using T=decltype(f());auto task=std::make_shared<std::packaged_task<T()>>(std::move(f));auto result=task->get_future();{std::lock_guard<std::mutex>lock(mutex);tasks.emplace([task]{(*task)();});}changed.notify_one();return result.get();}
};
static MediaThread&media_thread(){static MediaThread thread;return thread;}
extern "C" uint64_t fw_media_open(uint64_t id){return media_thread().call([&]{return impl_fw_media_open(id);});}
extern "C" int fw_media_close(uint64_t id){return media_thread().call([&]{return impl_fw_media_close(id);});}
extern "C" uint64_t fw_video_open(uint64_t owner,const wchar_t*path,const FwVideoConfig*c){return media_thread().call([&]{return impl_fw_video_open(owner,path,c);});}
extern "C" int fw_video_close(uint64_t id){return media_thread().call([&]{return impl_fw_video_close(id);});}
extern "C" int fw_video_slots(uint64_t id,uint32_t count){return media_thread().call([&]{return impl_fw_video_slots(id,count);});}
extern "C" int fw_encode_slots(uint64_t id,uint32_t count){return media_thread().call([&]{return impl_fw_encode_slots(id,count);});}
extern "C" int fw_video_surface(uint64_t id,uint32_t slot,FwMediaSurface*out){return media_thread().call([&]{return impl_fw_video_surface(id,slot,out);});}
extern "C" int fw_video_frame(uint64_t id,uint32_t slot,uint64_t frame,int64_t pts,uint64_t wait,uint64_t ready){return media_thread().call([&]{return impl_fw_video_frame(id,slot,frame,pts,wait,ready);});}
extern "C" uint32_t fw_media_error(char*out,uint32_t size){return media_thread().call([&]{return impl_fw_media_error(out,size);});}
extern "C" uint64_t fw_encode_open(uint64_t owner,const wchar_t*file,const FwEncodeConfig*c){return media_thread().call([&]{return impl_fw_encode_open(owner,file,c);});}
extern "C" int fw_encode_surface(uint64_t id,uint32_t slot,FwMediaSurface*out){return media_thread().call([&]{return impl_fw_encode_surface(id,slot,out);});}
extern "C" int fw_encode_frame(uint64_t id,uint32_t slot,uint64_t frame,uint64_t wait){return media_thread().call([&]{return impl_fw_encode_frame(id,slot,frame,wait);});}
extern "C" int fw_encode_poll(uint64_t id,FwEncodeComplete*out,uint32_t size){return media_thread().call([&]{return impl_fw_encode_poll(id,out,size);});}
extern "C" int fw_encode_finish(uint64_t id){return media_thread().call([&]{return impl_fw_encode_finish(id);});}
#ifdef FRAMEWEAVE_MEDIA_DIAGNOSTICS
extern "C" int fw_encode_inspect(uint64_t id,uint32_t slot,float*out,uint32_t words){return media_thread().call([&]{try{
 auto&e=encoder(id);if(slot>=e.slots.size()||!e.slots[slot]||e.slots[slot]->pending||words!=uint64_t(e.config.width)*e.config.height*4)throw std::runtime_error("explicit colour diagnostic requires a completed slot and exact bounds");
 auto&s=*e.slots[slot];auto&o=*e.owner;D3D11_TEXTURE2D_DESC d;s.converted->GetDesc(&d);d.Usage=D3D11_USAGE_STAGING;d.BindFlags=0;d.CPUAccessFlags=D3D11_CPU_ACCESS_READ;ComPtr<ID3D11Texture2D>staging;check(o.device->CreateTexture2D(&d,nullptr,&staging),"diagnostic allocation");o.context->CopyResource(staging.Get(),s.converted.Get());D3D11_MAPPED_SUBRESOURCE map;check(o.context->Map(staging.Get(),0,D3D11_MAP_READ,0,&map),"explicit diagnostic readback");for(UINT y=0;y<d.Height;y++)memcpy(out+uint64_t(y)*d.Width*4,(char*)map.pData+uint64_t(y)*map.RowPitch,uint64_t(d.Width)*16);o.context->Unmap(staging.Get(),0);return 0;
 }catch(const std::exception&e){error=e.what();return -1;}});}
#endif


