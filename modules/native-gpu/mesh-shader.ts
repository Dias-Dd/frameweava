/** Native resident draw contract v1. Position buffers stay on the same device
 * across deformation and rasterization. Matrix is column-major clip transform. */
export const nativeMeshShader=`
@group(0) @binding(0) var<storage,read> positions:array<f32>;
struct Meta {header:array<vec4u,8>,params:array<vec4f,5>}
@group(0) @binding(1) var<uniform> settings:Meta;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
 let matrix=mat4x4f(settings.params[0],settings.params[1],settings.params[2],settings.params[3]);
 return matrix*vec4f(positions[i*3u],positions[i*3u+1u],positions[i*3u+2u],1.);
}
@fragment fn fragment()->@location(0) vec4f{
 let c=settings.params[4];return vec4f(select(c.rgb,c.rgb*c.a,settings.header[0].w==0u),c.a);
}`;

/** Texture v1 samples the owner's existing F32 image buffer: no texture upload,
 * readback or second device. Normalized top-left UVs interpolate in perspective.
 * Texel centers are (i+.5)/size. Filtering is in premultiplied linear light. */
export const nativeTexturedMeshShader=`
@group(0) @binding(0) var<storage,read> positions:array<f32>;
@group(0) @binding(1) var<storage,read> uvs:array<f32>;
@group(0) @binding(2) var<storage,read> pixels:array<vec4f>;
struct Meta {header:array<vec4u,8>,params:array<vec4f,5>}
@group(0) @binding(3) var<uniform> settings:Meta;
struct Vertex { @builtin(position) position:vec4f,@location(0) uv:vec2f }
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{
 let m=mat4x4f(settings.params[0],settings.params[1],settings.params[2],settings.params[3]);
 return Vertex(m*vec4f(positions[i*3u],positions[i*3u+1u],positions[i*3u+2u],1.),vec2f(uvs[i*2u],uvs[i*2u+1u]));
}
fn address(p:i32,size:i32,mode:u32)->i32{
 if(mode==0u){return clamp(p,0,size-1);}
 if(mode==1u){return ((p%size)+size)%size;}
 if(mode==2u){let q=((p%(2*size))+2*size)%(2*size);return select(2*size-1-q,q,q<size);}
 return p;
}
fn boundedUV(v:f32,mode:u32)->f32{
 if(mode==1u){return fract(v);}if(mode==2u){let q=v-2.*floor(v*.5);return select(2.-q,q,q<=1.);}
 return clamp(v,select(-1.,0.,mode==0u),select(2.,1.,mode==0u));
}
fn texel(p:vec2i)->vec4f{
 let size=vec2i(settings.header[1].xy);let q=vec2i(address(p.x,size.x,settings.header[2].x),address(p.y,size.y,settings.header[2].y));
 if(any(q<vec2i(0))||any(q>=size)){return vec4f(0.);}
 let v=pixels[u32(q.y)*u32(size.x)+u32(q.x)];let mode=settings.header[1].z;
 if(mode==1u){return vec4f(v.rgb*v.a,v.a);}if(mode==2u){return vec4f(v.rgb,1.);}return v;
}
@fragment fn fragment(v:Vertex)->@location(0) vec4f{
 let size=vec2f(settings.header[1].xy);
 let uv=vec2f(boundedUV(v.uv.x,settings.header[2].x),boundedUV(v.uv.y,settings.header[2].y));
 var c:vec4f;
 if(settings.header[1].w==0u){c=texel(vec2i(floor(uv*size)));}
 else{let p=uv*size-vec2f(.5);let q=vec2i(floor(p));let f=fract(p);
  c=(texel(q)*(1.-f.x)+texel(q+vec2i(1,0))*f.x)*(1.-f.y)+(texel(q+vec2i(0,1))*(1.-f.x)+texel(q+vec2i(1))*f.x)*f.y;
 }
 let tint=settings.params[4];c=vec4f(c.rgb*tint.rgb*tint.a,c.a*tint.a);
 if(settings.header[0].w==1u){if(c.a==0.){return vec4f(0.);}return vec4f(c.rgb/c.a,c.a);}return c;
}`;

