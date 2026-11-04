// Range/ease/shape, seeded permutation and combination adapted from EffectCraft
// text/selectors.rs @861c51f8187bf56efc77cc7b60fc4a513d2b7198 (MIT).
// Copyright (c) 2026 ArtCraft Team and contributors. See vendor/effectcraft.
import {EngineError} from '../../../src/core/errors.ts';
import {evaluate,easingAt,validateEasing} from '../../../src/core/animation.ts';
import type {FrameContext,Signal,Easing} from '../../../src/core/types.ts';
import {hash64,unit} from './noise.ts';
export type RangeShape='square'|'ramp-up'|'ramp-down'|'triangle'|'round'|'smooth';
export interface RangeSelectorOptions {start?:Signal<number>;end?:Signal<number>;offset?:Signal<number>;amount?:Signal<number>;shape?:RangeShape;smoothness?:Signal<number>;easeHigh?:Signal<number>;easeLow?:Signal<number>;randomOrderSeed?:number}
const fail=(message:string):never=>{throw new EngineError('E_PA_SELECTOR',message);};
const clamp=(n:number,a=0,b=1)=>Math.min(b,Math.max(a,n));
function number(n:number,min:number,max:number){if(!Number.isFinite(n)||n<min||n>max)fail(`Expected finite [${min},${max}]`);return n;}
function scalar(s:Signal<number>,ctx:FrameContext,min:number,max:number){return number(evaluate(s,ctx),min,max);}
function count(n:number){if(!Number.isInteger(n)||n<0||n>4096)fail('Selector count must be integer0..4096');return n;}
/** Position each logical unit takes in a seeded permutation, matching the audited upstream math. */
export function selectorOrder(n:number,seed:number):number[]{count(n);return permutation(n,seed);}
function permutation(n:number,seed:number):number[]{if(!Number.isSafeInteger(seed))fail('Seed must be a safe integer');const p=Array.from({length:n},(_,i)=>i);let s=hash64(BigInt(seed)^0x5eedn);for(let i=n-1;i>0;i--){s=hash64(s);const j=Number(s%BigInt(i+1));[p[i],p[j]]=[p[j],p[i]];}return p;}
function shapeValue(shape:RangeShape,f:number){if(shape==='square')return f>=0&&f<=1?1:0;if(shape==='ramp-up')return clamp(f);if(shape==='ramp-down')return 1-clamp(f);if(f<0||f>1)return 0;const t=1-Math.abs(2*f-1);return shape==='triangle'?t:shape==='round'?Math.sqrt(Math.max(0,1-(2*f-1)**2)):t*t*(3-2*t);}
function eased(v:number,high:number,low:number){if(high===0&&low===0)return v;const t=clamp(v),p1=(1-low)/3,p2=1-(1-high)/3,u=1-t;return 3*u*u*t*p1+3*u*t*t*p2+t*t*t;}
/** Fractions of logical units, not pixels or glyph IDs; negative amount is an explicit inverted weight. */
type RangeParameters={start:number;end:number;amount:number;smooth:number;high:number;low:number;shape:RangeShape};
function rangeParameters(options:RangeSelectorOptions,context:FrameContext,extended=false,units:'fraction'|'percent'|'index'='fraction',n=1):RangeParameters{
 const read=(value:Signal<number>|undefined,fallback:number,min=-Infinity,max=Infinity)=>scalar(value??fallback,context,min,max),factor=units==='percent'?.01:units==='index'?1/Math.max(1,n):1,start=read(options.start,0,extended?-Infinity:-1e6,extended?Infinity:1e6)*factor,end=read(options.end,units==='percent'?100:units==='index'?n:1,extended?-Infinity:-1e6,extended?Infinity:1e6)*factor,offset=read(options.offset,0,extended?-Infinity:-1e6,extended?Infinity:1e6)*factor,shape=options.shape??'square';
 if(!['square','ramp-up','ramp-down','triangle','round','smooth'].includes(shape))fail('Unknown range shape');const lo=Math.min(start,end)+offset,hi=Math.max(start,end)+offset;if(!Number.isFinite(lo)||!Number.isFinite(hi)||!Number.isFinite(hi-lo))fail('Range arithmetic exceeded finite Float64 precision');return {start:lo,end:hi,amount:read(options.amount,1,extended?-Infinity:-1,extended?Infinity:1),smooth:read(options.smoothness,1,0,1),high:read(options.easeHigh,0,-1,1),low:read(options.easeLow,0,-1,1),shape};
}
function rangePoint(index:number,n:number,p:RangeParameters){
 const s=p.start,e=p.end,unitWidth=1/Math.max(1,n),c=(index+.5)*unitWidth;let v:number;
 if(p.shape==='square'){const w=p.smooth*unitWidth,edge=(d:number)=>w>1e-12?clamp(d/w+.5):d>=0?1:0;v=e-s<=1e-12?0:Math.min(edge(c-s),edge(e-c));}
 else if(e-s<=1e-12)v=p.shape==='ramp-up'?(c>=s?1:0):p.shape==='ramp-down'?(c<s?1:0):0;
 else v=eased(shapeValue(p.shape,(c-s)/(e-s)),p.high,p.low);const out=v*p.amount;if(!Number.isFinite(out))fail('Range influence exceeded finite Float64 precision');return out;
}
/** Legacy bounded array API; unchanged point equations and artistic limits. */
export function rangeSelector(n:number,options:RangeSelectorOptions,context:FrameContext):number[]{
 count(n);const p=rangeParameters(options,context),order=options.randomOrderSeed===undefined?Array.from({length:n},(_,i)=>i):selectorOrder(n,options.randomOrderSeed);return order.map(i=>rangePoint(i,n,p));
}
/** Same audited point equations, lazy scalar evaluation, signed/extended Amount and no new artistic count cap.
 * A requested random permutation allocates exactly n entries; allocation failures are explicit resource errors. */
