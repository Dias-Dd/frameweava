import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import {compute} from '../roto-authoring/contour-compute.ts';
const R={type:'f32',access:'read'} as const,W={type:'f32',access:'read_write'} as const;
export const seedMask=compute('sam2-video-seed-resize',[R,W],`
fn a(q:vec2i)->Pair{let s=clamp(q,vec2i(0),vec2i(i32(paramU32(0u))-1,i32(paramU32(1u))-1));return scalar(load0((u32(s.y)*paramU32(0u)+u32(s.x))*4u+3u));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let xy=vec2f(p.xy)+.5;let x=subtract(times(multiply(uintPair(paramU32(0u)),scalar(xy.x)),1./1024.),scalar(.5));let y=subtract(times(multiply(uintPair(paramU32(1u)),scalar(xy.y)),1./1024.),scalar(.5));let ix=floorP(x);let iy=floorP(y);let q=vec2i(i32(rounded(ix).x),i32(rounded(iy).x));let fx=subtract(x,ix);let fy=subtract(y,iy);store1(p.y*1024u+p.x,rounded(clampP(mixP(mixP(a(q),a(q+vec2i(1,0)),fx),mixP(a(q+vec2i(0,1)),a(q+vec2i(1)),fx),fy))).x);}
`);
export const prepareMemory:GpuComputeKernelSource={abiVersion:1,id:'frameweave/video-roto/memory-positions-v1',version:'1.0.0',parameterWords:64,bindings:[R,W,W,W],workgroupSize:[8,8,1],code:`
fn spatial(x:u32,y:u32,k:u32)->f32{let index=k%32u;let dim=pow(10000.,2.*floor(f32(index)/2.)/32.);var v=(f32(x)+1.)/(64.+1e-6)*6.283185307179586;if(k<32u){v=(f32(y)+1.)/(64.+1e-6)*6.283185307179586;}if(index%2u==0u){return sin(v/dim);}return cos(v/dim);}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let slot=p.y/64u;let y=p.y%64u;let token=p.y*64u+p.x;let age=paramU32(slot);for(var k=0u;k<64u;k++){var value=0.;if(age>0u){value=spatial(p.x,y,k)+load0((age-1u)*64u+k);}store1(token*64u+k,value);}store3(token,select(0.,1.,age>0u));
 if(token<64u){let pointer=token/4u;let valid=paramU32(7u+pointer)>0u;let t=paramF32(24u+pointer);for(var k=0u;k<64u;k++){var sum=load0(448u+16384u+k);for(var j=0u;j<256u;j++){let index=j%128u;let phase=t/pow(10000.,2.*floor(f32(index)/2.)/128.);var v=cos(phase);if(j<128u){v=sin(phase);}sum+=load0(448u+k*256u+j)*v;}store2(token*64u+k,select(0.,sum,valid));}store3(28672u+token,select(0.,1.,valid));}}
`};
export const buildMask=compute('sam2-video-logits-to-mask',[R,W],`
fn at(q:vec2i)->Pair{let s=clamp(q,vec2i(0),vec2i(255));return scalar(load0(u32(s.y)*256u+u32(s.x)));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let x=subtract(divide(times(add(uintPair(p.x),scalar(.5)),256.),uintPair(paramU32(0u))),scalar(.5));let y=subtract(divide(times(add(uintPair(p.y),scalar(.5)),256.),uintPair(paramU32(1u))),scalar(.5));let ix=floorP(x);let iy=floorP(y);let q=vec2i(i32(rounded(ix).x),i32(rounded(iy).x));let fx=subtract(x,ix);let fy=subtract(y,iy);let v=subtract(mixP(mixP(at(q),at(q+vec2i(1,0)),fx),mixP(at(q+vec2i(0,1)),at(q+vec2i(1)),fx),fy),argP(0u));var coverage=scalar(select(0.,1.,greater(v,scalar(0.))));if(greater(argP(1u),scalar(0.))){let a=clamp(rounded(divide(v,argP(1u))).x,-80.,80.);coverage=scalar(1./(1.+exp(-a)));}let i=(p.y*paramU32(0u)+p.x)*2u;store1(i,rounded(coverage).x);store1(i+1u,1.);}
`);
