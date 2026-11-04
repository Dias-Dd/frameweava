#pragma once
#include <stdint.h>
// Private native-owner ABI. No authored pointers, URLs or executable paths.
struct FwVideoConfig {
 uint32_t version,width,height,source_width,source_height,ten_bit,transfer,primaries;
 float output_matrix[12]; // linear nits -> output working space; rows padded to 4
 float reference_white,peak_nits,hlg_gamma,reserved;
};
struct FwMediaSurface {uint32_t version,width,height,reserved;uintptr_t texture,fence;};
struct FwLut {uint32_t width,height,channels,linear;const float*values;};
struct FwEncodeConfig {
 uint32_t version,width,height,slots,fps_num,fps_den,codec,primaries,transfer,alpha;
 float matte[3];uint32_t lut_count;const FwLut*luts;const char*shader;uint32_t shader_bytes,hdr;
 uint16_t chromaticities[8];uint32_t max_nits,min_nits;uint16_t max_cll,max_fall;
};
struct FwEncodeComplete {uint32_t slot,reserved;uint64_t frame;};
extern "C" {
__declspec(dllexport) uint64_t fw_media_open(uint64_t adapter_luid);
__declspec(dllexport) int fw_media_close(uint64_t owner);
__declspec(dllexport) uint64_t fw_video_open(uint64_t owner,const wchar_t* file,const FwVideoConfig*);
__declspec(dllexport) int fw_video_close(uint64_t video);
__declspec(dllexport) int fw_video_slots(uint64_t video,uint32_t slots);
__declspec(dllexport) int fw_encode_slots(uint64_t encoder,uint32_t slots);
__declspec(dllexport) int fw_video_surface(uint64_t video,uint32_t slot,FwMediaSurface*);
__declspec(dllexport) int fw_video_frame(uint64_t video,uint32_t slot,uint64_t frame,int64_t expected_relative_pts,uint64_t wait_value,uint64_t ready_value);
__declspec(dllexport) uint32_t fw_media_error(char*,uint32_t);
__declspec(dllexport) uint64_t fw_encode_open(uint64_t owner,const wchar_t* file,const FwEncodeConfig*);
__declspec(dllexport) int fw_encode_surface(uint64_t encoder,uint32_t slot,FwMediaSurface*);
__declspec(dllexport) int fw_encode_frame(uint64_t encoder,uint32_t slot,uint64_t frame,uint64_t wait_value);
__declspec(dllexport) int fw_encode_poll(uint64_t encoder,FwEncodeComplete*,uint32_t);
__declspec(dllexport) int fw_encode_finish(uint64_t encoder);
#ifdef FRAMEWEAVE_MEDIA_DIAGNOSTICS
__declspec(dllexport) int fw_encode_inspect(uint64_t encoder,uint32_t slot,float*rgba,uint32_t words);
#endif
}
