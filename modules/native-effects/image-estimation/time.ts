import type {Rational} from '../../../src/core/types.ts';
import {fail} from '../closure-filters/control.ts';
export function exactSeconds(v:Rational,path:string):Rational{if(!v||Object.keys(v).some(k=>!['num','den'].includes(k))||!Number.isSafeInteger(v.num)||!Number.isSafeInteger(v.den)||v.den<=0)fail('stabilizeSequence',path,'safe integer rational seconds');return v;}
export function compareSeconds(a:Rational,b:Rational){const d=BigInt(a.num)*BigInt(b.den)-BigInt(b.num)*BigInt(a.den);return d<0n?-1:d>0n?1:0;}
export function differenceSeconds(a:Rational,b:Rational){return Number(BigInt(a.num)*BigInt(b.den)-BigInt(b.num)*BigInt(a.den))/Number(BigInt(a.den)*BigInt(b.den));}
