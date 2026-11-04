import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
const read={type:'f32',access:'read'} as const,write={type:'f32',access:'read_write'} as const;
export type FitKind='translation'|'similarity'|'affine'|'homography'|'rolling';
export const fitDimensions={translation:2,similarity:4,affine:6,homography:8,rolling:12} as const;
/** GPU weighted IRLS, normalized physical centres, rank check before prior. */
export function fitKernels(kind:FitKind){
 const n=fitDimensions[kind],stride=n*n+n+2,entry=(i:number)=>`constant(load1(${i*2}u),load1(${i*2+1}u))`;
 const basis=kind==='translation'?`a[0]=scalar(1.);b[1]=scalar(1.);u=subtract(u,x);v=subtract(v,y);`:
 kind==='similarity'?`a[0]=x;a[1]=negate(y);a[2]=scalar(1.);b[0]=y;b[1]=x;b[3]=scalar(1.);`:
 kind==='rolling'?`var t=y;var s=x;if(paramU32(3u)>=2u){t=x;s=y;}if((paramU32(3u)&1u)!=0u){t=negate(t);}let t2=multiply(t,t);a[0]=scalar(1.);a[1]=s;a[2]=t;a[3]=multiply(s,t);a[4]=t2;a[5]=multiply(s,t2);for(var j=0u;j<6u;j++){b[j+6u]=a[j];}u=subtract(u,x);v=subtract(v,y);`:
 `a[0]=x;a[1]=y;a[2]=scalar(1.);b[3]=x;b[4]=y;b[5]=scalar(1.);${kind==='homography'?'a[6]=negate(multiply(u,x));a[7]=negate(multiply(u,y));b[6]=negate(multiply(v,x));b[7]=negate(multiply(v,y));':''}`;
 const old=kind==='rolling'?`var ou=scalar(0.);var ov=scalar(0.);for(var j=0u;j<6u;j++){ou=add(ou,multiply(a[j],constant(load1(j*2u),load1(j*2u+1u))));ov=add(ov,multiply(a[j],constant(load1((j+6u)*2u),load1((j+6u)*2u+1u))));}ou=add(x,ou);ov=add(y,ov);`:
 `let z=add(add(multiply(${entry(6)},x),multiply(${entry(7)},y)),${entry(8)});var ou=x;var ov=y;if(greater(absPair(z),scalar(0x1p-20))){ou=divide(add(add(multiply(${entry(0)},x),multiply(${entry(1)},y)),${entry(2)}),z);ov=divide(add(add(multiply(${entry(3)},x),multiply(${entry(4)},y)),${entry(5)}),z);}`;
 const init=kind==='translation'||kind==='rolling'?Array(n).fill(0):kind==='similarity'?[1,0,0,0]:[1,0,0,0,1,0,...kind==='homography'?[0,0]:[]];
 const output=kind==='rolling'?Array.from({length:12},(_,j)=>`put(${j}u,solution[${j}u]);`).join(''):
 kind==='translation'?`put(0u,scalar(1.));put(1u,scalar(0.));put(2u,solution[0]);put(3u,scalar(0.));put(4u,scalar(1.));put(5u,solution[1]);put(6u,scalar(0.));put(7u,scalar(0.));put(8u,scalar(1.));`:
 kind==='similarity'?`put(0u,solution[0]);put(1u,negate(solution[1]));put(2u,solution[2]);put(3u,solution[1]);put(4u,solution[0]);put(5u,solution[3]);put(6u,scalar(0.));put(7u,scalar(0.));put(8u,scalar(1.));`:
 Array.from({length:9},(_,j)=>`put(${j}u,${j<n?`solution[${j}u]`:j===8?'scalar(1.)':'scalar(0.)'});`).join('');
 const make=(id:string,bindings:GpuComputeKernelSource['bindings'],code:string):GpuComputeKernelSource=>({abiVersion:1,id:'frameweave/image-estimation/'+kind+'-'+id,version:'1.0.0',bindings,parameterWords:128,workgroupSize:[1,1,1],code:guarded(math+code)});
 const rows=make('fit-rows',[read,read,write],`
 fn compute(p:vec3u,_l:vec3u,_g:vec3u){let w=paramU32(0u);let h=paramU32(1u);let y=subtract(divide(times(add(uintPair(p.x),scalar(.5)),2.),uintPair(h)),scalar(1.));var sums:array<Pair,${stride}>;for(var j=0u;j<${stride}u;j++){sums[j]=scalar(0.);}
 if(p.x%paramU32(4u)==0u){for(var ix=0u;ix<w;ix+=paramU32(4u)){let i=(p.x*w+ix)*3u;let confidence=scalar(load0(i+2u));if(!greater(confidence,argP(0u))||greater(confidence,scalar(1.))||!(abs(load0(i))<=3e38&&abs(load0(i+1u))<=3e38)){continue;}let x=subtract(divide(times(add(uintPair(ix),scalar(.5)),2.),uintPair(w)),scalar(1.));let tx=add(x,divide(times(scalar(load0(i)),2.),uintPair(w)));let ty=add(y,divide(times(scalar(load0(i+1u)),2.),uintPair(h)));var u=tx;var v=ty;var a:array<Pair,${n}>;var b:array<Pair,${n}>;for(var j=0u;j<${n}u;j++){a[j]=scalar(0.);b[j]=scalar(0.);}${basis}
 var weight=confidence;var error=scalar(0.);if(paramU32(2u)!=0u){${old}let ex=times(multiply(subtract(ou,tx),uintPair(w)),.5);let ey=times(multiply(subtract(ov,ty),uintPair(h)),.5);error=add(multiply(ex,ex),multiply(ey,ey));weight=divide(weight,add(scalar(1.),divide(error,multiply(argP(1u),argP(1u)))));}
 for(var j=0u;j<${n}u;j++){for(var k=0u;k<${n}u;k++){let at=j*${n}u+k;sums[at]=add(sums[at],multiply(weight,add(multiply(a[j],a[k]),multiply(b[j],b[k]))));}sums[${n*n}u+j]=add(sums[${n*n}u+j],multiply(weight,add(multiply(a[j],u),multiply(b[j],v))));}sums[${stride-2}u]=add(sums[${stride-2}u],weight);sums[${stride-1}u]=add(sums[${stride-1}u],multiply(weight,error));}}
 for(var j=0u;j<${stride}u;j++){let at=(p.x*${stride}u+j)*2u;store2(at,sums[j].hi.x);store2(at+1u,sums[j].lo.x);}}
 `);
 const finish=make('fit-solve',[read,write,write],`
 fn put(i:u32,v:Pair){store1(i*2u,v.hi.x);store1(i*2u+1u,v.lo.x);}
 fn compute(_p:vec3u,_l:vec3u,_g:vec3u){var sums:array<Pair,${stride}>;for(var j=0u;j<${stride}u;j++){sums[j]=scalar(0.);for(var y=0u;y<paramU32(1u);y++){let at=(y*${stride}u+j)*2u;sums[j]=add(sums[j],constant(load0(at),load0(at+1u)));}}
 var a:array<array<Pair,${n+1}>,${n}>;var solution:array<Pair,${n}>;${init.map((v,j)=>`solution[${j}]=scalar(${v}.);`).join('')}
 let weight=sums[${stride-2}u];var valid=greater(weight,scalar(${n}.));var minPivot=scalar(1.);
 for(var j=0u;j<${n}u;j++){for(var k=0u;k<${n}u;k++){a[j][k]=scalar(0.);if(greater(weight,scalar(0.))){a[j][k]=divide(sums[j*${n}u+k],weight);}}a[j][${n}u]=scalar(0.);if(greater(weight,scalar(0.))){a[j][${n}u]=divide(sums[${n*n}u+j],weight);}}
 var rank=a;for(var j=0u;j<${n}u;j++){var pivot=j;for(var k=j+1u;k<${n}u;k++){if(greater(absPair(rank[k][j]),absPair(rank[pivot][j]))){pivot=k;}}let v=absPair(rank[pivot][j]);minPivot=minP(minPivot,v);if(!greater(v,scalar(0x1p-36))){valid=false;break;}let swap=rank[j];rank[j]=rank[pivot];rank[pivot]=swap;for(var k=j+1u;k<${n}u;k++){let m=divide(rank[k][j],rank[j][j]);for(var t=j;t<${n}u;t++){rank[k][t]=subtract(rank[k][t],multiply(m,rank[j][t]));}}}
 if(valid){for(var j=0u;j<${n}u;j++){a[j][j]=add(a[j][j],argP(2u));a[j][${n}u]=add(a[j][${n}u],multiply(argP(2u),solution[j]));}
 for(var j=0u;j<${n}u;j++){var pivot=j;for(var k=j+1u;k<${n}u;k++){if(greater(absPair(a[k][j]),absPair(a[pivot][j]))){pivot=k;}}let swap=a[j];a[j]=a[pivot];a[pivot]=swap;let denominator=a[j][j];for(var t=j;t<=${n}u;t++){a[j][t]=divide(a[j][t],denominator);}for(var k=0u;k<${n}u;k++){if(k==j){continue;}let m=a[k][j];for(var t=j;t<=${n}u;t++){a[k][t]=subtract(a[k][t],multiply(m,a[j][t]));}}}
 for(var j=0u;j<${n}u;j++){solution[j]=a[j][${n}u];}}
 ${output}
 store2(0u,select(0.,1.,valid));store2(1u,rounded(weight).x);store2(2u,rounded(minPivot).x);var rms=scalar(0.);if(greater(weight,scalar(0.))){rms=sqrtPair(maxP(divide(sums[${stride-1}u],weight),scalar(0.)));}store2(3u,rounded(rms).x);
 }`);
 return {rows,finish,stride};
}
