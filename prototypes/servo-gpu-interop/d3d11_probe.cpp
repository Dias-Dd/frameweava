// Frameweave isolated interoperability probe. No Servo/ANGLE or pixel upload.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d3d11_4.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <cstdint>
#include <cstdio>
struct Probe {
 ID3D11Device* device{}; ID3D11DeviceContext* context{};
 ID3D11Device5* device5{}; ID3D11DeviceContext4* context4{};
 ID3D11Texture2D* texture{}; ID3D11RenderTargetView* target{};
 ID3D11Texture2D* scratch{}; ID3D11RenderTargetView* scratch_target{}; ID3D11ShaderResourceView* input{};
 ID3D11VertexShader* vertex{}; ID3D11PixelShader* pixel{};UINT width{},height{};
 ID3D11RasterizerState* raster{};
 ID3D11Fence* fence{}; HANDLE texture_handle{},fence_handle{};
 ~Probe(){if(context)context->ClearState();if(raster)raster->Release();if(vertex)vertex->Release();if(pixel)pixel->Release();if(input)input->Release();if(scratch_target)scratch_target->Release();if(scratch)scratch->Release();if(fence)fence->Release();if(target)target->Release();if(texture)texture->Release();if(context4)context4->Release();if(device5)device5->Release();if(context)context->Release();if(device)device->Release();if(texture_handle)CloseHandle(texture_handle);if(fence_handle)CloseHandle(fence_handle);}
};
extern "C" __declspec(dllexport) void* probe_create(uint64_t luid_bits,uint32_t width,uint32_t height,uintptr_t* texture_handle,uintptr_t* fence_handle){
 Probe* p=new Probe();p->width=width;p->height=height;IDXGIFactory1* factory{};IDXGIAdapter1* adapter{};HRESULT hr=CreateDXGIFactory1(__uuidof(IDXGIFactory1),(void**)&factory);
 if(SUCCEEDED(hr)){for(UINT i=0;factory->EnumAdapters1(i,&adapter)!=DXGI_ERROR_NOT_FOUND;i++){DXGI_ADAPTER_DESC1 d{};adapter->GetDesc1(&d);if(*reinterpret_cast<uint64_t*>(&d.AdapterLuid)==luid_bits)break;adapter->Release();adapter=nullptr;}factory->Release();}
 if(!adapter){delete p;return nullptr;}
 D3D_FEATURE_LEVEL level;hr=D3D11CreateDevice(adapter,D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&p->device,&level,&p->context);adapter->Release();
 if(SUCCEEDED(hr))hr=p->device->QueryInterface(__uuidof(ID3D11Device5),(void**)&p->device5);
 if(SUCCEEDED(hr))hr=p->context->QueryInterface(__uuidof(ID3D11DeviceContext4),(void**)&p->context4);
 D3D11_TEXTURE2D_DESC desc{};desc.Width=width;desc.Height=height;desc.MipLevels=desc.ArraySize=1;desc.Format=DXGI_FORMAT_B8G8R8A8_UNORM;desc.SampleDesc.Count=1;desc.Usage=D3D11_USAGE_DEFAULT;desc.BindFlags=D3D11_BIND_SHADER_RESOURCE|D3D11_BIND_RENDER_TARGET;desc.MiscFlags=D3D11_RESOURCE_MISC_SHARED_NTHANDLE|D3D11_RESOURCE_MISC_SHARED;
 if(SUCCEEDED(hr))hr=p->device->CreateTexture2D(&desc,nullptr,&p->texture);
 if(SUCCEEDED(hr))hr=p->device->CreateRenderTargetView(p->texture,nullptr,&p->target);
 IDXGIResource1* resource{};if(SUCCEEDED(hr))hr=p->texture->QueryInterface(__uuidof(IDXGIResource1),(void**)&resource);
 if(SUCCEEDED(hr)){hr=resource->CreateSharedHandle(nullptr,DXGI_SHARED_RESOURCE_READ|DXGI_SHARED_RESOURCE_WRITE,nullptr,&p->texture_handle);resource->Release();}
 if(SUCCEEDED(hr))hr=p->device5->CreateFence(0,D3D11_FENCE_FLAG_SHARED,__uuidof(ID3D11Fence),(void**)&p->fence);
 if(SUCCEEDED(hr))hr=p->fence->CreateSharedHandle(nullptr,GENERIC_ALL,nullptr,&p->fence_handle);
 if(SUCCEEDED(hr))hr=p->device->CreateShaderResourceView(p->texture,nullptr,&p->input);
 desc.MiscFlags=0;if(SUCCEEDED(hr))hr=p->device->CreateTexture2D(&desc,nullptr,&p->scratch);
 if(SUCCEEDED(hr))hr=p->device->CreateRenderTargetView(p->scratch,nullptr,&p->scratch_target);
 D3D11_RASTERIZER_DESC raster{};raster.FillMode=D3D11_FILL_SOLID;raster.CullMode=D3D11_CULL_NONE;raster.DepthClipEnable=TRUE;if(SUCCEEDED(hr))hr=p->device->CreateRasterizerState(&raster,&p->raster);
 const char* vs="float4 main(uint i:SV_VertexID):SV_Position {return float4(i==2?3:-1,i==1?3:-1,0,1);}";
 const char* ps="Texture2D<float4> image:register(t0);float4 main(float4 p:SV_Position):SV_Target {float4 c=image.Load(int3(p.xy,0));return float4(c.rgb*.5,c.a);}";
 ID3DBlob* code{};ID3DBlob* errors{};
 if(SUCCEEDED(hr)){hr=D3DCompile(vs,strlen(vs),nullptr,nullptr,nullptr,"main","vs_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&code,&errors);if(errors){errors->Release();errors=nullptr;}if(SUCCEEDED(hr)){hr=p->device->CreateVertexShader(code->GetBufferPointer(),code->GetBufferSize(),nullptr,&p->vertex);code->Release();code=nullptr;}}
 if(SUCCEEDED(hr)){hr=D3DCompile(ps,strlen(ps),nullptr,nullptr,nullptr,"main","ps_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&code,&errors);if(errors){errors->Release();errors=nullptr;}if(SUCCEEDED(hr)){hr=p->device->CreatePixelShader(code->GetBufferPointer(),code->GetBufferSize(),nullptr,&p->pixel);code->Release();}}
 if(FAILED(hr)){fprintf(stderr,"D3D11 probe creation HRESULT=0x%08lx texture=%p target=%p handle=%p fence=%p vertex=%p pixel=%p\n",hr,p->texture,p->target,p->texture_handle,p->fence,p->vertex,p->pixel);delete p;return nullptr;}
 *texture_handle=reinterpret_cast<uintptr_t>(p->texture_handle);*fence_handle=reinterpret_cast<uintptr_t>(p->fence_handle);return p;
}
extern "C" __declspec(dllexport) int32_t probe_clear(void* raw,uint64_t wait_value,uint64_t signal_value,float red){
 auto p=static_cast<Probe*>(raw);HRESULT hr=S_OK;if(wait_value)hr=p->context4->Wait(p->fence,wait_value);if(SUCCEEDED(hr)){float c[]={red,.25f,.75f,.5f};p->context->ClearRenderTargetView(p->target,c);hr=p->context4->Signal(p->fence,signal_value);p->context->Flush();}return hr;
}
extern "C" __declspec(dllexport) uint64_t probe_completed(void* raw){return static_cast<Probe*>(raw)->fence->GetCompletedValue();}
// Validation only. Never part of the native module's production data path.
extern "C" __declspec(dllexport) int32_t probe_diagnostic_pixel(void* raw,uint8_t* pixel){
 auto p=static_cast<Probe*>(raw);D3D11_TEXTURE2D_DESC d{};p->texture->GetDesc(&d);d.Usage=D3D11_USAGE_STAGING;d.BindFlags=d.MiscFlags=0;d.CPUAccessFlags=D3D11_CPU_ACCESS_READ;ID3D11Texture2D* staging{};HRESULT hr=p->device->CreateTexture2D(&d,nullptr,&staging);if(FAILED(hr))return hr;
 p->context->CopyResource(staging,p->texture);D3D11_MAPPED_SUBRESOURCE mapped{};hr=p->context->Map(staging,0,D3D11_MAP_READ,0,&mapped);if(SUCCEEDED(hr)){memcpy(pixel,mapped.pData,4);p->context->Unmap(staging,0);}staging->Release();return hr;
}
extern "C" __declspec(dllexport) int32_t probe_apply(void* raw,uint64_t wait_value,uint64_t signal_value){
 auto p=static_cast<Probe*>(raw);HRESULT hr=p->context4->Wait(p->fence,wait_value);if(FAILED(hr))return hr;
 D3D11_VIEWPORT view{0,0,float(p->width),float(p->height),0,1};p->context->RSSetViewports(1,&view);p->context->RSSetState(p->raster);p->context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
 p->context->VSSetShader(p->vertex,nullptr,0);p->context->PSSetShader(p->pixel,nullptr,0);p->context->PSSetShaderResources(0,1,&p->input);p->context->OMSetRenderTargets(1,&p->scratch_target,nullptr);p->context->Draw(3,0);
 ID3D11ShaderResourceView* none=nullptr;p->context->PSSetShaderResources(0,1,&none);p->context->OMSetRenderTargets(0,nullptr,nullptr);p->context->CopyResource(p->texture,p->scratch);hr=p->context4->Signal(p->fence,signal_value);p->context->Flush();return hr;
}
extern "C" __declspec(dllexport) void probe_destroy(void* raw){delete static_cast<Probe*>(raw);}
