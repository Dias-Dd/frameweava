// Three r186/MIT Ray.intersectTriangle dominant-axis shear/edge algorithm.
// See native upstream receipt. BRDF is an authored single-scatter GGX profile;
// no claim of exact Three MeshStandardMaterial shader equivalence is made.
export const nativeMeshCode=/* wgsl */`
fn nm_hit(ro:vec3f,rd:vec3f,a:vec3f,b:vec3f,c:vec3f)->vec4f{
 let axis=abs(rd);var kz=2u;if(axis.x>=axis.y&&axis.x>=axis.z){kz=0u;}else if(axis.y>=axis.z){kz=1u;}
 var kx=(kz+1u)%3u;var ky=(kx+1u)%3u;if(rd[kz]<0.){let hold=kx;kx=ky;ky=hold;}
 if(rd[kz]==0.){return vec4f(-1.);}
 let A=a-ro;let B=b-ro;let C=c-ro;let sx=rd[kx]/rd[kz];let sy=rd[ky]/rd[kz];let sz=1./rd[kz];
 let ax=A[kx]-sx*A[kz];let ay=A[ky]-sy*A[kz];let bx=B[kx]-sx*B[kz];let by=B[ky]-sy*B[kz];let cx=C[kx]-sx*C[kz];let cy=C[ky]-sy*C[kz];
 let u=cx*by-cy*bx;let v=ax*cy-ay*cx;let w=bx*ay-by*ax;
 if((u<0.||v<0.||w<0.)&&(u>0.||v>0.||w>0.)){return vec4f(-1.);}
 let det=u+v+w;if(det==0.){return vec4f(-1.);}let t=sz*(u*A[kz]+v*B[kz]+w*C[kz])/det;
 return vec4f(t,u/det,v/det,w/det);
}
fn nm_vertex(base:u32)->vec3f{return vec3f(data0(base),data0(base+1u),data0(base+2u));}
fn nm_material(base:u32)->vec3f{return vec3f(data1(base),data1(base+1u),data1(base+2u));}
fn nm_light(base:u32)->vec3f{return vec3f(data2(base),data2(base+1u),data2(base+2u));}
fn nm_unit(v:vec3f)->vec3f{return v/max(length(v),1e-20);}
fn pixel(px:vec2u)->vec4f{
 let size=vec2f(outputSize());let ndc=vec2f((f32(px.x)+.5)/size.x*2.-1.,1.-(f32(px.y)+.5)/size.y*2.);
 var ro=vec3f(0.);var rd=nm_unit(vec3f(ndc.x/paramF32(0u),ndc.y/paramF32(1u),-1.));
 if(paramU32(4u)==1u){ro=vec3f(ndc.x/paramF32(0u),ndc.y/paramF32(1u),0.);rd=vec3f(0.,0.,-1.);}
 var best=paramF32(3u)/-rd.z;let near=paramF32(2u)/-rd.z;var selected=0xffffffffu;var bary=vec3f(0.);var face=vec3f(0.);
 for(var triangle=0u;triangle<paramU32(5u);triangle++){
  let base=triangle*18u;let a=nm_vertex(base);let b=nm_vertex(base+3u);let c=nm_vertex(base+6u);let raw=cross(b-a,c-a)*data1(triangle*12u+9u);
  if(paramU32(11u)==1u&&dot(raw,rd)>=0.){continue;}
  let hit=nm_hit(ro,rd,a,b,c);if(hit.x>=near&&hit.x<best){best=hit.x;selected=triangle;bary=hit.yzw;face=raw;}
 }
 if(selected==0xffffffffu){return vec4f(0.);}
 let material=selected*12u;let colour=nm_material(material);let opacity=data1(material+8u);
 if(paramU32(7u)==0u){return vec4f(colour*opacity,opacity);}
 let p=ro+rd*best;var N=nm_unit(face);
 if(paramU32(12u)==1u){let base=selected*18u;N=nm_unit(nm_vertex(base+9u)*bary.x+nm_vertex(base+12u)*bary.y+nm_vertex(base+15u)*bary.z);}
 if(dot(face,rd)>0.){N=-N;}
 let V=select(nm_unit(-p),vec3f(0.,0.,1.),paramU32(4u)==1u);
 let roughness=max(.0525,data1(material+6u));let metalness=data1(material+7u);let diffuse=colour*(1.-metalness);let specular=mix(vec3f(.04),colour,metalness);
 let ambient=vec3f(paramF32(8u),paramF32(9u),paramF32(10u));var light=nm_material(material+3u)+ambient*diffuse;
 let alpha=roughness*roughness;let alpha2=alpha*alpha;let NV=max(dot(N,V),0.);
 for(var i=0u;i<paramU32(6u);i++){
  let L=nm_light(i*6u);let irradiance=nm_light(i*6u+3u);let H=nm_unit(V+L);let NL=max(dot(N,L),0.);let NH=max(dot(N,H),0.);let VH=max(dot(V,H),0.);
  let F=specular+(vec3f(1.)-specular)*pow(1.-VH,5.);let divisor=NH*NH*(alpha2-1.)+1.;let D=alpha2/(3.141592653589793*divisor*divisor);
  let visibility=.5/max(NL*sqrt(alpha2+(1.-alpha2)*NV*NV)+NV*sqrt(alpha2+(1.-alpha2)*NL*NL),1e-12);
  light+=irradiance*NL*(diffuse/3.141592653589793+F*D*visibility);
 }
 return vec4f(light*opacity,opacity);
}`;