/** Optional raster v1; old shaders above stay byte-for-byte stable. Exact
 * peeling expands indexed vertices in the vertex shader, preserving primitive
 * order without a new geometry host or optional primitive-index builtin. */
export function nativeMeshRasterShader(textured:boolean,mode:'cutout'|'source-over'|'depth-peel'){
 let code=textured?nativeTexturedMeshShader:`
 @group(0) @binding(0) var<storage,read> positions:array<f32>;
 struct Meta{header:array<vec4u,8>,params:array<vec4f,5>}
 @group(0) @binding(1) var<uniform> settings:Meta;
 struct Vertex{@builtin(position) position:vec4f,@location(0) uv:vec2f}
 @vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{
 let m=mat4x4f(settings.params[0],settings.params[1],settings.params[2],settings.params[3]);
 return Vertex(m*vec4f(positions[i*3u],positions[i*3u+1u],positions[i*3u+2u],1.),vec2f(0.));}
 @fragment fn fragment(v:Vertex)->@location(0) vec4f{let t=settings.params[4];return vec4f(t.rgb*t.a,t.a);}`;
 // Every new raster profile shades in PM, including straight texture input.
 if(textured)code=code.replace('if(settings.header[0].w==1u)', 'if(settings.header[0].w==1u&&settings.header[2].w<2u)');
 if(mode==='cutout'){
  // Cutout retains the old target representation, after testing real alpha.
  return code.replace('@fragment fn fragment','fn meshColor').replace('->@location(0) vec4f','->vec4f')+`
 @fragment fn fragment(v:Vertex)->@location(0) vec4f{
 var c=meshColor(v);if(c.a<=bitcast<f32>(settings.header[3].y)){discard;}
 ${textured?'':'if(settings.header[0].w==1u){c=vec4f(c.rgb/c.a,c.a);}'}return c;}`;
 }
 code=code.replace('@fragment fn fragment','fn meshColor').replace('->@location(0) vec4f','->vec4f');
 if(mode==='source-over')return code+`
 @fragment fn fragment(v:Vertex)->@location(0) vec4f{let c=meshColor(v);if(c.a==0.&&all(c.rgb==vec3f(0.))){discard;}return c;}`;
 const base=textured?4:2;
 code=code.replace('@location(0) uv:vec2f','@location(0) uv:vec2f,@location(1) @interpolate(flat) primitive:u32')
  .replace('let m=mat4x4f','let j=triangleIndices[i];let m=mat4x4f')
  .replace('let matrix=mat4x4f','let j=triangleIndices[i];let matrix=mat4x4f')
  .replaceAll('positions[i*','positions[j*').replaceAll('uvs[i*','uvs[j*')
  .replace('vec2f(uvs[j*2u],uvs[j*2u+1u]));','vec2f(uvs[j*2u],uvs[j*2u+1u]),i/3u+1u);')
  .replace('vec2f(0.));','vec2f(0.),i/3u+1u);');
 return code+`
 @group(0) @binding(${base}) var<storage,read> triangleIndices:array<u32>;
 @group(0) @binding(${base+1}) var previousDepth:texture_depth_2d;
 @group(0) @binding(${base+2}) var previousId:texture_2d<u32>;
 @group(0) @binding(${base+3}) var<storage,read_write> alive:atomic<u32>;
 @group(0) @binding(${base+4}) var<uniform> layer:vec4u;
 @group(0) @binding(${base+5}) var<storage,read> transmittance:array<f32>;
 struct Fragment{@location(0) color:vec4f,@location(1) id:u32}
 @fragment fn fragment(v:Vertex)->Fragment{
 let xy=vec2u(v.position.xy);if(transmittance[xy.y*layer.z+xy.x]==0.){discard;}
 if(layer.x>0u){let p=vec2i(v.position.xy);let id=textureLoad(previousId,p,0).x;
  let depth=textureLoad(previousDepth,p,0);if(id==0u||v.position.z<depth||(v.position.z==depth&&v.primitive>=id)){discard;}}
 let c=meshColor(v);if(c.a==0.&&all(c.rgb==vec3f(0.))){discard;}atomicStore(&alive,1u);return Fragment(c,v.primitive);
 }`;
}
