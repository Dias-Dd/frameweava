import type {GpuComputeKernelSource,GpuComputeBinding} from '../../gpu-effects/compute-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
const read={type:'f32',access:'read'} as const,write={type:'f32',access:'read_write'} as const;
const header=math+`
fn at(p:vec2i)->u32{let q=clamp(p,vec2i(0),vec2i(i32(paramU32(0u)),i32(paramU32(1u)))-1);return u32(q.y)*paramU32(0u)+u32(q.x);}
fn image(p:vec2i)->Pair{let i=at(p)*4u;return associate(vec4f(load0(i),load0(i+1u),load0(i+2u),load0(i+3u)),paramU32(2u));}
fn color(p:vec2i)->Pair{let i=at(p)*4u;if(load0(i+3u)==0.){return scalar(0.);}if(paramU32(2u)==1u){return pair(vec4f(load0(i),load0(i+1u),load0(i+2u),load0(i+3u)));}return straight(image(p));}
fn bounded(v:Pair)->Pair{let y=luminanceP(v);return divide(y,add(scalar(1.),absPair(y)));}
`;
const kernel=(id:string,bindings:readonly GpuComputeBinding[],code:string,groups:readonly [number,number,number]=[8,8,1],base=header):GpuComputeKernelSource=>({abiVersion:1,id:'frameweave/restoration/'+id,version:'1.0.0',bindings,parameterWords:128,workgroupSize:groups,code:guarded(base+code)});
export const guidePack=kernel('guide-pack',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let point=p.xy;let i=(p.y*paramU32(0u)+p.x)*12u;let v=image(vec2i(point));let w=ch(v,3u);var c=scalar(0.);var g=scalar(0.);if(greater(w,scalar(0.))){c=color(vec2i(point));g=bounded(c);}for(var j=0u;j<3u;j++){store1(i+j,rounded(multiply(ch(c,j),w)).x);store1(i+6u+j,rounded(multiply(multiply(ch(c,j),g),w)).x);}store1(i+3u,rounded(w).x);store1(i+4u,rounded(multiply(g,w)).x);store1(i+5u,rounded(multiply(multiply(g,g),w)).x);for(var j=9u;j<12u;j++){store1(i+j,0.);}}
`);
export const guideCoefficients=kernel('guide-coefficients',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let i=p.y*paramU32(0u)+p.x;let weight=scalar(load0(i*12u+3u));for(var j=0u;j<8u;j++){store1(i*8u+j,0.);}if(!greater(weight,scalar(0.))){return;}let g=divide(scalar(load0(i*12u+4u)),weight);let variance=maxP(subtract(divide(scalar(load0(i*12u+5u)),weight),multiply(g,g)),scalar(0.));for(var j=0u;j<3u;j++){let mean=divide(scalar(load0(i*12u+j)),weight);let covariance=subtract(divide(scalar(load0(i*12u+6u+j)),weight),multiply(g,mean));let a=divide(covariance,add(variance,argP(0u)));let b=subtract(mean,multiply(a,g));store1(i*8u+j,rounded(a).x);store1(i*8u+3u+j,rounded(b).x);}store1(i*8u+6u,1.);}
`,[8,8,1],math);
export const tensorPack=kernel('tensor-pack',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let q=vec2i(p.xy);let dx=times(subtract(bounded(color(q+vec2i(1,0))),bounded(color(q-vec2i(1,0)))),.5);let dy=times(subtract(bounded(color(q+vec2i(0,1))),bounded(color(q-vec2i(0,1)))),.5);let i=(p.y*paramU32(0u)+p.x)*3u;store1(i,rounded(multiply(dx,dx)).x);store1(i+1u,rounded(multiply(dx,dy)).x);store1(i+2u,rounded(multiply(dy,dy)).x);}
`);
export const tvUpdate=kernel('tv-update',[read,read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let i=p.y*paramU32(0u)+p.x;let q=vec2i(p.xy);let centre=color(q);var vector:array<Pair,6>;var norm=scalar(0.);for(var c=0u;c<3u;c++){for(var axis=0u;axis<2u;axis++){var offset=vec2i(1,0);if(axis==1u){offset=vec2i(0,1);}var v=scalar(0.);if(p[axis]+1u<select(paramU32(0u),paramU32(1u),axis==1u)&&greater(ch(image(q),3u),scalar(0.))&&greater(ch(image(q+offset),3u),scalar(0.))){let delta=subtract(ch(color(q+offset),c),ch(centre,c));v=subtract(scalar(load1(i*6u+c*2u+axis)),multiply(divide(argP(1u),argP(0u)),delta));}vector[c*2u+axis]=v;norm=add(norm,multiply(v,v));}}let divisor=maxP(scalar(1.),sqrtPair(norm));for(var j=0u;j<6u;j++){store2(i*6u+j,rounded(divide(vector[j],divisor)).x);}}
`);
/** Compensated horizontal RGBA prefix (w+1 samples). Source/target are existing
 * readonly image-data alias and typed storage; no CPU image transfer. */
export const rowPrefix=kernel('row-prefix',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let row=p.x;let width=paramU32(0u);var total=scalar(0.);for(var x=0u;x<=width;x++){let at=(row*(width+1u)+x)*8u;for(var c=0u;c<4u;c++){store1(at+c,total.hi[c]);store1(at+4u+c,total.lo[c]);}if(x<width){total=add(total,image(vec2i(i32(x),i32(row))));}}}
`,[64,1,1]);
export const coc=kernel('physical-coc',[read,write],`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let i=(p.y*paramU32(0u)+p.x)*2u;let z=load0(i/2u);if((bitcast<u32>(z)&0x7f800000u)==0x7f800000u||greater(argP(4u),scalar(z))||greater(scalar(z),argP(5u))){store1(i,0.);store1(i+1u,0.);return;}var focus=argP(2u);if(paramU32(2u)!=0u){let u=subtract(divide(add(uintPair(p.x),scalar(.5)),uintPair(paramU32(0u))),scalar(.5));let v=subtract(divide(add(uintPair(p.y),scalar(.5)),uintPair(paramU32(1u))),scalar(.5));let coordinate=add(multiply(u,argP(8u)),multiply(v,argP(9u)));var t=scalar(0.);if(arg(7u)>0.){t=clampP(add(divide(subtract(coordinate,argP(6u)),argP(7u)),scalar(.5)));}else if(!greater(argP(6u),coordinate)){t=scalar(1.);}focus=divide(scalar(1.),mixP(divide(scalar(1.),argP(2u)),divide(scalar(1.),argP(3u)),t));}let scale=divide(argP(0u),subtract(times(focus,1000.),argP(1u)));let radius=multiply(scale,subtract(scalar(1.),divide(focus,scalar(z))));store1(i,rounded(radius).x);store1(i+1u,1.);}
`,[8,8,1],math);
