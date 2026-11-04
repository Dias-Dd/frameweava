// SPDX-License-Identifier: Apache-2.0 AND MIT
// Hash/ValCoord/Hermite lattice subset: FastNoiseLite1.1.1, Jordan Peck/contributors, MIT.
// All other routines are authored mathematical implementations; no solver runtime copied.
const common=/* wgsl */`
fn sc_origin()->vec3f{return vec3f(paramF32(2u),paramF32(3u),paramF32(4u));}
fn sc_spacing()->vec3f{return vec3f(paramF32(5u),paramF32(6u),paramF32(7u));}
fn sc_world(p:vec3u)->vec3f{return sc_origin()+vec3f(p)*sc_spacing();}
fn sc_wrap(p:vec3i,d:vec3u)->vec3i{let n=vec3i(d);return ((p%n)+n)%n;}
fn sc_limit(v:vec3f,m:f32)->vec3f{let s=length(v);return v*min(1.0,m/max(s,1e-20));}
`;
const noise=/* wgsl */`
fn sc_hash(q:vec3i)->u32{return (paramU32(24u)^(bitcast<u32>(q.x)*501125321u)^(bitcast<u32>(q.y)*1136930381u)^(bitcast<u32>(q.z)*1720413743u))*0x27d4eb2du;}
fn sc_rand(q:vec3i)->f32{return f32(sc_hash(q)>>8u)/16777216.0;}
fn sc_value(q:vec3i)->f32{var h=sc_hash(q);h=h*h;h=h^(h<<19u);return f32(bitcast<i32>(h))/2147483648.0;}
fn sc_noise(p:vec3f)->f32{let i=vec3i(floor(p));let f=p-vec3f(i);let u=f*f*(3.0-2.0*f);
 let a=sc_value(i);let b=sc_value(i+vec3i(1,0,0));let c=sc_value(i+vec3i(0,1,0));let d=sc_value(i+vec3i(1,1,0));
 let e=sc_value(i+vec3i(0,0,1));let g=sc_value(i+vec3i(1,0,1));let h=sc_value(i+vec3i(0,1,1));let j=sc_value(i+vec3i(1,1,1));
 let x0=a+(b-a)*u.x;let x1=c+(d-c)*u.x;let x2=e+(g-e)*u.x;let x3=h+(j-h)*u.x;let y0=x0+(x1-x0)*u.y;let y1=x2+(x3-x2)*u.y;return y0+(y1-y0)*u.z;
}
fn sc_potential(p:vec3f)->vec3f{return vec3f(sc_noise(p+vec3f(17.125,3.25,9.5)),sc_noise(p+vec3f(5.5,29.25,1.125)),sc_noise(p+vec3f(13.25,7.5,37.125)));}
`;
function periodic(n:number){return `fn sc_read${n}(p:vec3i,c:u32)->f32{return field${n}(sc_wrap(p,fieldDomain${n}()),c);}\n`;}
export function computeCode(name:string):string{
 switch(name){
 case 'cellular':return common+noise+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=sc_world(id)*paramF32(8u);let cell=vec3i(floor(q));var best=100.0;
 for(var z=-2;z<=2;z++){for(var y=-2;y<=2;y++){for(var x=-2;x<=2;x++){let c=cell+vec3i(x,y,z);let p=vec3f(c)+vec3f(sc_rand(c),sc_rand(c+vec3i(37,17,11)),sc_rand(c+vec3i(7,53,23)));let d=q-p;best=min(best,dot(d,d));}}}
 storeField0(vec3i(id),0u,exp(-paramF32(9u)*best)*paramF32(10u));}`;
 case 'vortex':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let p=sc_world(id)-vec3f(paramF32(8u),paramF32(9u),paramF32(10u));let s=paramF32(12u)*exp(-dot(p.xz,p.xz)/(2.0*paramF32(11u)*paramF32(11u)));let v=vec3f(-p.z*s,paramF32(13u),p.x*s);for(var c=0u;c<3u;c++){storeField0(vec3i(id),c,v[c]);}}`;
 case 'curlNoise':return common+noise+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let f=paramF32(8u);let p=sc_world(id)*f+vec3f(0,paramF32(1u)*.1,0);let e=paramF32(10u)*f;
 let dx=(sc_potential(p+vec3f(e,0,0))-sc_potential(p-vec3f(e,0,0)))/(2.0*paramF32(10u));
 let dy=(sc_potential(p+vec3f(0,e,0))-sc_potential(p-vec3f(0,e,0)))/(2.0*paramF32(10u));
 let dz=(sc_potential(p+vec3f(0,0,e))-sc_potential(p-vec3f(0,0,e)))/(2.0*paramF32(10u));
 let v=vec3f(dy.z-dz.y,dz.x-dx.z,dx.y-dy.x)*paramF32(9u);for(var c=0u;c<3u;c++){storeField0(vec3i(id),c,v[c]);}}`;
 case 'advect':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);let v=vec3f(field1(q,0u),field1(q,1u),field1(q,2u));let p=vec3f(id)-v*paramF32(0u)/sc_spacing();for(var c=0u;c<fieldComponents0();c++){storeField2(q,c,sampleField0(p,c,paramU32(8u)==1u));}}`;
 case 'diffuse':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);let h=sc_spacing();for(var c=0u;c<fieldComponents0();c++){var sum=0.0;var den=1.0;for(var a=0u;a<3u;a++){if(fieldDomain0()[a]>1u){var e=vec3i(0);e[a]=1;let w=paramF32(0u)*paramF32(8u)/(h[a]*h[a]);sum+=w*(fieldClamped1(q+e,c)+fieldClamped1(q-e,c));den+=2.0*w;}}storeField2(q,c,(field0(q,c)+sum)/den);}}`;
 case 'divergence':return common+periodic(0)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);var d=0.0;for(var a=0u;a<3u;a++){if(fieldDomain0()[a]>1u){var e=vec3i(0);e[a]=1;d+=(sc_read0(q,a)-sc_read0(q-e,a))/sc_spacing()[a];}}storeField1(q,0u,d);}`;
 case 'pressure':return common+periodic(1)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);var sum=0.0;var den=0.0;for(var a=0u;a<3u;a++){if(fieldDomain0()[a]>1u){var e=vec3i(0);e[a]=1;let w=1.0/(sc_spacing()[a]*sc_spacing()[a]);sum+=w*(sc_read1(q+e,0u)+sc_read1(q-e,0u));den+=2.0*w;}}var p=0.0;if(den>0.0){p=sc_read1(q,0u)+(2.0/3.0)*((sum-field0(q,0u))/den-sc_read1(q,0u));}storeField2(q,0u,p);}`;
 case 'project':return common+periodic(1)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);for(var a=0u;a<3u;a++){var grad=0.0;if(fieldDomain0()[a]>1u){var e=vec3i(0);e[a]=1;grad=(sc_read1(q+e,0u)-sc_read1(q,0u))/sc_spacing()[a];}storeField2(q,a,field0(q,a)-grad);}}`;
 case 'curl':return common+periodic(0)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);var dx=vec3f(0);var dy=vec3f(0);var dz=vec3f(0);for(var c=0u;c<3u;c++){dx[c]=(sc_read0(q+vec3i(1,0,0),c)-sc_read0(q-vec3i(1,0,0),c))/(2.0*sc_spacing().x);dy[c]=(sc_read0(q+vec3i(0,1,0),c)-sc_read0(q-vec3i(0,1,0),c))/(2.0*sc_spacing().y);dz[c]=(sc_read0(q+vec3i(0,0,1),c)-sc_read0(q-vec3i(0,0,1),c))/(2.0*sc_spacing().z);}let v=vec3f(dy.z-dz.y,dz.x-dx.z,dx.y-dy.x);for(var c=0u;c<3u;c++){storeField1(q,c,v[c]);}}`;
 case 'confine':return common+periodic(1)+/* wgsl */`
