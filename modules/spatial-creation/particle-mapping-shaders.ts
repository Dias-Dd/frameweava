// SPDX-License-Identifier: Apache-2.0
// Authored field transformations and standard Porter-Duff billboard coverage.
// All resources/bindings are supplied by the existing NativeGpuScope ABI.
export const propertyMapCode=/* wgsl */`
fn pm_tap(x:i32,y:i32)->vec4f {
 let w=i32(paramU32(1u));let h=i32(paramU32(2u));var xx=x;var yy=y;
 if(paramU32(10u)==3u&&(x<0||y<0||x>=w||y>=h)){return vec4f(0.);}
 if(paramU32(10u)==2u){xx=((x%w)+w)%w;yy=((y%h)+h)%h;}else{xx=clamp(x,0,w-1);yy=clamp(y,0,h-1);}
 let i=u32(yy*w+xx)*4u;return vec4f(load2(i),load2(i+1u),load2(i+2u),load2(i+3u));
}
fn pm_sample(uv:vec2f)->vec4f {
 let size=vec2f(f32(paramU32(1u)),f32(paramU32(2u)));
 if(paramU32(13u)==0u){let p=vec2i(floor(uv*size));return pm_tap(p.x,p.y);}
 let p=uv*size-.5;let a=vec2i(floor(p));let t=fract(p);
 return mix(mix(pm_tap(a.x,a.y),pm_tap(a.x+1,a.y),t.x),mix(pm_tap(a.x,a.y+1),pm_tap(a.x+1,a.y+1),t.x),t.y);
}
fn compute(g:vec3u,l:vec3u,w:vec3u){
 let i=g.x*12u;var v:array<f32,12>;for(var k=0u;k<12u;k++){v[k]=load0(i+k);}
 let ax=paramU32(8u);let ay=paramU32(9u);var xy=vec2f(v[ax],v[ay]);if(paramU32(11u)==1u){xy=vec2f(load1(i+ax),load1(i+ay));}
 let uv=vec2f((xy.x-paramF32(4u))/(paramF32(6u)-paramF32(4u)),1.-(xy.y-paramF32(5u))/(paramF32(7u)-paramF32(5u)));
 let outside=any(uv<vec2f(0.))||any(uv>vec2f(1.));
 if(!outside||paramU32(10u)!=0u){
  var rgba=pm_sample(uv);if(rgba.a>0.){rgba=vec4f(rgba.rgb/rgba.a,rgba.a);}else{rgba=vec4f(0.);}
  for(var r=0u;r<paramU32(3u);r++){
   let at=r*8u;let propertyIndex=u32(load3(at));let channel=u32(load3(at+1u));let mode=u32(load3(at+2u));
   var value=dot(rgba.rgb,vec3f(.2126,.7152,.0722));if(channel<4u){value=rgba[channel];}
   if(load3(at+6u)!=0.){value=clamp(value,0.,1.);}value=load3(at+3u)+(load3(at+4u)-load3(at+3u))*value;
   let old=v[propertyIndex];if(mode==1u){value=old+value;}else if(mode==2u){value=old*value;}
   var strength=load3(at+5u);if(paramU32(12u)==1u){strength*=rgba.a;}v[propertyIndex]=mix(old,value,strength);
   if(propertyIndex==3u){v[propertyIndex]=max(0.,v[propertyIndex]);}if(propertyIndex==7u){v[propertyIndex]=clamp(v[propertyIndex],0.,1.);}
  }
 }
 for(var k=0u;k<12u;k++){store4(i+k,v[k]);}
}`;
export const particleIntegrateCode=/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x*12u;let dt=paramF32(0u);let damping=exp(-paramF32(4u)*dt);for(var k=0u;k<3u;k++){let v=(load0(i+4u+k)+paramF32(1u+k)*dt)*damping;store0(i+4u+k,v);store0(i+k,load0(i+k)+v*dt);}}
`;
export const particleSortCode=/* wgsl */`
fn pd_depth(i:u32)->f32{return dot(vec3f(load0(i*12u),load0(i*12u+1u),load0(i*12u+2u))-vec3f(paramF32(0u),paramF32(1u),paramF32(2u)),vec3f(paramF32(3u),paramF32(4u),paramF32(5u)));}
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let d=pd_depth(i);var rank=0u;for(var j=0u;j<paramU32(6u);j++){let other=pd_depth(j);if(other>d||(other==d&&j<i)){rank++;}}store1(rank,i);}
`;
export const particleDrawCode=/* wgsl */`
fn pixel(pxy:vec2u)->vec4f {
 let matrix=mat4x4f(vec4f(paramF32(0u),paramF32(1u),paramF32(2u),paramF32(3u)),vec4f(paramF32(4u),paramF32(5u),paramF32(6u),paramF32(7u)),vec4f(paramF32(8u),paramF32(9u),paramF32(10u),paramF32(11u)),vec4f(paramF32(12u),paramF32(13u),paramF32(14u),paramF32(15u)));
 let size=vec2f(f32(paramU32(16u)),f32(paramU32(17u)));let point=vec2f(pxy)+.5;var result=vec4f(0.);
 for(var j=0u;j<paramU32(18u);j++){
  let i=data1(j)*12u;let p=vec3f(data0(i),data0(i+1u),data0(i+2u));
  let depth=dot(p-vec3f(paramF32(24u),paramF32(25u),paramF32(26u)),vec3f(paramF32(27u),paramF32(28u),paramF32(29u)));
  if(depth<paramF32(21u)||depth>paramF32(22u)){continue;}
  let q=matrix*vec4f(p,1.);if(q.w<=0.){continue;}let ndc=q.xy/q.w;let center=(ndc*vec2f(.5,-.5)+.5)*size;
  var radius=data0(i+3u)*paramF32(30u)*size.y*paramF32(20u)*.5;if(paramU32(19u)==1u){radius/=depth;}
  if(radius<=0.){continue;}let distance=length(point-center);let coverage=1.-smoothstep(max(0.,radius-.75),radius+.75,distance);let alpha=clamp(data0(i+7u),0.,1.)*coverage;
  let rgb=vec3f(data0(i+8u),data0(i+9u),data0(i+10u));result=vec4f(rgb*alpha,alpha)+result*(1.-alpha);
 }return result;
}`;
