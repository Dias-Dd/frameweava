enable wgpu_ray_query;
@group(0) @binding(0) var scene:acceleration_structure;
@group(0) @binding(1) var<storage,read> origins:array<f32>;
@group(0) @binding(2) var<storage,read> directions:array<f32>;
@group(0) @binding(3) var<storage,read_write> hits:array<vec4u>;
@group(0) @binding(4) var<storage,read_write> measurements:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> normals:array<vec4f>;
@group(0) @binding(6) var<storage,read> packed:array<u32>;
@group(0) @binding(7) var<storage,read> geometry:array<vec4u>;
@group(0) @binding(8) var<storage,read> invalid:array<u32>;
@group(0) @binding(9) var<uniform> fw_ray_meta:vec4u;
fn finite(v:vec3f)->bool{return all((bitcast<vec3u>(v)&vec3u(0x7f800000u))!=vec3u(0x7f800000u));}
fn maximum(v:vec3f)->f32{return max(max(abs(v.x),abs(v.y)),abs(v.z));}
fn normal(v:vec3f)->vec3f{let s=maximum(v);if(s==0.){return vec3f(0.);}let q=v/s;return q/sqrt(dot(q,q));}
fn vertex(i:u32)->vec3f{let at=i*3u;return vec3f(bitcast<f32>(packed[at]),bitcast<f32>(packed[at+1u]),bitcast<f32>(packed[at+2u]));}
fn hitNormal(hit:RayIntersection)->vec3f{let g=geometry[hit.instance_index];let b=g.x+hit.primitive_index*3u;let a=vertex(b);var e=vertex(b+1u)-a;var f=vertex(b+2u)-a;let scale=max(maximum(e),maximum(f));e/=max(scale,1e-30);f/=max(scale,1e-30);let objectNormal=normal(cross(e,f));let inverse=mat3x3f(hit.world_to_object[0],hit.world_to_object[1],hit.world_to_object[2]);let s=max(max(maximum(inverse[0]),maximum(inverse[1])),maximum(inverse[2]));let n=normal(transpose(inverse*(1./max(s,1e-30)))*objectNormal)*bitcast<f32>(g.z);return n;}
// FW_COVERAGE_HELPERS
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) p:vec3u,@builtin(num_workgroups) dims:vec3u){let i=p.x+p.y*dims.x*64u;if(i>=fw_ray_meta.x){return;}let at=i*3u;let o=vec3f(origins[at],origins[at+1u],origins[at+2u]);let d=vec3f(directions[at],directions[at+1u],directions[at+2u]);var status=select(0u,4u,invalid[0]!=0u);hits[i]=vec4u(0u,0xffffffffu,0xffffffffu,status);measurements[i]=vec4f(0.);normals[i]=vec4f(0.);if(!finite(o)||!finite(d)){hits[i].w=status|1u;return;}if(maximum(d)==0.){hits[i].w=status|2u;return;}
 var rq:ray_query;rayQueryInitialize(&rq,scene,RayDesc(/* FW_RAY_FLAGS */0u,fw_ray_meta.w,bitcast<f32>(fw_ray_meta.y),bitcast<f32>(fw_ray_meta.z),o,normal(d)));while(rayQueryProceed(&rq)){/* FW_COVERAGE_CANDIDATE */}let hit=rayQueryGetCommittedIntersection(&rq);if(hit.kind==0u){return;}let n=hitNormal(hit);hits[i]=vec4u(1u,hit.instance_custom_data,hit.primitive_index,status);measurements[i]=vec4f(hit.t,hit.barycentrics,0.);normals[i]=vec4f(n,select(0.,1.,dot(n,normal(d))<0.));}
