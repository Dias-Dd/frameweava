import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';import {math} from '../keying/kernels.ts';import {guarded} from '../geometry/arithmetic.ts';
export const R={type:'f32',access:'read'} as const,W={type:'f32',access:'read_write'} as const,U={type:'u32',access:'read'} as const,V={type:'u32',access:'read_write'} as const;
export function compute(id:string,bindings:GpuComputeKernelSource['bindings'],code:string,workgroupSize:readonly[number,number,number]=[8,8,1]):GpuComputeKernelSource{return {abiVersion:1,id:'frameweave/stabilization/'+id,version:'1.0.0',bindings,parameterWords:128,workgroupSize,code:guarded(math+code)};}
export const matrixMath=`
fn normX(x:Pair)->Pair{return subtract(divide(times(x,2.),uintPair(paramU32(0u))),scalar(1.));}
fn normY(y:Pair)->Pair{return subtract(divide(times(y,2.),uintPair(paramU32(1u))),scalar(1.));}
fn physicalX(x:Pair)->Pair{return times(multiply(add(x,scalar(1.)),uintPair(paramU32(0u))),.5);}
fn physicalY(y:Pair)->Pair{return times(multiply(add(y,scalar(1.)),uintPair(paramU32(1u))),.5);}
fn mapped(m:array<Pair,9>,x:Pair,y:Pair)->Pair{let z=add(add(multiply(m[6],x),multiply(m[7],y)),m[8]);if(!greater(absPair(z),scalar(0x1p-40))){return rgb(x,y,scalar(0.),scalar(0.));}return rgb(divide(add(add(multiply(m[0],x),multiply(m[1],y)),m[2]),z),divide(add(add(multiply(m[3],x),multiply(m[4],y)),m[5]),z),scalar(0.),scalar(1.));}
fn inverted(m:array<Pair,9>,x:Pair,y:Pair)->Pair{let a=subtract(m[0],multiply(x,m[6]));let b=subtract(m[1],multiply(x,m[7]));let c=subtract(multiply(x,m[8]),m[2]);let d=subtract(m[3],multiply(y,m[6]));let e=subtract(m[4],multiply(y,m[7]));let f=subtract(multiply(y,m[8]),m[5]);let det=subtract(multiply(a,e),multiply(b,d));if(!greater(absPair(det),scalar(0x1p-40))){return rgb(x,y,scalar(0.),scalar(0.));}return rgb(divide(subtract(multiply(c,e),multiply(b,f)),det),divide(subtract(multiply(a,f),multiply(c,d)),det),det,scalar(1.));}
fn nodePosition(p:vec2u)->Pair{let x=add(scalar(.5),multiply(divide(uintPair(p.x),uintPair(paramU32(2u))),subtract(uintPair(paramU32(0u)),scalar(1.))));let y=add(scalar(.5),multiply(divide(uintPair(p.y),uintPair(paramU32(3u))),subtract(uintPair(paramU32(1u)),scalar(1.))));return rgb(normX(x),normY(y),scalar(0.),scalar(1.));}
`;
