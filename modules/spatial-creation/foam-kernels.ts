// SPDX-License-Identifier: MIT
// Physics adapted from EffectCraft sim2/foam.rs, pinned in UPSTREAM.json.
// Copyright 2026 ArtCraft Team and EffectCraft contributors.
// Frameweave port: seconds, configurable budgets, simultaneous GPU pair pass,
// existing Native stateStep/FixedStepRunner, scene-linear PM GPU shading.
export const foamAdvanceCode=/* wgsl */`
fn fh(a:u32,b:u32)->f32{var x=a*1664525u+b*1013904223u+paramU32(2u);x=(x^(x>>16u))*2246822519u;x=(x^(x>>13u))*3266489917u;return f32(x^(x>>16u))/4294967296.;}
fn ft(x:i32,y:i32)->f32{let w=i32(paramU32(24u));let h=i32(paramU32(25u));let i=u32(clamp(y,0,h-1)*w+clamp(x,0,w-1))*4u;return dot(vec3f(load1(i),load1(i+1u),load1(i+2u)),vec3f(.2126,.7152,.0722));}
fn height(p:vec2f)->f32{let uv=vec2f(p.x/paramF32(3u)+.5,.5-p.y/paramF32(4u));let xy=uv*vec2f(f32(paramU32(24u)),f32(paramU32(25u)))-.5;let a=vec2i(floor(xy));let t=fract(xy);return mix(mix(ft(a.x,a.y),ft(a.x+1,a.y),t.x),mix(ft(a.x,a.y+1),ft(a.x+1,a.y+1),t.x),t.y);}
fn compute(g:vec3u,l:vec3u,w:vec3u){
 let i=g.x;let b=i*16u;let t=paramF32(0u);let dt=paramF32(1u);let rate=paramF32(5u);let initial=paramU32(6u);let count=paramU32(7u);
 var first=0.;if(i>=initial){if(rate<=0.){for(var k=0u;k<16u;k++){store2(b+k,0.);}return;}first=f32(i-initial+1u)/rate;}
 var birth=first;var generation=0u;if(rate>0.&&t>=first){let period=f32(count)/rate;generation=u32(floor(max(0.,t-first)/period));birth+=f32(generation)*period;}
 let id=i+generation*count;let age=t-birth;let lifetime=paramF32(8u)*(1.-paramF32(9u)*fh(id,11u));
 let born=age>=0.&&(load0(b+9u)==0.||load0(b+8u)!=f32(id)||t-dt<birth);
 var p=vec2f(load0(b),load0(b+1u));var v=vec2f(load0(b+2u),load0(b+3u));var spin=load0(b+6u);
 let size=paramF32(10u)*(1.+paramF32(11u)*(fh(id,3u)*2.-1.));
 if(born){p=vec2f((fh(id,1u)-.5)*paramF32(3u),(fh(id,2u)-.5)*paramF32(4u));v=vec2f(paramF32(12u),paramF32(13u));spin=fh(id,12u)*6.28318530718;}
 let previous=max(0.,load0(b+4u));let living=age>=0.&&age<lifetime;var popped=0.;if(age>=lifetime&&t-dt-birth<lifetime){popped=1.;}
 if(living||popped>0.){
  var elapsed=dt;if(born){elapsed=min(dt,max(0.,age));}
  let wind=vec2f(paramF32(14u),paramF32(15u));v=mix(v,wind,1.-exp(-paramF32(16u)*elapsed))*exp(-paramF32(17u)*elapsed);
  v+=vec2f(sin(p.x*2.7+p.y*1.9+t*.5),cos(p.y*3.1-p.x*1.3+t*.5))*paramF32(18u)*elapsed;
  if(paramU32(24u)>0u){let e=paramF32(26u);let grad=vec2f(height(p+vec2f(e,0.))-height(p-vec2f(e,0.)),height(p+vec2f(0.,e))-height(p-vec2f(0.,e)))/(2.*e);v-=grad*paramF32(27u)*elapsed;}
  p+=v*elapsed;spin+=v.x/max(size,.000001)*elapsed;
 }
 store2(b,p.x);store2(b+1u,p.y);store2(b+2u,v.x);store2(b+3u,v.y);store2(b+4u,age);store2(b+5u,size);store2(b+6u,spin);store2(b+7u,lifetime);store2(b+8u,f32(id));store2(b+9u,select(0.,1.,living));store2(b+10u,previous);store2(b+11u,popped);for(var k=12u;k<16u;k++){store2(b+k,0.);}
}`;
export const foamPairCode=/* wgsl */`
fn radius(i:u32)->f32{return load0(i+5u)*clamp(max(0.,load0(i+4u))*paramF32(1u),0.,1.);}
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*16u;var p=vec2f(load0(b),load0(b+1u));var v=vec2f(load0(b+2u),load0(b+3u));let r=radius(b);var dp=vec2f(0.);var dv=vec2f(0.);
 if(load0(b+9u)>0.){for(var j=0u;j<paramU32(0u);j++){if(j==i){continue;}let q=j*16u;let delta=p-vec2f(load0(q),load0(q+1u));var d=length(delta);var direction=vec2f(1.,0.);if(i<j){direction=-direction;}if(d>.000001){direction=delta/d;}d=max(d,.000001);let rr=radius(q);let overlap=r+rr-d;
  if(load0(q+9u)>0.&&overlap>0.){let k=.5*overlap*min(paramF32(2u),4.)*(1.-paramF32(3u)*.5);dp+=direction*k;dv+=(vec2f(load0(q+2u),load0(q+3u))-v)*paramF32(3u)*paramF32(4u);}
  let reach=max(rr*3.,paramF32(5u));if(load0(q+11u)>0.&&d<reach){dv+=direction*paramF32(6u)*(1.-d/reach);}
 }}
 for(var k=0u;k<16u;k++){store1(b+k,load0(b+k));}let limit=paramF32(7u);dp=clamp(dp,vec2f(-limit),vec2f(limit));let damping=1./max(1.,paramF32(8u));v+=dv*damping;p+=dp;store1(b,p.x);store1(b+1u,p.y);store1(b+2u,v.x);store1(b+3u,v.y);
}`;
export const foamDrawCode=/* wgsl */`
fn sample_aux(which:u32,uv0:vec2f,size:vec2u)->vec4f{let uv=clamp(uv0,vec2f(0.),vec2f(.999999));let p=vec2u(uv*vec2f(size));let i=(p.y*size.x+p.x)*4u;if(which==1u){return vec4f(data1(i),data1(i+1u),data1(i+2u),data1(i+3u));}return vec4f(data2(i),data2(i+1u),data2(i+2u),data2(i+3u));}
fn pixel(xy:vec2u)->vec4f{let size=vec2f(f32(paramU32(0u)),f32(paramU32(1u)));let p=(vec2f(xy)+.5-size*.5)*vec2f(1.,-1.)*paramF32(3u)/size.y;var result=vec4f(0.);
 for(var i=0u;i<paramU32(2u);i++){let b=i*16u;if(data0(b+9u)==0.){continue;}let age=max(0.,data0(b+4u));let r=data0(b+5u)*min(1.,age*paramF32(4u));if(r<=0.){continue;}var uv=(p-vec2f(data0(b),data0(b+1u)))/r;let dist=length(uv);let aa=paramF32(3u)/size.y/r;if(dist>1.+aa){continue;}
  let spin=data0(b+6u);uv=mat2x2f(cos(spin),-sin(spin),sin(spin),cos(spin))*uv;let coverage=1.-smoothstep(max(0.,1.-aa),1.+aa,dist);let fade=clamp((data0(b+7u)-age)/paramF32(5u),0.,1.);let rim=pow(clamp(dist,0.,1.),8.);let highlight=pow(max(0.,1.-length(uv-vec2f(-.28,.32))/.55),4.);let style=paramU32(6u);
  var alpha=paramF32(10u)*(.08+.7*rim+.3*highlight);var rgb=vec3f(paramF32(7u),paramF32(8u),paramF32(9u));
  if(style==1u){alpha=paramF32(10u)*(.25+.5*rim);rgb*=vec3f(1.1,.9,.6);}else if(style==2u){alpha=paramF32(10u)*(.7+.3*highlight);}else if(style==3u){alpha=paramF32(10u)*(.3+.5*rim);rgb*=vec3f(.7,.9,1.);}else if(style==4u){alpha=paramF32(10u)*(.65+.25*rim);}
  rgb+=highlight*paramF32(11u);if(paramU32(12u)>0u){let tex=sample_aux(1u,uv*vec2f(.5,-.5)+.5,vec2u(paramU32(12u),paramU32(13u)));rgb=select(vec3f(0.),tex.rgb/max(tex.a,.00000001),tex.a>0.);alpha=tex.a*paramF32(10u);}
  if(paramU32(14u)>0u){let reflectUV=mix(uv*vec2f(.5,-.5)+.5,vec2f(data0(b)/paramF32(16u)+.5,.5-data0(b+1u)/paramF32(17u)),paramF32(18u));let env=sample_aux(2u,reflectUV,vec2u(paramU32(14u),paramU32(15u)));rgb+=env.rgb*paramF32(19u)*(.3+.7*dist*dist);}
  alpha=clamp(alpha*coverage*fade,0.,1.);result=vec4f(rgb*alpha,alpha)+result*(1.-alpha);
 }return result;}
`;
