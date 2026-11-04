import type {GpuComputeKernelSource,GpuComputeBinding} from '../../gpu-effects/compute-types.ts';
import {guarded} from '../geometry/arithmetic.ts';
import {math} from './kernels.ts';
function kernel(id:string,bindings:readonly GpuComputeBinding[],code:string,workgroupSize:readonly [number,number,number]=[8,8,1]):GpuComputeKernelSource{return {abiVersion:1,id:'frameweave/keying/'+id,version:'1.0.0',bindings,parameterWords:128,workgroupSize,code:guarded(math+code)};}
const read={type:'f32',access:'read'} as const,write={type:'f32',access:'read_write'} as const;
export const excessReduce=kernel('excess-reduce',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){var sum=scalar(0.);let first=paramU32(1u)!=0u;let begin=p.x*128u;let count=paramU32(0u);for(var i=begin;i<min(begin+128u,count);i++){var v=scalar(0.);if(first){let at=i*4u;let source=associate(vec4f(load0(at),load0(at+1u),load0(at+2u),load0(at+3u)),paramU32(2u));if(greater(ch(source,3u),scalar(0.))){let r=maxP(subtract(ch(source,0u),maxP(ch(source,1u),ch(source,2u))),scalar(0.));let g=maxP(subtract(ch(source,1u),maxP(ch(source,0u),ch(source,2u))),scalar(0.));let b=maxP(subtract(ch(source,2u),maxP(ch(source,0u),ch(source,1u))),scalar(0.));v=divide(rgb(r,g,b,scalar(0.)),argP(0u));}}else{let at=i*8u;v=Pair(vec4f(load0(at),load0(at+1u),load0(at+2u),load0(at+3u)),vec4f(load0(at+4u),load0(at+5u),load0(at+6u),load0(at+7u)));}sum=add(sum,v);}for(var c=0u;c<4u;c++){store1(p.x*8u+c,sum.hi[c]);store1(p.x*8u+4u+c,sum.lo[c]);}}
`,[64,1,1]);

// Packed moments are non-colour F32 data. They are never disguised as RGBA
// surfaces with g² in the Alpha channel.
export const guidePack=kernel('guide-pack',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let at=(p.y*paramU32(0u)+p.x)*4u;let v=associate(vec4f(load0(at),load0(at+1u),load0(at+2u),load0(at+3u)),paramU32(2u));let y=luminanceP(straight(v));let guide=rounded(divide(y,add(scalar(1.),absPair(y)))).x;let a=rounded(ch(v,3u)).x;store1(at,guide);store1(at+1u,a);store1(at+2u,rounded(multiply(scalar(guide),scalar(a))).x);store1(at+3u,rounded(multiply(scalar(guide),scalar(guide))).x);}
`);
export const boxMean=kernel('box-mean',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let width=paramU32(0u);let height=paramU32(1u);let components=paramU32(2u);let radius=i32(paramU32(3u));let axis=paramU32(4u);let pos=select(i32(p.x),i32(p.y),axis==1u);let size=select(i32(width),i32(height),axis==1u);let first=max(0,pos-radius);let last=min(size-1,pos+radius);for(var c=0u;c<components;c++){var total=scalar(0.);for(var k=first;k<=last;k++){var q=p.xy;var count=1u;if(k==0){count+=u32(max(0,radius-pos));}if(k==size-1){count+=u32(max(0,pos+radius-(size-1)));}if(axis==0u){q.x=u32(k);}else{q.y=u32(k);}let value=scalar(load0((q.y*width+q.x)*components+c));total=add(total,multiply(value,uintPair(count)));}store1((p.y*width+p.x)*components+c,rounded(divide(total,argP(0u))).x);}}
`);
export const guideCoefficients=kernel('guide-coefficients',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let pixel=p.y*paramU32(0u)+p.x;let i=pixel*4u;let mean=scalar(load0(i));let alpha=scalar(load0(i+1u));let product=scalar(load0(i+2u));let square=scalar(load0(i+3u));let variance=maxP(subtract(square,multiply(mean,mean)),scalar(0.));let covariance=subtract(product,multiply(mean,alpha));let a=divide(covariance,add(variance,argP(0u)));let b=subtract(alpha,multiply(a,mean));store1(pixel*2u,rounded(a).x);store1(pixel*2u+1u,rounded(b).x);}
`);