fn sc_omega(p:vec3i)->vec3f{return vec3f(sc_read1(p,0u),sc_read1(p,1u),sc_read1(p,2u));}
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);var g=vec3f(0);for(var a=0u;a<3u;a++){var e=vec3i(0);e[a]=1;g[a]=(length(sc_omega(q+e))-length(sc_omega(q-e)))/(2.0*sc_spacing()[a]);}let n=g/max(length(g),1e-12);let force=cross(n,sc_omega(q))*paramF32(8u)*paramF32(0u);for(var c=0u;c<3u;c++){storeField2(q,c,field0(q,c)+force[c]);}}`;
 case 'reaction':return common+periodic(0)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);let uv=vec2f(field0(q,0u),field0(q,1u));var lap=vec2f(0);for(var a=0u;a<3u;a++){if(fieldDomain0()[a]>1u){var e=vec3i(0);e[a]=1;for(var c=0u;c<2u;c++){lap[c]+=(sc_read0(q+e,c)+sc_read0(q-e,c)-2.0*uv[c])/(sc_spacing()[a]*sc_spacing()[a]);}}}let react=uv.x*uv.y*uv.y;let rhs=vec2f(paramF32(8u)*lap.x-react+paramF32(10u)*(1.0-uv.x),paramF32(9u)*lap.y+react-(paramF32(10u)+paramF32(11u))*uv.y);let next=uv+rhs*paramF32(0u)*paramF32(12u);storeField1(q,0u,next.x);storeField1(q,1u,next.y);}`;
 case 'wave':return common+periodic(0)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);let u=field0(q,0u);var lap=0.0;for(var a=0u;a<3u;a++){if(fieldDomain0()[a]>1u){var e=vec3i(0);e[a]=1;lap+=(sc_read0(q+e,0u)+sc_read0(q-e,0u)-2.0*u)/(sc_spacing()[a]*sc_spacing()[a]);}}let dt=paramF32(0u);let b=paramF32(9u)*dt*.5;storeField2(q,0u,(2.0*u-(1.0-b)*field1(q,0u)+paramF32(8u)*paramF32(8u)*dt*dt*lap)/(1.0+b));}`;
 case 'erosionFlux':return common+periodic(0)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);for(var c=0u;c<4u;c++){var e=vec3i(0);e[c/2u]=select(-1,1,c%2u==1u);let d=field0(q,0u)-sc_read0(q+e,0u)-paramF32(8u)*sc_spacing()[c/2u];storeField1(q,c,max(d,0.0)*paramF32(0u)*paramF32(9u));}}`;
 case 'erosionGather':return common+periodic(1)+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);var h=field0(q,0u);for(var c=0u;c<4u;c++){var e=vec3i(0);e[c/2u]=select(-1,1,c%2u==1u);h+=sc_read1(q+e,c^1u)-field1(q,c);}storeField2(q,0u,h);}`;
 case 'distanceInit':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);for(var c=0u;c<3u;c++){storeField1(q,c,f32(id[c]));}storeField1(q,3u,select(0.0,1.0,field0(q,0u)>=paramF32(8u)));}`;
 case 'distanceJump':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);var best=vec3f(0);var dist=3.0e30;var valid=0.0;let stride=i32(paramU32(8u));for(var z=-1;z<=1;z++){if(fieldDomain0().z==1u&&z!=0){continue;}for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){let r=q+vec3i(x,y,z)*stride;if(any(r<vec3i(0))||any(r>=vec3i(fieldDomain0()))||field0(r,3u)==0.0){continue;}let candidate=vec3f(field0(r,0u),field0(r,1u),field0(r,2u));let delta=(candidate-vec3f(id))*sc_spacing();let d=dot(delta,delta);if(d<dist||(d==dist&&(candidate.z<best.z||(candidate.z==best.z&&(candidate.y<best.y||(candidate.y==best.y&&candidate.x<best.x)))))){best=candidate;dist=d;valid=1.0;}}}}for(var c=0u;c<3u;c++){storeField1(q,c,best[c]);}storeField1(q,3u,valid);}`;
 case 'distanceFinal':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){let q=vec3i(id);let valid=field0(q,3u);var d=0.0;if(valid>0.0){let p=vec3f(field0(q,0u),field0(q,1u),field0(q,2u));d=length((p-vec3f(id))*sc_spacing());}storeField1(q,0u,d);storeField1(q,1u,valid);}`;
 case 'particleAdvect':return common+/* wgsl */`
fn sc_velocity(p:vec3f)->vec3f{let q=(p-sc_origin())/sc_spacing();let clampEdge=paramU32(8u)==1u;return vec3f(sampleField1(q,0u,clampEdge),sampleField1(q,1u,clampEdge),sampleField1(q,2u,clampEdge));}
fn compute(id:vec3u,local:vec3u,group:vec3u){let i=id.x*3u;let p=vec3f(load0(i),load0(i+1u),load0(i+2u));let dt=paramF32(0u);let v=sc_velocity(p);let next=p+sc_velocity(p+v*dt*.5)*dt;for(var c=0u;c<3u;c++){store2(i+c,next[c]);}}`;
 case 'flock':return common+/* wgsl */`
fn sc_pos(i:u32)->vec3f{return vec3f(load0(i*3u),load0(i*3u+1u),load0(i*3u+2u));}
fn sc_vel(i:u32)->vec3f{return vec3f(load1(i*3u),load1(i*3u+1u),load1(i*3u+2u));}
fn compute(id:vec3u,local:vec3u,group:vec3u){let p=sc_pos(id.x);let v=sc_vel(id.x);let lo=vec3f(paramF32(14u),paramF32(15u),paramF32(16u));let extent=vec3f(paramF32(17u),paramF32(18u),paramF32(19u))-lo;var separation=vec3f(0);var alignment=vec3f(0);var cohesion=vec3f(0);var count=0.0;
 for(var j=0u;j<dataLength0()/3u;j++){if(j==id.x){continue;}var delta=sc_pos(j)-p;delta-=floor(delta/extent+.5)*extent;let d2=dot(delta,delta);if(d2<paramF32(8u)*paramF32(8u)){count+=1.0;cohesion+=delta;alignment+=sc_vel(j);separation-=delta/max(d2,1e-6);}}
 var force=vec3f(0);if(count>0.0){force=separation*paramF32(9u)+(alignment/count-v)*paramF32(10u)+cohesion/count*paramF32(11u);}force=sc_limit(force,paramF32(13u));let dt=paramF32(0u);var nextV=v;var nextP=p;if(dt!=0.0){nextV=sc_limit(v+force*dt,paramF32(12u));nextP=p+nextV*dt;nextP=lo+(nextP-lo)-floor((nextP-lo)/extent)*extent;}for(var c=0u;c<3u;c++){store2(id.x*3u+c,nextP[c]);store3(id.x*3u+c,nextV[c]);}}`;
 case 'splat':return common+/* wgsl */`
fn compute(id:vec3u,local:vec3u,group:vec3u){var density=0.0;for(var i=0u;i<dataLength0()/3u;i++){let p=(vec3f(load0(i*3u),load0(i*3u+1u),load0(i*3u+2u))-sc_origin())/sc_spacing();let w=max(vec3f(0),vec3f(1)-abs(p-vec3f(id)));density+=w.x*w.y*w.z*paramF32(8u);}storeField1(vec3i(id),0u,density);}`;
 default:throw Error('Unknown fixed spatial compute program '+name);
 }
}
export function volumeCode(){return common+/* wgsl */`
fn sc_ray(px:vec2u)->vec3f{let size=vec2f(outputSize());let uv=(2.0*(vec2f(px)+.5)/size-1.0)*vec2f(size.x/size.y,-1);let f=vec3f(paramF32(14u),paramF32(15u),paramF32(16u));let r=vec3f(paramF32(17u),paramF32(18u),paramF32(19u));let u=vec3f(paramF32(20u),paramF32(21u),paramF32(22u));return normalize(f+paramF32(23u)*(uv.x*r+uv.y*u));}
fn pixel(px:vec2u)->vec4f{let ro=vec3f(paramF32(11u),paramF32(12u),paramF32(13u));let rd=sc_ray(px);let lo=sc_origin()-.5*sc_spacing();let hi=sc_origin()+(vec3f(fieldDimensions0())-.5)*sc_spacing();var a=paramF32(25u);var b=paramF32(26u);
 for(var c=0u;c<3u;c++){if(rd[c]==0.0){if(ro[c]<lo[c]||ro[c]>hi[c]){return vec4f(0);}}else{let x=(lo[c]-ro[c])/rd[c];let y=(hi[c]-ro[c])/rd[c];a=max(a,min(x,y));b=min(b,max(x,y));}}
 if(b<=a){return vec4f(0);}let dt=(b-a)/f32(paramU32(27u));var optical=0.0;let ink=vec3f(paramF32(8u),paramF32(9u),paramF32(10u))*paramF32(28u);
 for(var i=0u;i<paramU32(27u);i++){let p=(ro+rd*(a+(f32(i)+.5)*dt)-sc_origin())/sc_spacing();let rho=sampleField0(p,0u,true);if(rho<0.0){return vec4f(bitcast<f32>(paramU32(31u)));}optical+=rho*dt;}
 var alpha=1.0-exp(-optical);if(optical<.01){alpha=optical*(1.0-optical*(.5-optical*(1.0/6.0-optical/24.0)));}
 return vec4f(ink*alpha,alpha);
}`;}
