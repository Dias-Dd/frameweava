// SPDX-License-Identifier: Apache-2.0 AND MIT
// Seeded Hash/ValCoord/Hermite subset adapted from fixed FastNoiseLite1.1.1 (vendor/).
// Other mesh warps are authored elementary mathematics; no external solver copied.
const noise=/* wgsl */`
fn md_value(q:vec3i)->f32{var h=(paramU32(12u)^(bitcast<u32>(q.x)*501125321u)^(bitcast<u32>(q.y)*1136930381u)^(bitcast<u32>(q.z)*1720413743u))*0x27d4eb2du;h=h*h;h=h^(h<<19u);return f32(bitcast<i32>(h))/2147483648.0;}
fn md_noise(p:vec3f)->f32{let i=vec3i(floor(p));let f=p-vec3f(i);let u=f*f*(3.0-2.0*f);let a=md_value(i);let b=md_value(i+vec3i(1,0,0));let c=md_value(i+vec3i(0,1,0));let d=md_value(i+vec3i(1,1,0));let e=md_value(i+vec3i(0,0,1));let g=md_value(i+vec3i(1,0,1));let h=md_value(i+vec3i(0,1,1));let j=md_value(i+vec3i(1,1,1));let x0=a+(b-a)*u.x;let x1=c+(d-c)*u.x;let x2=e+(g-e)*u.x;let x3=h+(j-h)*u.x;let y0=x0+(x1-x0)*u.y;let y1=x2+(x3-x2)*u.y;return y0+(y1-y0)*u.z;}
`;
const bodies:Record<string,string>={
 transform:`r=q*vec3f(paramF32(4u),paramF32(5u),paramF32(6u));for(var a=0u;a<3u;a++){let b=(a+1u)%3u;let c=(a+2u)%3u;let t=paramF32(7u+a);let u=r[b];let v=r[c];r[b]=cos(t)*u-sin(t)*v;r[c]=sin(t)*u+cos(t)*v;}r+=vec3f(paramF32(10u),paramF32(11u),paramF32(12u));`,
 twist:`let t=paramF32(6u)*q[a]+paramF32(7u);r[b]=q[b]*cos(t)-q[c]*sin(t);r[c]=q[b]*sin(t)+q[c]*cos(t);`,
 bend:`let k=paramF32(6u);let t=k*q[a];var sinc=1.0;var cosc=0.0;if(abs(t)<0.001){let t2=t*t;sinc=1.0-t2/6.0+t2*t2/120.0;cosc=t*(0.5-t2/24.0+t2*t2/720.0);}else{sinc=sin(t)/t;cosc=(1.0-cos(t))/t;}r[a]=q[a]*sinc-q[b]*sin(t);r[b]=q[a]*cosc+q[b]*cos(t);`,
 taper:`let s=1.0+paramF32(6u)*q[a];r[b]*=s;r[c]*=s;`,
 shear:`r[b]+=paramF32(6u)*q[a];`,
 stretch:`let s=paramF32(6u);r[a]*=s;if(paramU32(7u)==1u){r[b]/=sqrt(s);r[c]/=sqrt(s);}`,
 bulge:`let t=q[a]/paramF32(7u);var s=1.0;if(abs(t)<0.5){s+=paramF32(6u)*cos(3.141592653589793*t);}r[b]*=s;r[c]*=s;`,
 spherify:`let d=length(q);if(d>1e-12){r=mix(q,q*(paramF32(6u)/d),paramF32(7u));}`,
 cylindrify:`let d=length(vec2f(q[b],q[c]));if(d>1e-12){let s=mix(1.0,paramF32(6u)/d,paramF32(7u));r[b]*=s;r[c]*=s;}`,
 wave:`let t=dot(q,vec3f(paramF32(4u),paramF32(5u),paramF32(6u)))*paramF32(10u)+paramF32(11u);r+=vec3f(paramF32(7u),paramF32(8u),paramF32(9u))*sin(t)*paramF32(12u);`,
 ripple:`let d=length(vec2f(q[b],q[c]));r[a]+=paramF32(6u)*sin(d*paramF32(7u)+paramF32(8u))*exp(-d*paramF32(9u));`,
 noise:`let n=vec3f(load1(i),load1(i+1u),load1(i+2u));let d=length(n);if(!md_valid(n,1.0e8)){valid=false;}else if(d>1e-12){r+=n/d*md_noise(q*paramF32(6u)+vec3f(paramF32(8u),paramF32(9u),paramF32(10u)))*paramF32(7u);}`,
 morph:`let other=vec3f(load1(i),load1(i+1u),load1(i+2u));if(!md_valid(other,paramF32(3u))){valid=false;}r=mix(p,other,paramF32(6u))-center;`,
 cage:`let lo=vec3f(paramF32(4u),paramF32(5u),paramF32(6u));let hi=vec3f(paramF32(7u),paramF32(8u),paramF32(9u));let t=(p-lo)/(hi-lo);if(paramU32(10u)==0u||(all(t>=vec3f(0))&&all(t<=vec3f(1)))){r=vec3f(0);for(var z=0u;z<2u;z++){for(var y=0u;y<2u;y++){for(var x=0u;x<2u;x++){let j=12u+(x+2u*y+4u*z)*3u;let corner=vec3f(paramF32(j),paramF32(j+1u),paramF32(j+2u));let w=select(1.0-t.x,t.x,x==1u)*select(1.0-t.y,t.y,y==1u)*select(1.0-t.z,t.z,z==1u);r+=corner*w;}}}r-=center;}`,
 attract:`let d=length(q)/paramF32(9u);if(d<1.0){let w=(1.0-d)*(1.0-d)*(1.0+2.0*d)*paramF32(10u);let goal=vec3f(paramF32(6u),paramF32(7u),paramF32(8u))-center;r=mix(q,goal,w);}`,
};
export function code(name:string,output:number){const body=bodies[name];if(!body)throw Error('Unknown deformation');return (name==='noise'?noise:'')+/* wgsl */`
fn md_valid(v:vec3f,limit:f32)->bool{return all((bitcast<vec3u>(v)&vec3u(0x7f800000u))!=vec3u(0x7f800000u))&&all(abs(v)<=vec3f(limit));}
fn compute(id:vec3u,local:vec3u,group:vec3u){let i=id.x*3u;let raw=vec3f(load0(i),load0(i+1u),load0(i+2u));var valid=md_valid(raw,paramF32(3u));var p=raw;if(!valid){p=vec3f(0);}let center=vec3f(paramF32(0u),paramF32(1u),paramF32(2u));let q=p-center;var r=q;let a=paramU32(44u);let b=paramU32(45u);let c=3u-a-b;
${body}
let out=r+center;if(!md_valid(out,1e30)){valid=false;}for(var k=0u;k<3u;k++){var value=1e35;if(valid){value=out[k];}store${output}(i+k,value);}}
`;}