export function createRangeSelectorSampler(n:number,options:RangeSelectorOptions&{units?:'fraction'|'percent'|'index'}={}){
 if(!Number.isSafeInteger(n)||n<0)fail('Nonnegative safe count required');const p=structuredClone(options),units=p.units??'fraction';if(!['fraction','percent','index'].includes(units))fail('Known range units required');let order:number[]|undefined;
 if(p.randomOrderSeed!==undefined)try{order=permutation(n,p.randomOrderSeed);}catch(error){if(error instanceof EngineError)throw error;throw new EngineError('E_PA_SELECTOR_RESOURCE','Actual random order allocation failed',{details:{count:n,cause:String(error)}});}
 return(index:number,context:FrameContext)=>{if(!Number.isSafeInteger(index)||index<0||index>=n)fail('Original index within the prepared domain required');return rangePoint(order?.[index]??index,n,rangeParameters(p,context,true,units,n));};
}
export function combineSelectors(a:readonly number[],b:readonly number[],mode:'add'|'subtract'|'intersect'|'min'|'max'|'difference'):number[]{
 count(a.length);if(a.length!==b.length||!['add','subtract','intersect','min','max','difference'].includes(mode))fail('Matching counts and a known selector mode required');
 return a.map((x,i)=>{number(x,-1,1);const y=number(b[i],-1,1);return clamp(mode==='add'?x+y:mode==='subtract'?x>=0?Math.max(0,x-y):x-y:mode==='intersect'?x*y:mode==='min'?Math.min(x,y):mode==='max'?Math.max(x,y):Math.abs(x-y),-1,1);});
}
export function randomSelector(n:number,options:{seed:number;probability:Signal<number>},context:FrameContext):number[]{count(n);if(!Number.isSafeInteger(options.seed))fail('Safe seed required');const p=scalar(options.probability,context,0,1);return Array.from({length:n},(_,i)=>unit(BigInt(options.seed)^hash64(BigInt(i)))<p?1:0);}
/** Absolute Stage-local seconds through existing Easing; no per-character timeline/state. */
export function stagger(index:number,options:{delay:Signal<number>;duration:Signal<number>;start?:Signal<number>;easing?:Easing},context:FrameContext):number{
 if(!Number.isInteger(index)||index<0||index>4095)fail('Stagger index must be integer0..4095');const delay=scalar(options.delay,context,0,1e6),duration=scalar(options.duration,context,1e-6,1e6),start=scalar(options.start??0,context,-1e6,1e6),time=number(context.time,-1e6,1e6);validateEasing(options.easing);return easingAt(options.easing,clamp((time-start-index*delay)/duration));
}
export interface TextUnit {text:string;start:number;end:number;index:number;wordIndex:number;kind:'unit'|'separator'}
/** Logical UTF-16 ranges over graphemes/words, not font glyph IDs or a replacement TextLayoutData. */
export function segmentText(text:string,options:{unit?:'grapheme'|'word';locale?:string}={}):TextUnit[]{
 if(typeof text!=='string'||text.length>16384)fail('Text must have at most16384 UTF-16 units');const granularity=options.unit??'grapheme';if(!['grapheme','word'].includes(granularity))fail('Unknown segmentation unit');
 const words=[...new Intl.Segmenter(options.locale??'und',{granularity:'word'}).segment(text)],wordIndex=(at:number)=>words.filter(w=>w.isWordLike).findIndex(w=>w.index<=at&&at<w.index+w.segment.length);let index=0;
 const parts=[...new Intl.Segmenter(options.locale??'und',{granularity}).segment(text)];if(parts.length>1024)fail('Animated text is limited to1024 units including separators');
 return parts.map(p=>{const separator=granularity==='word'&&!p.isWordLike;return {text:p.segment,start:p.index,end:p.index+p.segment.length,index:separator?-1:index++,wordIndex:wordIndex(p.index),kind:separator?'separator':'unit'};});
}
