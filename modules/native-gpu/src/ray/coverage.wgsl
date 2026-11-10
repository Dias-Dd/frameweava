@group(0) @binding(10) var<storage,read> coverage:array<u32>;
@group(0) @binding(11) var<storage,read> texels:array<f32>;
@group(0) @binding(12) var<uniform> coverage_meta:vec4u;
fn coverageUV(triangle:u32,base:u32,bary:vec2f)->vec2f {
 let i=base+triangle*6u;
 let a=vec2f(bitcast<f32>(coverage[i]),bitcast<f32>(coverage[i+1u]));
 let b=vec2f(bitcast<f32>(coverage[i+2u]),bitcast<f32>(coverage[i+3u]));
 let c=vec2f(bitcast<f32>(coverage[i+4u]),bitcast<f32>(coverage[i+5u]));
 return a*(1.-bary.x-bary.y)+b*bary.x+c*bary.y;
}
fn alphaAddress(p:i32,size:i32,mode:u32)->i32 {
 if(mode==0u){return clamp(p,0,size-1);}
 if(mode==1u){return ((p%size)+size)%size;}
 let period=size*2;let i=((p%period)+period)%period;return min(i,period-1-i);
}
fn alphaUnit(v:f32,mode:u32)->f32 {
 if(mode==0u){return clamp(v,0.,1.);}if(mode==1u){return fract(v);}
 let t=v-2.*floor(v*.5);return min(t,2.-t);
}
fn alphaTexel(p:vec2i,region:u32)->f32 {
 let size=vec2i(i32(coverage[region+2u]),i32(coverage[region+3u]));
 let xy=vec2u(u32(alphaAddress(p.x,size.x,coverage[region+4u])),u32(alphaAddress(p.y,size.y,coverage[region+5u])));
 let pixel=coverage[region]+xy.x+(coverage[region+1u]+xy.y)*coverage[region+7u];
 return texels[pixel*4u+3u];
}
fn alphaTexture(region:u32,uv:vec2f)->f32 {
 if(region==0u){return 1.;}
 let size=vec2f(f32(coverage[region+2u]),f32(coverage[region+3u]));
 let unit=vec2f(alphaUnit(uv.x,coverage[region+4u]),alphaUnit(uv.y,coverage[region+5u]));
 let q=unit*size-.5;let p=vec2i(floor(q));let f=fract(q);
 if(coverage[region+6u]!=0u){return alphaTexel(vec2i(floor(q+.5)),region);}
 return mix(mix(alphaTexel(p,region),alphaTexel(p+vec2i(1,0),region),f.x),
  mix(alphaTexel(p+vec2i(0,1),region),alphaTexel(p+1,region),f.x),f.y);
}
fn coverageHash(v:u32)->u32 {
 var n=v;n=(n^(n>>16u))*0x7feb352du;n=(n^(n>>15u))*0x846ca68bu;return n^(n>>16u);
}
fn visibleCandidate(hit:RayIntersection,d:vec3f,lane:u32)->bool {
 if(hit.kind!=1u){return false;}
 let record=1u+hit.instance_custom_data*select(14u,16u,coverage_meta.x==2u);
 if(coverage[record+13u]!=0u) {
  let n=hitNormal(hit);
  if(dot(n,d)>=0.){return false;}
 }
 let mode=coverage[record+11u];
 if(mode==0u){return true;}
 let uv=coverageUV(hit.primitive_index,coverage[record],hit.barycentrics);
 var colorAlpha=1.;
 if(coverage_meta.x==2u){
  let base=coverage[record+14u];
  if(base!=0u){
   let at=base+hit.primitive_index*12u;let bary=hit.barycentrics;
   colorAlpha=bitcast<f32>(coverage[at+3u])*(1.-bary.x-bary.y)
    +bitcast<f32>(coverage[at+7u])*bary.x+bitcast<f32>(coverage[at+11u])*bary.y;
  }
 }
 let alpha=clamp(bitcast<f32>(coverage[record+10u])*alphaTexture(coverage[record+1u],uv)*colorAlpha,0.,1.);
 if(mode==1u){return alpha>=bitcast<f32>(coverage[record+12u]);}
 let random=f32(coverageHash(coverage_meta.y^coverageHash(lane)^coverageHash(hit.instance_custom_data)^coverageHash(hit.primitive_index+0x924ac71du))>>8u)*(1./16777216.);
 return random<alpha;
}
