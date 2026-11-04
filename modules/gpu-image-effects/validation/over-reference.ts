/** Acceptance-only exact binary arithmetic, independent of the GPU Pair
 * implementation and of the effect's F64 range preflight. Never runtime code. */
type Dyadic={n:bigint;e:number};
const view=new DataView(new ArrayBuffer(8));
function dyadic(v:number):Dyadic{
 if(!Number.isFinite(v))throw Error('Finite binary input required');view.setFloat64(0,v);const bits=view.getBigUint64(0),exp=Number(bits>>52n&2047n),fraction=bits&((1n<<52n)-1n),sign=bits>>63n?-1n:1n;
 return {n:sign*(exp?fraction+(1n<<52n):fraction),e:exp?exp-1023-52:-1074};
}
function plus(a:Dyadic,b:Dyadic):Dyadic{const e=Math.min(a.e,b.e);return {n:(a.n<<BigInt(a.e-e))+(b.n<<BigInt(b.e-e)),e};}
function times(a:Dyadic,b:Dyadic):Dyadic{return {n:a.n*b.n,e:a.e+b.e};}
function minus(a:Dyadic,b:Dyadic):Dyadic{return plus(a,{n:-b.n,e:b.e});}
/** Direct correctly rounded binary32, including ties-to-even/subnormal. */
function f32(a:Dyadic){
 if(a.n===0n)return 0;const sign=a.n<0n?-1:1,n=a.n<0n?-a.n:a.n,bits=n.toString(2).length,e=Math.max(a.e+bits-24,-149),shift=e-a.e;
 let q:bigint;if(shift<=0)q=n<<BigInt(-shift);else{const s=BigInt(shift),mask=(1n<<s)-1n,rest=n&mask,half=1n<<(s-1n);q=n>>s;if(rest>half||rest===half&&(q&1n)===1n)q++;}
 return Math.fround(sign*Number(q)*2**e);
}
export function exactOverPixel(front:ArrayLike<number>,back:ArrayLike<number>,opacity:number):readonly [number,number,number,number]{
 const o=dyadic(opacity),a=times(dyadic(front[3]),o),oneMinusA=minus(dyadic(1),a),alpha=f32(plus(a,times(dyadic(back[3]),oneMinusA)));
 return [0,1,2].map(c=>f32(plus(times(dyadic(front[c]),o),times(dyadic(back[c]),oneMinusA)))).concat(alpha) as [number,number,number,number];
}
/** Coverage-aware Screen, including the existing zero-Alpha emission rule.
 * Positive coverages simplify exactly to S+B-S*B; no approximate division. */
export function exactScreenPixel(front:ArrayLike<number>,back:ArrayLike<number>,opacity:number):readonly [number,number,number,number]{
 const o=dyadic(opacity),sa=times(dyadic(front[3]),o),ba=dyadic(back[3]),one=dyadic(1),alpha=f32(plus(sa,times(ba,minus(one,sa))));
 return [0,1,2].map(c=>{const s=times(dyadic(front[c]),o),b=dyadic(back[c]);return f32(sa.n!==0n&&ba.n!==0n?minus(plus(s,b),times(s,b)):plus(times(s,minus(one,ba)),times(b,minus(one,sa))));}).concat(alpha) as [number,number,number,number];
}
/** Coverage-aware image Multiply, not raw RGB coefficient modulation. */
export function exactMultiplyPixel(front:ArrayLike<number>,back:ArrayLike<number>,opacity:number):readonly [number,number,number,number]{
 const o=dyadic(opacity),sa=times(dyadic(front[3]),o),ba=dyadic(back[3]),one=dyadic(1),alpha=f32(plus(sa,times(ba,minus(one,sa))));
 return [0,1,2].map(c=>{const s=times(dyadic(front[c]),o),b=dyadic(back[c]),outside=plus(times(s,minus(one,ba)),times(b,minus(one,sa)));return f32(sa.n!==0n&&ba.n!==0n?plus(outside,times(s,b)):outside);}).concat(alpha) as [number,number,number,number];
}
/** Acceptance reference for a proposed, NOT implemented RGB difference-add. */
export function exactDifferenceAddPixel(left:ArrayLike<number>,right:ArrayLike<number>,amount:number):readonly [number,number,number,number]{
 return [0,1,2].map(c=>f32(plus(dyadic(left[c]),times(dyadic(amount),minus(dyadic(left[c]),dyadic(right[c])))))).concat(left[3]) as [number,number,number,number];
}
/** Acceptance-only offset in the input's declared association, keeping Alpha. */
export function exactOffsetPixel(source:ArrayLike<number>,offset:ArrayLike<number>,premultiplied:boolean):readonly [number,number,number,number]{
 const a=dyadic(premultiplied?source[3]:1);return [0,1,2].map(c=>f32(plus(dyadic(source[c]),times(dyadic(offset[c]),a)))).concat(source[3]) as [number,number,number,number];
}

/** Directed coverage difference with exact dyadic arithmetic. Acceptance only. */
export function exactMatteDifference(a:number,b:number):number{return f32(times(dyadic(a),minus(dyadic(1),dyadic(b))));}

/** Two-input PM RGBA interpolation, exact complement/product/sum before F32. */
export function exactCrossfadePixel(first:ArrayLike<number>,second:ArrayLike<number>,mix:number):readonly [number,number,number,number]{const m=dyadic(mix),complement=minus(dyadic(1),m);return [0,1,2,3].map(c=>f32(plus(times(dyadic(first[c]),complement),times(dyadic(second[c]),m)))) as [number,number,number,number];}
