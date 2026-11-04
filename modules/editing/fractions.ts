import type {Rational} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
const max=BigInt(Number.MAX_SAFE_INTEGER);
export function timeError(message:string):never{throw new EngineError('E_EDIT_TIME',message);}
export function reduced(n:bigint,d:bigint):Rational {
 if(d<=0n)timeError('Time denominator must be positive');
 const abs=(v:bigint)=>v<0n?-v:v,gcd=(a:bigint,b:bigint):bigint=>b===0n?a:gcd(b,a%b),g=gcd(abs(n),d);n/=g;d/=g;
 if(abs(n)>max||d>max)timeError('Time exceeds the existing safe-integer rational transport; use a representable source window');
 return {num:Number(n),den:Number(d)};
}
/** Encode an existing JS number, never a new timebase. Continued-fraction convergents
 * stop only when division reproduces that exact Number. No timestamp quantization. */
export function fraction(value:number|Rational):Rational {
 if(typeof value!=='number'){
  if(!value||Object.keys(value).some(k=>!['num','den'].includes(k))||!Number.isSafeInteger(value.num)||!Number.isSafeInteger(value.den)||value.den<1)timeError('Use a finite number or safe-integer {num,den}');
  return reduced(BigInt(value.num),BigInt(value.den));
 }
 if(!Number.isFinite(value))timeError('Source time and speed must be finite');
 if(Number.isSafeInteger(value))return {num:value,den:1};
 const sign=value<0?-1n:1n,[mantissa,exponent='0']=Math.abs(value).toString().split('e'),parts=mantissa.split('.'),digits=parts.join(''),power=Number(exponent)-(parts[1]?.length??0);
 let n=BigInt(digits)*10n**BigInt(Math.max(0,power)),d=10n**BigInt(Math.max(0,-power)),p0=0n,p1=1n,q0=1n,q1=0n;
 while(d){const a=n/d,p=a*p1+p0,q=a*q1+q0;if(p>max||q>max)timeError('Number cannot be carried by the existing rational time transport');if(Number(sign*p)/Number(q)===value)return reduced(sign*p,q);[p0,p1,q0,q1]=[p1,p,q1,q];[n,d]=[d,n%d];}
 timeError('Number cannot be represented without changing its value');
}
export function add(a:Rational,b:Rational){return reduced(BigInt(a.num)*BigInt(b.den)+BigInt(b.num)*BigInt(a.den),BigInt(a.den)*BigInt(b.den));}
export function multiply(a:Rational,b:Rational){return reduced(BigInt(a.num)*BigInt(b.num),BigInt(a.den)*BigInt(b.den));}
export function compact(v:Rational):number|Rational{return v.den===1?v.num:v;}
