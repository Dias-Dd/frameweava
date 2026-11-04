enable wgpu_ray_query;
@group(0) @binding(0) var scene:acceleration_structure;
@group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) p:vec3u){if(p.x>=160u||p.y>=90u){return;}let xy=(vec2f(p.xy)+.5)/vec2f(160.,90.)*2.-1.;var ray:ray_query;rayQueryInitialize(&ray,scene,RayDesc(0u,255u,0.001,100.,vec3f(xy,0.),vec3f(0.,0.,1.)));while(rayQueryProceed(&ray)){}let hit=rayQueryGetCommittedIntersection(&ray);output[p.y*160u+p.x]=vec4f(hit.t,hit.barycentrics,select(0.,1.,hit.kind!=0u));}
