// SPDX-License-Identifier: MIT
// Fixed PBD2.2.0 density, unilateral lambda and cubic kernel port. XSPH is
// Jacobi (separate input/output), not upstream's in-place OpenMP iteration.
export const liquidSphCode=/* wgsl */`
fn lw(r:f32)->f32{let h=paramF32(3u);let q=r/h;if(q>=1.){return 0.;}let k=paramF32(27u);if(q<=.5){return k*(6.*q*q*q-6.*q*q+1.);}return k*2.*pow(1.-q,3.);}
fn lg(d:vec3f)->vec3f{let r=length(d);let h=paramF32(3u);if(r==0.||r>=h){return vec3f(0.);}let q=r/h;let k=paramF32(28u);if(q<=.5){return (d/r)*k*q*(3.*q-2.);}return -(d/r)*k*(1.-q)*(1.-q);}
fn lp(i:u32)->vec3f{let b=i*8u;return vec3f(load0(b),load0(b+1u),load0(b+2u));}
fn lv(i:u32)->vec3f{let b=i*8u;return vec3f(load0(b+4u),load0(b+5u),load0(b+6u));}
fn lu(v:vec3f)->vec3f{let scale=max(abs(v.x),max(abs(v.y),abs(v.z)));if(scale==0.){return vec3f(0.);}let q=v/scale;return q/length(q);}
`;
function collision(binding:number){return /* wgsl */`
fn cf(i:u32)->f32{return load${binding}(i);}
fn cv(k:u32)->vec3f{let b=k*16u;return vec3f(cf(b+8u),cf(b+9u),cf(b+10u));}
fn cd(k:u32,p:vec3f)->vec4f{let b=k*16u;let kind=u32(cf(b));let c=vec3f(cf(b+1u),cf(b+2u),cf(b+3u));let q=p-c;
 if(kind==0u){return vec4f(c,dot(c,p)-cf(b+4u));}if(kind==1u){let r=length(q);return vec4f(select(vec3f(1.,0.,0.),lu(q),r>0.),r-cf(b+4u));}
 let a=abs(q)-vec3f(cf(b+4u),cf(b+5u),cf(b+6u));let outside=max(a,vec3f(0.));let s=select(vec3f(-1.),vec3f(1.),q>=vec3f(0.));if(length(outside)>0.){return vec4f(lu(outside)*s,length(outside));}var axis=0u;if(a.y>a.x){axis=1u;}if(a.z>a[axis]){axis=2u;}var n=vec3f(0.);n[axis]=s[axis];return vec4f(n,a[axis]);}
fn projectLiquid(value:vec3f,prior:vec3f,sweep:bool)->vec3f{let r=paramF32(7u);let low=vec3f(paramF32(16u),paramF32(17u),paramF32(18u))+r;let high=vec3f(paramF32(20u),paramF32(21u),paramF32(22u))-r;var p=clamp(value,low,high);
 for(var k=0u;k<paramU32(13u);k++){let b=k*16u;let kind=u32(cf(b));let center=vec3f(cf(b+1u),cf(b+2u),cf(b+3u));let velocity=cv(k);let dt=paramF32(1u);
  if(sweep&&kind==1u){let start=prior-(center-velocity*dt);let motion=p-prior-velocity*dt;let radius=cf(b+4u)+r;let aa=dot(motion,motion);let bb=dot(start,motion);let cc=dot(start,start)-radius*radius;let disc=bb*bb-aa*cc;if(aa>0.&&cc>0.&&bb<0.&&disc>=0.){let t=(-bb-sqrt(disc))/aa;if(t>=0.&&t<=1.){let n=lu(start+motion*t);p=center+n*radius;}}}
  if(sweep&&kind==2u){let oldCenter=center-velocity*dt;let start=prior-oldCenter;let motion=p-prior-velocity*dt;let extent=vec3f(cf(b+4u),cf(b+5u),cf(b+6u))+r;if(any(abs(start)>extent)){var enter=0.;var exit=1.;var hit=true;for(var axis=0u;axis<3u;axis++){if(motion[axis]==0.){if(abs(start[axis])>extent[axis]){hit=false;}}else{let a=(-extent[axis]-start[axis])/motion[axis];let c=(extent[axis]-start[axis])/motion[axis];enter=max(enter,min(a,c));exit=min(exit,max(a,c));}}if(hit&&enter<=exit&&enter>=0.&&enter<=1.){p=center+start+motion*enter;}}}
  let contact=cd(k,p);if(contact.w<r){p+=contact.xyz*(r-contact.w);}
 }return clamp(p,low,high);}
fn contactVelocity(p:vec3f,value:vec3f)->vec3f{var v=value;let radius=paramF32(7u);let tolerance=paramF32(3u)*1e-4;let low=vec3f(paramF32(16u),paramF32(17u),paramF32(18u))+radius;let high=vec3f(paramF32(20u),paramF32(21u),paramF32(22u))-radius;
 for(var axis=0u;axis<3u;axis++){var n=vec3f(0.);if(p[axis]<=low[axis]+tolerance){n[axis]=1.;}else if(p[axis]>=high[axis]-tolerance){n[axis]=-1.;}let vn=dot(v,n);if(vn<0.){v=(v-n*vn)*(1.-paramF32(14u))-n*vn*paramF32(15u);}}
 for(var k=0u;k<paramU32(13u);k++){let c=cd(k,p);if(c.w<=radius+tolerance){let wall=cv(k);let relative=v-wall;let vn=dot(relative,c.xyz);if(vn<0.){v=wall+(relative-c.xyz*vn)*(1.-cf(k*16u+11u))-c.xyz*vn*cf(k*16u+12u);}}}return v;}
`;}
export const liquidInitCode=liquidSphCode+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*8u;let birth=load0(b+3u);let on=select(0.,1.,paramF32(2u)>=birth);let p=vec3f(load0(b),load0(b+1u),load0(b+2u));var rho=0.;if(on==1.){for(var j=0u;j<paramU32(0u);j++){let a=j*8u;if(paramF32(2u)>=load0(a+3u)){rho+=paramF32(5u)*lw(length(p-vec3f(load0(a),load0(a+1u),load0(a+2u))));}}}store1(b,p.x);store1(b+1u,p.y);store1(b+2u,p.z);store1(b+3u,on);store1(b+4u,load0(b+4u));store1(b+5u,load0(b+5u));store1(b+6u,load0(b+6u));store1(b+7u,rho);}`;
export const liquidPredictCode=liquidSphCode+collision(2)+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*8u;let time=paramF32(2u);let birth=load1(b+3u);let on=select(0.,1.,time>=birth);var p=lp(i);var v=lv(i);if(load0(b+3u)==0.){p=vec3f(load1(b),load1(b+1u),load1(b+2u));v=vec3f(load1(b+4u),load1(b+5u),load1(b+6u));}let prior=p;let dt=min(paramF32(1u),max(0.,time-birth));if(on==1.){v+=vec3f(paramF32(8u),paramF32(9u),paramF32(10u))*dt;p=projectLiquid(p+v*dt,prior,true);}store3(b,p.x);store3(b+1u,p.y);store3(b+2u,p.z);store3(b+3u,on);store3(b+4u,prior.x);store3(b+5u,prior.y);store3(b+6u,prior.z);store3(b+7u,0.);}`;
export const liquidLambdaCode=liquidSphCode+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let p=lp(i);var rho=0.;var denominator=0.;var gradient=vec3f(0.);if(load0(i*8u+3u)==1.){for(var j=0u;j<paramU32(0u);j++){if(load0(j*8u+3u)==0.){continue;}let d=p-lp(j);rho+=paramF32(5u)*lw(length(d));let v=-paramF32(5u)/paramF32(4u)*lg(d);denominator+=dot(v,v);gradient-=v;}}let c=max(rho/paramF32(4u)-1.,0.);let total=denominator+dot(gradient,gradient)+paramF32(6u);var lambda=0.;if(c>0.&&total>0.){lambda=-c/total;}store1(i*4u,lambda);store1(i*4u+1u,rho);store1(i*4u+2u,c);store1(i*4u+3u,0.);}`;
export const liquidCorrectCode=liquidSphCode+collision(2)+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*8u;var p=lp(i);if(load0(b+3u)==1.){var delta=vec3f(0.);for(var j=0u;j<paramU32(0u);j++){if(j!=i&&load0(j*8u+3u)==1.){delta+=(load1(i*4u)+load1(j*4u))*paramF32(5u)/paramF32(4u)*lg(p-lp(j));}}p=projectLiquid(p+delta,p,false);}store3(b,p.x);store3(b+1u,p.y);store3(b+2u,p.z);for(var k=3u;k<8u;k++){store3(b+k,load0(b+k));}}`;
export const liquidVelocityCode=liquidSphCode+collision(3)+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*8u;let p=lp(i);let on=load0(b+3u);let dt=min(paramF32(1u),max(0.,paramF32(2u)-load1(b+3u)));var v=vec3f(load2(b+4u),load2(b+5u),load2(b+6u));if(on==1.&&dt>0.){v=contactVelocity(p,(p-vec3f(load0(b+4u),load0(b+5u),load0(b+6u)))/dt);}var rho=0.;if(on==1.){for(var j=0u;j<paramU32(0u);j++){if(load0(j*8u+3u)==1.){rho+=paramF32(5u)*lw(length(p-lp(j)));}}}store4(b,p.x);store4(b+1u,p.y);store4(b+2u,p.z);store4(b+3u,on);store4(b+4u,v.x);store4(b+5u,v.y);store4(b+6u,v.z);store4(b+7u,rho);}`;
// Akinci2013 cohesion + curvature adaptation uses the paper's normalized
// continuous inner branch; the fixed upstream C++ subtracts m_c outside m_k.
export const liquidCohesionCode=/* wgsl */`
fn lc(r:f32)->f32{let h=paramF32(3u);let q=r/h;if(q>1.){return 0.;}let v=pow(1.-q,3.)*q*q*q;return (4.*paramF32(27u))*select(2.*v-1./64.,v,q>.5);}`;
export const liquidVorticityCode=liquidSphCode+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;var omega=vec3f(0.);var normal=vec3f(0.);if(load0(i*8u+3u)==1.){for(var j=0u;j<paramU32(0u);j++){if(j!=i&&load0(j*8u+3u)==1.){let volume=paramF32(5u)/max(load0(j*8u+7u),paramF32(4u)*1e-6);let grad=lg(lp(i)-lp(j));omega+=volume*cross(lv(j)-lv(i),grad);normal+=paramF32(3u)*volume*grad;}}}store1(i*8u,omega.x);store1(i*8u+1u,omega.y);store1(i*8u+2u,omega.z);store1(i*8u+3u,length(omega));store1(i*8u+4u,normal.x);store1(i*8u+5u,normal.y);store1(i*8u+6u,normal.z);store1(i*8u+7u,0.);}`;
export const liquidFinishCode=liquidSphCode+liquidCohesionCode+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let b=i*8u;var v=lv(i);if(load0(b+3u)==1.){var viscosity=vec3f(0.);var eta=vec3f(0.);var tension=vec3f(0.);let ni=vec3f(load1(b+4u),load1(b+5u),load1(b+6u));for(var j=0u;j<paramU32(0u);j++){if(j==i||load0(j*8u+3u)==0.){continue;}let d=lp(i)-lp(j);let r=length(d);if(r>=paramF32(3u)){continue;}let rhoj=max(load0(j*8u+7u),paramF32(4u)*1e-6);let volume=paramF32(5u)/rhoj;viscosity+=volume*(lv(j)-lv(i))*lw(r);eta+=volume*(load1(j*8u+3u)-load1(b+3u))*lg(d);let nj=vec3f(load1(j*8u+4u),load1(j*8u+5u),load1(j*8u+6u));let kij=2.*paramF32(4u)/max(load0(b+7u)+rhoj,paramF32(4u)*1e-6);tension-=kij*(paramF32(5u)*lu(d)*lc(r)+ni-nj);}let dt=min(paramF32(1u),max(0.,paramF32(2u)-load2(b+3u)));v+=paramF32(11u)*viscosity+dt*(paramF32(12u)*cross(lu(eta),vec3f(load1(b),load1(b+1u),load1(b+2u)))+paramF32(23u)*tension);}for(var k=0u;k<4u;k++){store3(b+k,load0(b+k));}store3(b+4u,v.x);store3(b+5u,v.y);store3(b+6u,v.z);store3(b+7u,load0(b+7u));}`;
