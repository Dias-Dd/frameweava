// Adapted from the reviewed 9dbf886 GPU pipeline experiment. Apache-2.0.
// Storage: rgba8unorm / RGBA8, encoded sRGB, straight alpha. No implicit sRGB textures.
export type PassKind='color'|'blur'|'threshold'|'combine'|'present';
const wgsl=`
struct Params { size:vec4f, values:vec4f };
@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var extra:texture_2d<f32>;
@group(0) @binding(2) var<uniform> p:Params;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
  var v=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(v[i],0.,1.);
}
fn linear(c:vec3f)->vec3f {return select(pow((c+0.055)/1.055,vec3f(2.4)),c/12.92,c<=vec3f(0.04045));}
fn encoded(c:vec3f)->vec3f {let x=clamp(c,vec3f(0.),vec3f(1.));return select(1.055*pow(x,vec3f(1./2.4))-0.055,x*12.92,x<=vec3f(0.0031308));}
fn pixel(t:texture_2d<f32>,q:vec2i)->vec4f {return textureLoad(t,clamp(q,vec2i(0),vec2i(p.size.xy)-vec2i(1)),0);}
fn canonical(c:vec3f,a:f32)->vec4f {return vec4f(select(c,vec3f(0.),a<=0.),clamp(a,0.,1.));}
`;
const bodies:Record<PassKind,string>={
  color:`let c=pixel(source,vec2i(pos.xy));let l=linear(c.rgb);let y=dot(l,vec3f(0.2126,0.7152,0.0722));return canonical(encoded(mix(vec3f(y),l,p.values.x)*p.values.yzw),c.a);`,
  blur:`let q=vec2i(pos.xy);let axis=vec2i(p.values.xy);var sum=vec4f(0.);let weights=array<f32,5>(1.,4.,6.,4.,1.);
    for(var i=0;i<5;i++){let c=pixel(source,q+axis*(i-2));sum+=vec4f(linear(c.rgb)*c.a,c.a)*(weights[i]/16.);}
    return canonical(encoded(sum.rgb/max(sum.a,0.000001)),sum.a);`,
  threshold:`let c=pixel(source,vec2i(pos.xy));let y=dot(linear(c.rgb),vec3f(0.2126,0.7152,0.0722));let mask=select(clamp((y-p.values.x)/max(1.-p.values.x,0.000001),0.,1.),0.,p.values.x>=1.);return canonical(c.rgb,c.a*mask);`,
  combine:`let base=pixel(source,vec2i(pos.xy));let glow=pixel(extra,vec2i(pos.xy));let strength=p.values.x;let a=clamp(base.a+(1.-base.a)*glow.a*strength,0.,1.);return canonical(encoded((linear(base.rgb)*base.a+linear(glow.rgb)*glow.a*strength)/max(a,0.000001)),a);`,
  present:`let c=pixel(source,vec2i(pos.xy));return vec4f(c.rgb*c.a,c.a);`,
};
export const shader=(kind:PassKind)=>wgsl+`\n@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {${bodies[kind]}}`;
const glsl=`#version 300 es
precision highp float;precision highp int;
uniform sampler2D source;uniform sampler2D extra;uniform vec4 size;uniform vec4 values;out vec4 outColor;
vec3 linear(vec3 c){return mix(pow((c+0.055)/1.055,vec3(2.4)),c/12.92,lessThanEqual(c,vec3(0.04045)));}
vec3 encoded(vec3 c){vec3 x=clamp(c,vec3(0.),vec3(1.));return mix(1.055*pow(x,vec3(1./2.4))-0.055,x*12.92,lessThanEqual(x,vec3(0.0031308)));}
vec4 pixel(sampler2D t,ivec2 q){return texelFetch(t,clamp(q,ivec2(0),ivec2(size.xy)-ivec2(1)),0);}
vec4 canonical(vec3 c,float a){return vec4(a<=0.?vec3(0.):c,clamp(a,0.,1.));}
`;
const glBodies:Record<PassKind,string>={
  color:`vec4 c=pixel(source,ivec2(gl_FragCoord.xy));vec3 l=linear(c.rgb);float y=dot(l,vec3(0.2126,0.7152,0.0722));return canonical(encoded(mix(vec3(y),l,values.x)*values.yzw),c.a);`,
  blur:`ivec2 q=ivec2(gl_FragCoord.xy),axis=ivec2(values.xy);vec4 sum=vec4(0.);float weights[5]=float[5](1.,4.,6.,4.,1.);for(int i=0;i<5;i++){vec4 c=pixel(source,q+axis*(i-2));sum+=vec4(linear(c.rgb)*c.a,c.a)*(weights[i]/16.);}return canonical(encoded(sum.rgb/max(sum.a,0.000001)),sum.a);`,
  threshold:`vec4 c=pixel(source,ivec2(gl_FragCoord.xy));float y=dot(linear(c.rgb),vec3(0.2126,0.7152,0.0722));float mask=values.x>=1.?0.:clamp((y-values.x)/max(1.-values.x,0.000001),0.,1.);return canonical(c.rgb,c.a*mask);`,
  combine:`vec4 base=pixel(source,ivec2(gl_FragCoord.xy)),glow=pixel(extra,ivec2(gl_FragCoord.xy));float a=clamp(base.a+(1.-base.a)*glow.a*values.x,0.,1.);return canonical(encoded((linear(base.rgb)*base.a+linear(glow.rgb)*glow.a*values.x)/max(a,0.000001)),a);`,
  // Input upload is top-down. Offscreen FBO y=0 is our logical top; only presentation flips.
  present:`vec4 c=pixel(source,ivec2(int(gl_FragCoord.x),int(size.y)-1-int(gl_FragCoord.y)));return vec4(c.rgb*c.a,c.a);`,
};
export const glFragment=(kind:PassKind)=>glsl+`\nvec4 run(){${glBodies[kind]}}\nvoid main(){outColor=run();}`;
export const glVertex=`#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
