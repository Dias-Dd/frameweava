#pragma once
#include <windows.h>
#include <objidl.h>
#include <atomic>
#include <string>
#include <mutex>
/** Read-only IStream over a private local file. Avoids URL resolution and
 * Media Foundation's MAX_PATH/extended-URL ambiguity. No network schemes. */
class LocalFileStream final:public IStream {
 std::atomic<ULONG> refs{1};HANDLE handle=INVALID_HANDLE_VALUE;std::wstring path;std::mutex mutex;
 public:
 explicit LocalFileStream(const wchar_t*p):path(p){handle=CreateFileW(p,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);}
 ~LocalFileStream(){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);}
 bool valid()const{return handle!=INVALID_HANDLE_VALUE;}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void**out)override{if(!out)return E_POINTER;*out=nullptr;if(iid==IID_IUnknown||iid==IID_ISequentialStream||iid==IID_IStream){*out=(IStream*)this;AddRef();return S_OK;}return E_NOINTERFACE;}
 ULONG STDMETHODCALLTYPE AddRef()override{return ++refs;}ULONG STDMETHODCALLTYPE Release()override{ULONG n=--refs;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE Read(void*out,ULONG size,ULONG*read)override{std::lock_guard<std::mutex>lock(mutex);DWORD n=0;if(!ReadFile(handle,out,size,&n,nullptr))return HRESULT_FROM_WIN32(GetLastError());if(read)*read=n;return n==size?S_OK:S_FALSE;}
 HRESULT STDMETHODCALLTYPE Write(const void*,ULONG,ULONG*)override{return STG_E_ACCESSDENIED;}
 HRESULT STDMETHODCALLTYPE Seek(LARGE_INTEGER position,DWORD origin,ULARGE_INTEGER*out)override{std::lock_guard<std::mutex>lock(mutex);if(origin>STREAM_SEEK_END)return STG_E_INVALIDFUNCTION;LARGE_INTEGER result;if(!SetFilePointerEx(handle,position,&result,origin))return HRESULT_FROM_WIN32(GetLastError());if(out)out->QuadPart=result.QuadPart;return S_OK;}
 HRESULT STDMETHODCALLTYPE SetSize(ULARGE_INTEGER)override{return STG_E_ACCESSDENIED;}
 HRESULT STDMETHODCALLTYPE CopyTo(IStream*target,ULARGE_INTEGER length,ULARGE_INTEGER*read,ULARGE_INTEGER*written)override{if(read)read->QuadPart=0;if(written)written->QuadPart=0;char data[65536];while(length.QuadPart){ULONG n=0;HRESULT hr=Read(data,(ULONG)(length.QuadPart>sizeof(data)?sizeof(data):length.QuadPart),&n);if(FAILED(hr))return hr;if(!n)return S_FALSE;if(read)read->QuadPart+=n;ULONG out=0;hr=target->Write(data,n,&out);if(written)written->QuadPart+=out;if(FAILED(hr)||out!=n)return FAILED(hr)?hr:STG_E_WRITEFAULT;length.QuadPart-=n;}return S_OK;}
 HRESULT STDMETHODCALLTYPE Commit(DWORD)override{return S_OK;}
 HRESULT STDMETHODCALLTYPE Revert()override{return STG_E_INVALIDFUNCTION;}
 HRESULT STDMETHODCALLTYPE LockRegion(ULARGE_INTEGER,ULARGE_INTEGER,DWORD)override{return STG_E_INVALIDFUNCTION;}
 HRESULT STDMETHODCALLTYPE UnlockRegion(ULARGE_INTEGER,ULARGE_INTEGER,DWORD)override{return STG_E_INVALIDFUNCTION;}
 HRESULT STDMETHODCALLTYPE Stat(STATSTG*out,DWORD flags)override{if(!out)return E_POINTER;ZeroMemory(out,sizeof(*out));LARGE_INTEGER size;if(!GetFileSizeEx(handle,&size))return HRESULT_FROM_WIN32(GetLastError());out->type=STGTY_STREAM;out->cbSize.QuadPart=size.QuadPart;out->grfMode=STGM_READ|STGM_SHARE_DENY_WRITE;if(!(flags&STATFLAG_NONAME)){out->pwcsName=(LPOLESTR)CoTaskMemAlloc((path.size()+1)*sizeof(wchar_t));if(!out->pwcsName)return E_OUTOFMEMORY;memcpy(out->pwcsName,path.c_str(),(path.size()+1)*sizeof(wchar_t));}return S_OK;}
 HRESULT STDMETHODCALLTYPE Clone(IStream**out)override{if(!out)return E_POINTER;auto*copy=new LocalFileStream(path.c_str());if(!copy->valid()){delete copy;return HRESULT_FROM_WIN32(GetLastError());}LARGE_INTEGER zero={};ULARGE_INTEGER current;HRESULT hr=Seek(zero,STREAM_SEEK_CUR,&current);if(SUCCEEDED(hr)){LARGE_INTEGER at;at.QuadPart=current.QuadPart;hr=copy->Seek(at,STREAM_SEEK_SET,nullptr);}if(FAILED(hr)){copy->Release();return hr;}*out=copy;return S_OK;}
};
