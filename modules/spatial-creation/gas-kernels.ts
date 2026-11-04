// SPDX-License-Identifier: Apache-2.0
// Advection, compatible periodic divergence/gradient and weighted Jacobi are
// reused directly from the existing spatial-compute implementation.
export {computeCode as gasOperatorCode} from '../spatial-compute/kernels.ts';
const geometry=/* wgsl */`
fn world(p:vec3u)->vec3f{return vec3f(paramF32(2u),paramF32(3u),paramF32(4u))+vec3f(p)*vec3f(paramF32(5u),paramF32(6u),paramF32(7u));}
fn mask(p:vec3f,c:vec3f,e:vec3f,box:bool)->f32{let q=abs((p-c)/e);var r=length(q);if(box){r=max(q.x,max(q.y,q.z));}return 1.-smoothstep(.6,1.,r);}
`;
export const gasInitCode=geometry+/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){let p=world(g);var state=vec4f(0.);var velocity=vec3f(0.);for(var i=0u;i<paramU32(50u);i++){let b=i*24u;let weight=mask(p,vec3f(load0(b),load0(b+1u),load0(b+2u)),vec3f(load0(b+4u),load0(b+5u),load0(b+6u)),load0(b+3u)==1.);state+=vec4f(load0(b+7u),load0(b+8u),load0(b+9u),0.)*weight;velocity+=vec3f(load0(b+10u),load0(b+11u),load0(b+12u))*weight;}state.y=max(-paramF32(32u),state.y);for(var c=0u;c<4u;c++){storeField1(vec3i(g),c,state[c]);}for(var c=0u;c<3u;c++){storeField2(vec3i(g),c,velocity[c]);}}`;
export const gasReactCode=geometry+/* wgsl */`
fn omega(p:vec3i)->vec3f{let d=vec3i(fieldDomain2());let q=((p%d)+d)%d;return vec3f(field2(q,0u),field2(q,1u),field2(q,2u));}
fn oneMinusExp(x:f32)->f32{if(x<.001){return x*(1.-x*(.5-x*(1./6.-x/24.)));}return 1.-exp(-x);}
fn compute(g:vec3u,l:vec3u,w:vec3u){let q=vec3i(g);let dt=paramF32(0u);let p=world(g);var soot=field0(q,0u);var heat=field0(q,1u);var fuel=field0(q,2u);var velocity=vec3f(field1(q,0u),field1(q,1u),field1(q,2u));
 for(var i=0u;i<paramU32(47u);i++){let b=i*24u;let start=load3(b+14u);let end=load3(b+15u);let time=paramF32(1u);let elapsed=max(0.,min(time,select(end,time,end<0.))-max(time-dt,start));let shape=mask(p,vec3f(load3(b),load3(b+1u),load3(b+2u)),vec3f(load3(b+4u),load3(b+5u),load3(b+6u)),load3(b+3u)==1.);let amount=elapsed*shape;soot+=load3(b+7u)*amount;heat+=load3(b+8u)*amount;fuel+=load3(b+9u)*amount;velocity+=vec3f(load3(b+10u),load3(b+11u),load3(b+12u))*amount;}
 let temperature=paramF32(32u)+heat;let gate=smoothstep(paramF32(34u),paramF32(35u),temperature);let consumed=fuel*oneMinusExp(paramF32(33u)*gate*dt);fuel=(fuel-consumed)*exp(-paramF32(40u)*dt);heat=(heat+consumed*paramF32(36u))*exp(-paramF32(38u)*dt);soot=(soot+consumed*paramF32(37u))*exp(-paramF32(39u)*dt);let burn=select(0.,consumed/max(dt,1e-30),dt>0.);
 let h=vec3f(paramF32(5u),paramF32(6u),paramF32(7u));var gradient=vec3f(0.);for(var axis=0u;axis<3u;axis++){var e=vec3i(0);e[axis]=1;gradient[axis]=(length(omega(q+e))-length(omega(q-e)))/(2.*h[axis]);}let n=gradient/max(length(gradient),1e-20);let force=cross(n,omega(q))*paramF32(43u)+vec3f(paramF32(44u),paramF32(45u),paramF32(46u))+vec3f(0.,paramF32(41u)*heat-paramF32(42u)*soot,0.);velocity+=force*dt;
 let domain=vec3f(fieldDomain0());let edge=min(vec3f(g)+.5,domain-vec3f(g)-.5);let shell=1.-smoothstep(.5,2.5,min(edge.x,min(edge.y,edge.z)));let fade=exp(-paramF32(49u)*shell*dt);for(var c=0u;c<3u;c++){storeField5(q,c,velocity[c]*fade);}storeField4(q,0u,soot*fade);storeField4(q,1u,heat*fade);storeField4(q,2u,fuel*fade);storeField4(q,3u,burn*fade);storeField6(q,0u,0.);
}`;
