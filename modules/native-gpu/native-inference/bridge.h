#pragma once
#include <stdint.h>
// Private engine ABI. Resource handles never come from authored JS.
struct FwTensor {const char*name;const int64_t*shape;uint32_t rank;uint32_t reserved;uint64_t bytes;};
struct FwTensorLease{uint32_t version;uint32_t reserved;uint64_t bytes;uint64_t allocation_bytes;uintptr_t memory;uintptr_t fence;};
extern "C" {
__declspec(dllexport) uint64_t fw_inference_open(const wchar_t*runtime,uint64_t luid);
__declspec(dllexport) int fw_inference_close(uint64_t owner);
__declspec(dllexport) uint64_t fw_inference_model(uint64_t owner,const uint8_t*onnx,uint64_t bytes,const FwTensor*inputs,uint32_t in_count,const FwTensor*outputs,uint32_t out_count,const wchar_t*profile);
__declspec(dllexport) int fw_inference_tensor(uint64_t model,uint32_t slot,uint32_t tensor,FwTensorLease*);
__declspec(dllexport) int fw_inference_run(uint64_t model,uint32_t slot,uint64_t wait,uint64_t ready);
__declspec(dllexport) int fw_inference_release_model(uint64_t model);
__declspec(dllexport) uint32_t fw_inference_error(char*,uint32_t);
}
// CPU-readable metadata only; tensor pixels are never returned by these methods.
extern "C" __declspec(dllexport) uint32_t fw_inference_profile(uint64_t id,char*out,uint32_t size);
extern "C" __declspec(dllexport) int fw_inference_slots(uint64_t id,uint32_t slots);

extern "C" __declspec(dllexport) uint32_t fw_inference_info(uint64_t owner,char*out,uint32_t size);
