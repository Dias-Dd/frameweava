#include <optix_device.h>
#include "optix_params.h"
#include <cuda_runtime.h>
extern "C" {__constant__ FwOptixParams fw_optix_params;}
static __forceinline__ __device__ float3 plus(float3 a,float3 b){return make_float3(a.x+b.x,a.y+b.y,a.z+b.z);}
static __forceinline__ __device__ float3 minus(float3 a,float3 b){return make_float3(a.x-b.x,a.y-b.y,a.z-b.z);}
static __forceinline__ __device__ float maximum(float3 a){return fmaxf(fmaxf(fabsf(a.x),fabsf(a.y)),fabsf(a.z));}
static __forceinline__ __device__ float3 times(float3 a,float b){return make_float3(a.x*b,a.y*b,a.z*b);}
static __forceinline__ __device__ float3 normal(float3 a){const float m=maximum(a);if(m==0)return make_float3(0,0,0);const float3 q=make_float3(a.x/m,a.y/m,a.z/m);return times(q,1.0f/sqrtf(q.x*q.x+q.y*q.y+q.z*q.z));}
static __forceinline__ __device__ float3 vertex(const float*v,unsigned int i){return make_float3(v[3*i],v[3*i+1],v[3*i+2]);}
static __forceinline__ __device__ bool finite(float3 a){return isfinite(a.x)&&isfinite(a.y)&&isfinite(a.z);}
extern "C" __global__ void __raygen__fw(){
 const auto&p=fw_optix_params;const unsigned int i=optixGetLaunchIndex().x;if(i>=p.count)return;
 const unsigned int base=4*i,status=p.invalid[0]?4u:0u;p.hits[base]=0;p.hits[base+1]=p.hits[base+2]=0xffffffffu;p.hits[base+3]=status;
 for(unsigned int j=0;j<4;j++){p.measurements[base+j]=0;p.normals[base+j]=0;}
 const float3 o=vertex(p.origins,i),d=vertex(p.directions,i);
 if(!finite(o)||!finite(d)){p.hits[base+3]=status|1u;return;}if(maximum(d)==0){p.hits[base+3]=status|2u;return;}
 const float3 direction=normal(d);unsigned int payload=i;
 optixTrace(p.scene,o,direction,p.t_min,p.t_max,0.0f,OptixVisibilityMask(p.mask),OPTIX_RAY_FLAG_DISABLE_ANYHIT,0,1,0,payload);
}
extern "C" __global__ void __miss__fw(){}
extern "C" __global__ void __closesthit__fw(){
 const auto&p=fw_optix_params;const auto&hit=*(const FwOptixHit*)optixGetSbtDataPointer();const unsigned int i=optixGetPayload_0(),base=4*i,primitive=optixGetPrimitiveIndex();
 const float3 a=vertex(hit.vertices,3*primitive);float3 e=minus(vertex(hit.vertices,3*primitive+1),a),f=minus(vertex(hit.vertices,3*primitive+2),a);const float s=fmaxf(maximum(e),maximum(f));e=times(e,1.0f/fmaxf(s,1e-30f));f=times(f,1.0f/fmaxf(s,1e-30f));
 const float3 object_normal=normal(make_float3(e.y*f.z-e.z*f.y,e.z*f.x-e.x*f.z,e.x*f.y-e.y*f.x));
 float m[12];optixGetWorldToObjectTransformMatrix(m);float ms=0;for(unsigned int r=0;r<3;r++)for(unsigned int c=0;c<3;c++)ms=fmaxf(ms,fabsf(m[4*r+c]));const float inv=1.0f/fmaxf(ms,1e-30f);
 const float3 n=times(normal(make_float3((m[0]*inv)*object_normal.x+(m[4]*inv)*object_normal.y+(m[8]*inv)*object_normal.z,(m[1]*inv)*object_normal.x+(m[5]*inv)*object_normal.y+(m[9]*inv)*object_normal.z,(m[2]*inv)*object_normal.x+(m[6]*inv)*object_normal.y+(m[10]*inv)*object_normal.z)),hit.normal_sign);
 const float3 d=optixGetWorldRayDirection();const float2 bary=optixGetTriangleBarycentrics();p.hits[base]=1;p.hits[base+1]=optixGetInstanceId();p.hits[base+2]=primitive;
 p.measurements[base]=optixGetRayTmax();p.measurements[base+1]=bary.x;p.measurements[base+2]=bary.y;
 p.normals[base]=n.x;p.normals[base+1]=n.y;p.normals[base+2]=n.z;p.normals[base+3]=(n.x*d.x+n.y*d.y+n.z*d.z)<0?1.0f:0.0f;
}