// Exact separable squared Euclidean distance transform. Horizontal zero/INF
// seeds use two nearest-site sweeps; vertical arbitrary costs use the lower
// envelope of parabolas (F64-style compensated boundary calculations).
export const distanceRows=kernel('distance-rows',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let width=paramU32(0u);let row=p.x;var inside=-1;var outside=-1;for(var x=0u;x<width;x++){let i=row*width+x;let a=scalar(load0(i*4u+3u));let yes=greater(a,scalar(0.))&&!greater(argP(0u),a);if(yes){inside=i32(x);}else{outside=i32(x);}var f=1e30;var b=1e30;if(inside>=0){let d=f32(i32(x)-inside);f=d*d;}if(outside>=0){let d=f32(i32(x)-outside);b=d*d;}store1(i*2u,f);store1(i*2u+1u,b);}
 inside=-1;outside=-1;for(var k=width;k>0u;k--){let x=k-1u;let i=row*width+x;let a=scalar(load0(i*4u+3u));let yes=greater(a,scalar(0.))&&!greater(argP(0u),a);if(yes){inside=i32(x);}else{outside=i32(x);}if(inside>=0){let d=f32(inside-i32(x));store1(i*2u,min(load1(i*2u),d*d));}if(outside>=0){let d=f32(outside-i32(x));store1(i*2u+1u,min(load1(i*2u+1u),d*d));}}}
`,[64,1,1]);
export const distanceColumns=kernel('distance-columns',[read,{type:'u32',access:'read_write'},write,write],`
fn edge(k:u32,lane:u32)->Pair{let i=(k*paramU32(0u)*2u+lane)*2u;return constant(load2(i),load2(i+1u));}
fn writeEdge(k:u32,lane:u32,value:Pair){let i=(k*paramU32(0u)*2u+lane)*2u;store2(i,value.hi.x);store2(i+1u,value.lo.x);}
fn cost(q:u32,lane:u32)->Pair{return scalar(load0((q*paramU32(0u)+lane/2u)*2u+lane%2u));}
fn intersection(q:u32,v:u32,lane:u32)->Pair{let a=add(cost(q,lane),multiply(uintPair(q),uintPair(q)));let b=add(cost(v,lane),multiply(uintPair(v),uintPair(v)));return divide(subtract(a,b),times(subtract(uintPair(q),uintPair(v)),2.));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let lane=p.x;let width=paramU32(0u);let height=paramU32(1u);let lanes=width*2u;var count=0u;
 for(var q=0u;q<height;q++){if(rounded(cost(q,lane)).x>=1e29){continue;}var s=scalar(-1e30);if(count>0u){s=intersection(q,load1((count-1u)*lanes+lane),lane);while(count>0u&&!greater(s,edge(count-1u,lane))){count--;if(count>0u){s=intersection(q,load1((count-1u)*lanes+lane),lane);}}}if(count==0u){s=scalar(-1e30);}store1(count*lanes+lane,q);writeEdge(count,lane,s);count++;writeEdge(count,lane,scalar(1e30));}
 var k=0u;for(var q=0u;q<height;q++){var result=scalar(1e30);if(count>0u){while(k+1u<count&&greater(uintPair(q),edge(k+1u,lane))){k++;}let v=load1(k*lanes+lane);let d=subtract(uintPair(q),uintPair(v));result=add(multiply(d,d),cost(v,lane));}store3((q*width+lane/2u)*2u+lane%2u,rounded(result).x);}}
`,[64,1,1]);
export const distancePack=kernel('distance-pack',[read,read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let width=paramU32(0u);let height=paramU32(1u);let i=p.y*width+p.x;let alpha=scalar(load0(i*4u+3u));let inside=greater(alpha,scalar(0.))&&!greater(argP(0u),alpha);var squared=load1(i*2u+select(0u,1u,inside));if(inside){let dx=min(p.x+1u,width-p.x);let dy=min(p.y+1u,height-p.y);let border=f32(min(dx,dy));squared=min(squared,border*border);}let valid=squared<1e29;var distance=0.;if(valid){distance=max(0.,sqrt(squared)-.5)*select(-1.,1.,inside);}store2(i*2u,distance);store2(i*2u+1u,select(0.,1.,valid));}
`);
