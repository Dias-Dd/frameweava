// SPDX-License-Identifier: Apache-2.0 AND MIT
// Lazy selectors over original shaped clusters, reusing the audited scalar selector math.
import {easingAt,validateEasing} from '../../../../src/core/animation.ts';
import type {Easing,Signal} from '../../../../src/core/types.ts';
import {combineSelectors} from '../selectors.ts';
import {noise1} from '../noise.ts';
import {sourceTimeContext,shutterTimeContext} from '../native-time/plans.ts';
import {fields,range,integer,finite,number,snapshot,selector,weight,fail,type TextSourceRange,type GlyphSelector} from './common.ts';

export function clusterRangeSelector(text:string,options:TextSourceRange&{match?:'overlap'|'contained'}):GlyphSelector{
 fields(options,['start','end','match']);const r=range(text,options),mode=options.match??'overlap';if(!['overlap','contained'].includes(mode))fail('match','overlap or contained');return u=>Number(mode==='overlap'?u.cluster.start<r.end&&u.cluster.end>r.start:u.cluster.start>=r.start&&u.cluster.end<=r.end&&r.start<r.end);
}
export function indexSetSelector(indices:Iterable<number>,options:{order?:'logical'|'visual'}={}):GlyphSelector{
 fields(options,['order']);const order=options.order??'logical';if(!['logical','visual'].includes(order)||!indices||typeof indices[Symbol.iterator]!=='function')fail('indices/order','iterable safe indices and logical/visual order');const set=new Set<number>();for(const index of indices)set.add(integer(index,'index'));return u=>Number(set.has(order==='logical'?u.logicalIndex:u.visualIndex));
}
/** Explicit Unicode word ranges from the caller's reviewed/pinned segmenter, never glyph-id guesses. */
export function wordRangeSelector(text:string,words:readonly TextSourceRange[],options:{start?:number;end?:number}={}):GlyphSelector{
 fields(options,['start','end']);if(!Array.isArray(words))fail('words','explicit ordered UTF16 ranges');const ranges=words.map(r=>range(text,r));let end=0;for(const r of ranges){if(r.start<end||r.start===r.end)fail('words','nonempty nonoverlapping ordered word ranges');end=r.end;}
 const from=integer(options.start??0,'start word'),to=integer(options.end??ranges.length,'end word');if(to<from||to>ranges.length)fail('word range','ordered existing word indices');return u=>{for(let i=from;i<to;i++)if(u.cluster.start<ranges[i].end&&u.cluster.end>ranges[i].start)return 1;return 0;};
}
export function lineSelector(lineIds:Iterable<string>):GlyphSelector{
 if(!lineIds||typeof lineIds[Symbol.iterator]!=='function')fail('lineIds','iterable canonical line ids');const set=new Set<string>();for(const id of lineIds){if(typeof id!=='string'||!id)fail('lineIds','nonempty canonical ids');set.add(id);}return u=>Number(set.has(u.lineId));
}
/** Exact original UTF16 substring; selects whole overlapping shaped clusters, never splits ligatures. */
export function textMatchSelector(text:string,query:string,options:{occurrence?:number|'all'}={}):GlyphSelector{
 fields(options,['occurrence']);if(typeof text!=='string'||typeof query!=='string'||!query)fail('text/query','original text and nonempty exact substring');const occurrence=options.occurrence??'all';if(occurrence!=='all')integer(occurrence,'occurrence');const ranges:TextSourceRange[]=[];let from=0,index=0;
 while(from<=text.length-query.length){const at=text.indexOf(query,from);if(at<0)break;if(occurrence==='all'||index===occurrence)ranges.push(range(text,{start:at,end:at+query.length}));from=at+query.length;index++;}
 return u=>Number(ranges.some(r=>u.cluster.start<r.end&&u.cluster.end>r.start));
}
export function distanceSelector(options:{center:readonly [Signal<number>,Signal<number>];radius:Signal<number>;softness?:Signal<number>}):GlyphSelector{
 fields(options,['center','radius','softness']);const p=snapshot(options);if(!Array.isArray(p.center)||p.center.length!==2)fail('center','two pixel Signals');return (u,c)=>{const x=number(p.center[0],c,'center.x'),y=number(p.center[1],c,'center.y'),radius=number(p.radius,c,'radius'),soft=number(p.softness??0,c,'softness');if(radius<0||soft<0)fail('radius/softness','nonnegative pixel distances');const d=Math.hypot(u.anchor[0]-x,u.anchor[1]-y);return soft===0?Number(d<=radius):Math.max(0,Math.min(1,(radius-d)/soft+.5));};
}
export function axisSelector(options:{axis?:'x'|'y';start:Signal<number>;end:Signal<number>;reverse?:boolean}):GlyphSelector{
 fields(options,['axis','start','end','reverse']);const p=snapshot(options),axis=p.axis??'x';if(!['x','y'].includes(axis)||p.reverse!==undefined&&typeof p.reverse!=='boolean')fail('axis/reverse','x/y and boolean');return (u,c)=>{const start=number(p.start,c,'start px'),end=number(p.end,c,'end px');if(end<=start)fail('end','greater than start in physical px');const w=Math.max(0,Math.min(1,(u.anchor[axis==='x'?0:1]-start)/(end-start)));return p.reverse?1-w:w;};
}
/** Smooth seeded cluster-index noise, unlike the existing Boolean probability selector. */
export function noiseSelector(options:{seed?:number;frequency?:number;speed?:number}={}):GlyphSelector{
 fields(options,['seed','frequency','speed']);const seed=options.seed??0,f=finite(options.frequency??1,'frequency'),speed=finite(options.speed??1,'speed');if(!Number.isSafeInteger(seed))fail('seed','safe integer');return (u,c)=>{const phase=finite(u.logicalIndex*f+c.time*speed,'noise phase');if(Math.abs(phase)>Number.MAX_SAFE_INTEGER-1)fail('noise phase','resolvable Float64 cell');return Math.max(0,Math.min(1,(noise1(BigInt(seed),phase)+1)/2));};
}
const combined=(a:GlyphSelector,b:GlyphSelector,mode:Parameters<typeof combineSelectors>[2]):GlyphSelector=>{selector(a);selector(b);return(u,c)=>combineSelectors([weight(a,u,c)],[weight(b,u,c)],mode)[0];};
export const selectorUnion=(a:GlyphSelector,b:GlyphSelector):GlyphSelector=>combined(a,b,'max');
export const selectorIntersection=(a:GlyphSelector,b:GlyphSelector):GlyphSelector=>combined(a,b,'intersect');
export const selectorSubtract=(a:GlyphSelector,b:GlyphSelector):GlyphSelector=>combined(a,b,'subtract');
export function selectorInvert(input:GlyphSelector):GlyphSelector{selector(input);return(u,c)=>1-weight(input,u,c);}
export function selectorThreshold(input:GlyphSelector,options:{threshold?:Signal<number>;softness?:Signal<number>}={}):GlyphSelector{
 selector(input);fields(options,['threshold','softness']);const p=snapshot(options);return(u,c)=>{const t=number(p.threshold??.5,c,'threshold'),s=number(p.softness??0,c,'softness');if(t<0||t>1||s<0||s>1)fail('threshold/softness','fractions in [0,1]');const w=weight(input,u,c);return s===0?Number(w>=t):Math.max(0,Math.min(1,(w-t)/s+.5));};
}
export function selectorEase(input:GlyphSelector,easing:Easing='easeInOut'):GlyphSelector{selector(input);validateEasing(easing);const e=snapshot(easing);return(u,c)=>Math.max(0,Math.min(1,easingAt(e,weight(input,u,c))));}
/** Retimes any selector per shaped unit; no inherited 4096-unit selector array cap or new timer. */
export function staggerGlyphSelector(input:GlyphSelector,options:{delaySeconds:number;order?:'logical'|'visual';clock?:'stage'|'local'}):GlyphSelector{
 selector(input);fields(options,['delaySeconds','order','clock']);const delay=finite(options.delaySeconds,'delaySeconds'),order=options.order??'logical',clock=options.clock??'stage';if(!['logical','visual'].includes(order)||!['stage','local'].includes(clock))fail('order/clock','logical/visual and stage/local');return(u,c)=>{const time=finite(c.time-(order==='logical'?u.logicalIndex:u.visualIndex)*delay,'delayed time'),at=clock==='stage'?shutterTimeContext(c,time):sourceTimeContext(c,time);return weight(input,u,at);};
}
