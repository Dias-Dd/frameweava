#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>
#include <stdio.h>
using Microsoft::WRL::ComPtr;
#define CHECK(call) do{HRESULT h=(call);if(FAILED(h)){printf("{\"ok\":false,\"step\":\"%s\",\"hr\":\"%08lx\"}\n",#call,(unsigned long)h);return 1;}}while(0)
int wmain(int argc,wchar_t**argv){
 if(argc!=2)return 2;CHECK(CoInitializeEx(nullptr,COINIT_MULTITHREADED));CHECK(MFStartup(MF_VERSION));
 ComPtr<IDXGIFactory1> factory;CHECK(CreateDXGIFactory1(IID_PPV_ARGS(&factory)));ComPtr<IDXGIAdapter1> adapter;
 for(UINT i=0;;i++){ComPtr<IDXGIAdapter1> a;if(factory->EnumAdapters1(i,&a)==DXGI_ERROR_NOT_FOUND)break;DXGI_ADAPTER_DESC1 d;a->GetDesc1(&d);if(d.VendorId==0x10de){adapter=a;break;}}
 if(!adapter){printf("{\"ok\":false,\"step\":\"NVIDIA adapter\"}\n");return 1;}
 ComPtr<ID3D11Device> device;ComPtr<ID3D11DeviceContext> context;D3D_FEATURE_LEVEL level;CHECK(D3D11CreateDevice(adapter.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_VIDEO_SUPPORT|D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&device,&level,&context));
 UINT token;ComPtr<IMFDXGIDeviceManager> manager;CHECK(MFCreateDXGIDeviceManager(&token,&manager));CHECK(manager->ResetDevice(device.Get(),token));
 ComPtr<IMFAttributes> attr;CHECK(MFCreateAttributes(&attr,5));CHECK(attr->SetUnknown(MF_SOURCE_READER_D3D_MANAGER,manager.Get()));CHECK(attr->SetUINT32(MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,TRUE));CHECK(attr->SetUINT32(MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING,TRUE));
 ComPtr<IMFSourceReader> reader;CHECK(MFCreateSourceReaderFromURL(argv[1],attr.Get(),&reader));CHECK(reader->SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS,FALSE));CHECK(reader->SetStreamSelection(MF_SOURCE_READER_FIRST_VIDEO_STREAM,TRUE));
 ComPtr<IMFMediaType> type;CHECK(MFCreateMediaType(&type));CHECK(type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video));CHECK(type->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_NV12));CHECK(reader->SetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM,nullptr,type.Get()));
 PROPVARIANT pos;PropVariantInit(&pos);pos.vt=VT_I8;pos.hVal.QuadPart=0;CHECK(reader->SetCurrentPosition(GUID_NULL,pos));
 for(int i=0;i<20;i++){DWORD actual,flags;LONGLONG pts;ComPtr<IMFSample> sample;CHECK(reader->ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM,0,&actual,&flags,&pts,&sample));if(flags&MF_SOURCE_READERF_ENDOFSTREAM)break;if(!sample)continue;ComPtr<IMFMediaBuffer> buffer;CHECK(sample->GetBufferByIndex(0,&buffer));ComPtr<IMFDXGIBuffer> dxgi;CHECK(buffer.As(&dxgi));ComPtr<ID3D11Texture2D> texture;CHECK(dxgi->GetResource(IID_PPV_ARGS(&texture)));D3D11_TEXTURE2D_DESC d;texture->GetDesc(&d);UINT sub;CHECK(dxgi->GetSubresourceIndex(&sub));printf("{\"ok\":true,\"pts100ns\":%lld,\"format\":%u,\"width\":%u,\"height\":%u,\"array\":%u,\"slice\":%u,\"gpuSample\":true}\n",pts,(unsigned)d.Format,d.Width,d.Height,d.ArraySize,sub);}
 return 0;
 return 3;
}
