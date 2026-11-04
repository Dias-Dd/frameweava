#pragma once
#include <stdint.h>
#include <optix.h>
struct alignas(16) FwOptixParams {
 OptixTraversableHandle scene;
 const float*origins;const float*directions;uint32_t*hits;float*measurements;float*normals;
 const uint32_t*invalid;uint32_t count;float t_min,t_max;uint32_t mask;
};
struct FwOptixHit {const float*vertices;float normal_sign;};
// Host metadata only; positions are supplied through GPU-resident shared leases.
struct FwOptixGeometry {uint32_t count,mask,id,reserved;float transform[12];};
