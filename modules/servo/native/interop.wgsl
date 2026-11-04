// Explicit SDR-sRGB8 boundary. These GPU copies never imply HDR preservation
// inside Servo; native images outside this module keep their original values.
struct Frame {width:u32,height:u32,alpha:u32,reserved:u32}
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<uniform> frame:Frame;
fn encode(v:vec3f)->vec3f {let p=clamp(v,vec3f(0.),vec3f(1.));return select(12.92*p,1.055*pow(p,vec3f(1./2.4))-.055,p>vec3f(.0031308));}
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(p[i],0.,1.);}
@fragment fn to_servo(@builtin(position) p:vec4f)->@location(0) vec4f {
 let c=source[u32(p.y)*frame.width+u32(p.x)];let a=select(clamp(c.a,0.,1.),1.,frame.alpha==2u);
 var rgb=c.rgb;if frame.alpha==0u {rgb=select(vec3f(0.),rgb/max(a,1e-30),a>0.);}
 return vec4f(encode(rgb)*a,a);
}
