struct Frame {width:u32,height:u32,reserved0:u32,reserved1:u32}
@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
@group(0) @binding(2) var<uniform> frame:Frame;
fn decode(v:vec3f)->vec3f {let p=clamp(v,vec3f(0.),vec3f(1.));return select(p/12.92,pow((p+.055)/1.055,vec3f(2.4)),p>vec3f(.04045));}
@compute @workgroup_size(8,8) fn from_servo(@builtin(global_invocation_id) p:vec3u){
 if p.x>=frame.width||p.y>=frame.height{return;}let c=textureLoad(source,vec2i(p.xy),0);var rgb=vec3f(0.);
 if c.a>0. {rgb=decode(c.rgb/c.a)*c.a;}output[p.y*frame.width+p.x]=vec4f(rgb,c.a);
}
