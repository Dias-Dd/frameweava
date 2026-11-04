// SPDX-License-Identifier: Apache-2.0
import {nativeMeshCode} from '../skeletal-effects/src/native-mesh-shader.ts';
/** Original Native Three-ray/GGX mathematics, with owned attribute sampling
 * and complete front-to-back layers. This is an ordinary Stage GPU recipe. */
const hit=nativeMeshCode.slice(0,nativeMeshCode.indexOf('fn nm_vertex')).replace('let u=cx*by-cy*bx;let v=ax*cy-ay*cx;let w=bx*ay-by*ax;', 'let u=cm_determinant(cx,by,cy,bx);let v=cm_determinant(ax,cy,ay,cx);let w=cm_determinant(bx,ay,by,ax);').replace('let t=sz*','if((u==0.&&!cm_edge(vec2f(bx,by),vec2f(cx,cy),det))||(v==0.&&!cm_edge(vec2f(cx,cy),vec2f(ax,ay),det))||(w==0.&&!cm_edge(vec2f(ax,ay),vec2f(bx,by),det))){return vec4f(-1.);}\n let t=sz*');
const brdf=nativeMeshCode.slice(nativeMeshCode.indexOf('let roughness='),nativeMeshCode.indexOf('\n}`;')>=0?nativeMeshCode.indexOf('\n}`;'):nativeMeshCode.lastIndexOf('\n}')).replaceAll('data1(','data3(').replaceAll('nm_material','cm_mat').replaceAll('nm_light','cm_light');
export const characterSkinCode=/* wgsl */`
fn cm_read(i:u32)->vec3f{return vec3f(load0(i),load0(i+1u),load0(i+2u));}
fn cm_matrix(i:u32)->mat4x4f{let b=i*16u;return mat4x4f(vec4f(load1(b),load1(b+1u),load1(b+2u),load1(b+3u)),vec4f(load1(b+4u),load1(b+5u),load1(b+6u),load1(b+7u)),vec4f(load1(b+8u),load1(b+9u),load1(b+10u),load1(b+11u)),vec4f(load1(b+12u),load1(b+13u),load1(b+14u),load1(b+15u)));}
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*8u;let rest=load2(b+7u);var p=cm_read(rest);var n=cm_read(rest+3u);let local=load2(b+5u);let count=load2(b+6u);
 for(var j=0u;j<load2(b+3u);j++){let strength=load1(paramU32(1u)+load2(b+4u)+j);let at=load2(b+2u)+(j*count+local)*6u;p+=cm_read(at)*strength;n+=cm_read(at+3u)*strength;}
 var transform=mat4x4f(vec4f(0.),vec4f(0.),vec4f(0.),vec4f(0.));for(var j=0u;j<load2(b+1u);j++){let k=load2(b)+j;transform+=cm_matrix(load2(paramU32(0u)+k))*load0(paramU32(2u)+k);}
 let q=(transform*vec4f(p,1.)).xyz;let a=transform[0].xyz;let c=transform[1].xyz;let d=transform[2].xyz;let det=dot(a,cross(c,d));var normal=vec3f(0.);if(abs(det)>1e-20){normal=(cross(c,d)*n.x+cross(d,a)*n.y+cross(a,c)*n.z)/det;normal/=max(length(normal),1e-20);}
 store3(i*6u,q.x);store3(i*6u+1u,q.y);store3(i*6u+2u,q.z);store3(i*6u+3u,normal.x);store3(i*6u+4u,normal.y);store3(i*6u+5u,normal.z);
}`;
export const characterPixelCode=/* wgsl */`
fn cm_determinant(a:f32,b:f32,c:f32,d:f32)->f32{let p=a*b;let q=c*d;let v=(p-q)+(fma(a,b,-p)-fma(c,d,-q));let bound=4.7683716e-7*(abs(p)+abs(q));return select(v,0.,abs(v)<=bound);}
fn cm_edge(a:vec2f,b:vec2f,det:f32)->bool{let d=select(b-a,a-b,det<0.);return d.y>0.||(d.y==0.&&d.x<0.);}
${hit}
fn nm_unit(v:vec3f)->vec3f{return v/max(length(v),1e-20);}
fn cm_value(i:u32)->vec3f{return vec3f(data0(i),data0(i+1u),data0(i+2u));}
fn cm_view()->mat4x4f{return mat4x4f(vec4f(paramF32(16u),paramF32(17u),paramF32(18u),paramF32(19u)),vec4f(paramF32(20u),paramF32(21u),paramF32(22u),paramF32(23u)),vec4f(paramF32(24u),paramF32(25u),paramF32(26u),paramF32(27u)),vec4f(paramF32(28u),paramF32(29u),paramF32(30u),paramF32(31u)));}
fn cm_vertex(i:u32)->vec3f{return (cm_view()*vec4f(cm_value(i),1.)).xyz;}
fn cm_normal(i:u32)->vec3f{return (cm_view()*vec4f(cm_value(i),0.)).xyz;}
fn cm_mat(i:u32)->vec3f{return vec3f(data3(i),data3(i+1u),data3(i+2u));}
fn cm_light(i:u32)->vec3f{return cm_mat(paramU32(13u)+i);}
fn cm_wrap(i:i32,size:i32,mode:u32)->i32{if(mode==0u){return clamp(i,0,size-1);}if(mode==1u){return ((i%size)+size)%size;}let period=size*2;let x=((i%period)+period)%period;return select(x,period-1-x,x>=size);}
fn cm_texel(m:u32,p:vec2i)->vec4f{let size=vec2i(i32(data3(m+14u)),i32(data3(m+15u)));let q=vec2i(cm_wrap(p.x,size.x,u32(data3(m+16u))),cm_wrap(p.y,size.y,u32(data3(m+17u))));return read0(vec2i(i32(data3(m+12u)),i32(data3(m+13u)))+q);}
fn cm_texture(m:u32,uv0:vec2f)->vec4f{if(data3(m+19u)==0.){return vec4f(1.);}let uv=uv0*vec2f(data3(m+22u),data3(m+23u));let angle=data3(m+24u);let q=vec2f(cos(angle)*uv.x-sin(angle)*uv.y,sin(angle)*uv.x+cos(angle)*uv.y)+vec2f(data3(m+20u),data3(m+21u));let p=q*vec2f(data3(m+14u),data3(m+15u))-.5;if(data3(m+18u)==0.){return cm_texel(m,vec2i(floor(p+.5)));}let base=vec2i(floor(p));let f=fract(p);return mix(mix(cm_texel(m,base),cm_texel(m,base+vec2i(1,0)),f.x),mix(cm_texel(m,base+vec2i(0,1)),cm_texel(m,base+vec2i(1,1)),f.x),f.y);}
fn cm_shade(material:u32,colour:vec3f,opacity:f32,p:vec3f,N0:vec3f,rd:vec3f,ro:vec3f)->vec4f{if(paramU32(7u)==0u||data3(material+26u)==1.){return vec4f(colour*opacity,opacity);}let N=N0;let V=select(nm_unit(-p),vec3f(0.,0.,1.),paramU32(4u)==1u);${brdf}}
fn pixel(px:vec2u)->vec4f{let size=vec2f(outputSize());let ndc=vec2f((f32(px.x)+.5)/size.x*2.-1.,1.-(f32(px.y)+.5)/size.y*2.);var ro=vec3f(0.);var rd=nm_unit(vec3f(ndc.x/paramF32(0u),ndc.y/paramF32(1u),-1.));if(paramU32(4u)==1u){ro=vec3f(ndc.x/paramF32(0u),ndc.y/paramF32(1u),0.);rd=vec3f(0.,0.,-1.);}let near=paramF32(2u)/-rd.z;let far=paramF32(3u)/-rd.z;var previous=near;var previousId=0xffffffffu;var result=vec4f(0.);
 for(var layer=0u;layer<paramU32(5u);layer++){var best=far;var selected=0xffffffffu;var bary=vec3f(0.);var face=vec3f(0.);for(var t=0u;t<paramU32(5u);t++){let base=t*4u;let a=cm_vertex(data1(base)*6u);let b=cm_vertex(data1(base+1u)*6u);let c=cm_vertex(data1(base+2u)*6u);let raw=cross(b-a,c-a);let material=data1(base+3u)*32u;if(data3(material+25u)==0.&&dot(raw,rd)>=0.){continue;}let h=nm_hit(ro,rd,a,b,c);if(h.x<near||h.x>far||layer>0u&&(h.x<previous||h.x==previous&&t<=previousId)){continue;}if(h.x<best||h.x==best&&t<selected){best=h.x;selected=t;bary=h.yzw;face=raw;}}
 if(selected==0xffffffffu){break;}previous=best;previousId=selected;let base=selected*4u;let a=data1(base);let b=data1(base+1u);let c=data1(base+2u);let material=data1(base+3u)*32u;var uv=vec2f(0.);var vertex=vec4f(0.);var N=vec3f(0.);let ids=array<u32,3>(a,b,c);for(var k=0u;k<3u;k++){let index=ids[k];let at=index*6u;uv+=vec2f(data2(at),data2(at+1u))*bary[k];vertex+=vec4f(data2(at+2u),data2(at+3u),data2(at+4u),data2(at+5u))*bary[k];N+=cm_normal(index*6u+3u)*bary[k];}if(length(N)<1e-10){N=face;}N=nm_unit(N);if(dot(face,rd)>0.){N=-N;}let tex=cm_texture(material,uv);let colour=cm_mat(material)*vertex.xyz*tex.xyz;var opacity=data3(material+8u)*vertex.w*tex.w;let mode=u32(data3(material+10u));if(mode==0u){opacity=1.;}else if(mode==1u){opacity=select(0.,1.,opacity>=data3(material+11u));}opacity=clamp(opacity,0.,1.)*paramF32(14u);if(opacity>0.){let surface=cm_shade(material,colour,opacity,ro+rd*best,N,rd,ro);result+=surface*(1.-result.w);if(result.w==1.){break;}}}
 return result;
}`;
/** Inputs are already admitted, linear float images. Repacking is a GPU copy,
 * not a CPU image roundtrip; straight pixels allow alpha-mode interpretation. */
export const characterAtlasCode=/* wgsl */`
fn pixel(p:vec2u)->vec4f{let at=vec2u(paramU32(0u),paramU32(1u));let size=size1();if(p.x<at.x||p.y<at.y||p.x>=at.x+size.x||p.y>=at.y+size.y){return read0(vec2i(p));}var v=read1(vec2i(p-at));if(paramU32(2u)==1u){if(v.w>0.){v=vec4f(v.xyz/v.w,v.w);}else{v=vec4f(0.);}}return v;}`;
