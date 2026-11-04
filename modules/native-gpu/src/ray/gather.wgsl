@group(0) @binding(0) var<storage,read> positions:array<u32>;
@group(0) @binding(1) var<storage,read> indices:array<u32>;
@group(0) @binding(2) var<storage,read_write> packed:array<u32>;
@group(0) @binding(3) var<storage,read_write> invalid:array<atomic<u32>>;
@group(0) @binding(4) var<uniform> fw_ray_meta:vec4u;
fn finite(v:vec3f)->bool{return all((bitcast<vec3u>(v)&vec3u(0x7f800000u))!=vec3u(0x7f800000u));}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) p:vec3u,@builtin(num_workgroups) dims:vec3u){let i=(p.x+p.y*dims.x*64u)*3u;if(i>=fw_ray_meta.x){return;}var vertex:array<vec3f,3>;var ok=true;for(var k=0u;k<3u;k++){var id=i+k;if(fw_ray_meta.w!=0u){id=indices[id];}if(id>=fw_ray_meta.z){ok=false;vertex[k]=vec3f(0.);}else{let at=id*3u;vertex[k]=vec3f(bitcast<f32>(positions[at]),bitcast<f32>(positions[at+1u]),bitcast<f32>(positions[at+2u]));ok=ok&&finite(vertex[k]);}}ok=ok&&finite(vertex[1]-vertex[0])&&finite(vertex[2]-vertex[0]);if(!ok){atomicAdd(&invalid[0],1u);}for(var k=0u;k<3u;k++){let v=select(vec3f(0.),vertex[k],ok);let at=(fw_ray_meta.y+i+k)*3u;packed[at]=bitcast<u32>(v.x);packed[at+1u]=bitcast<u32>(v.y);packed[at+2u]=bitcast<u32>(v.z);}}
