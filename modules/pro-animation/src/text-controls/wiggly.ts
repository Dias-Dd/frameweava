// SPDX-License-Identifier: Apache-2.0 AND MIT
// Adapted original text/selectors.rs Wiggly/selector-noise @861c51f8187bf56efc77cc7b60fc4a513d2b7198.
// Copyright (c) 2026 ArtCraft Team and contributors. Original MIT license and source remain in vendor.
import type {Signal,FrameContext} from '../../../../src/core/types.ts';
import {hash64} from '../noise.ts';
import {fields,number,finite,integer,snapshot,fail,type TextGlyphUnit,type GlyphSelector} from '../text-animation/common.ts';
import {glyphInfluence} from './influence.ts';
import type {TextSelectorDomain} from './domain.ts';
export interface WigglyInfluenceOptions {min?:Signal<number>;max?:Signal<number>;wigglesPerSecond?:Signal<number>;correlation?:Signal<number>;temporalPhase?:Signal<number>;spatialPhase?:Signal<number>;lockDimensions?:boolean;seed?:number}
export interface WigglyInfluence extends GlyphSelector {dimension(index:number):GlyphSelector}
const u64=(v:bigint)=>BigInt.asUintN(64,v),hash3=(a:bigint,b:bigint,c:bigint)=>hash64(hash64(hash64(a)^u64(b*0x632be59bd9b4e019n))^u64(c*0x8cb92ba72f3d8dd7n));
function noise(x:number,seed:bigint,channel:bigint){finite(x,'wiggly coordinate');if(Math.abs(x)>Number.MAX_SAFE_INTEGER-1)fail('wiggly coordinate','resolvable Float64 lattice');const i=Math.floor(x),f=x-i,lat=(k:number)=>Number(hash3(seed,channel,u64(BigInt(k)))>>11n)/2**53*2-1,a=lat(i),b=lat(i+1),t=f*f*f*(f*(f*6-15)+10);return a+(b-a)*t;}
/** Same original equations. Public domain checks reject invalid input rather than silently clamp it. */
export function sampleWigglyInfluence(index:number,dimension:number,time:number,p:Required<WigglyInfluenceOptions>&{min:number;max:number;wigglesPerSecond:number;correlation:number;temporalPhase:number;spatialPhase:number}):number{
 integer(index,'unit index');integer(dimension,'dimension');finite(time,'time');if(!Number.isSafeInteger(p.seed)||p.correlation<0||p.correlation>1||p.max<p.min||p.wigglesPerSecond<0||typeof p.lockDimensions!=='boolean')fail('wiggly parameters','ordered finite amounts, fraction correlation, nonnegative frequency and safe seed');for(const v of [p.min,p.max,p.wigglesPerSecond,p.correlation,p.temporalPhase,p.spatialPhase])finite(v,'wiggly parameter');const ch=p.lockDimensions?0n:BigInt(dimension),seed=u64(BigInt(p.seed)),tau=time*p.wigglesPerSecond+p.temporalPhase/360,shared=noise(tau,seed,ch*2n),along=index*.61+p.spatialPhase/360,own=.5*noise(tau+along,seed^0xa5a5n,ch*2n+1n)+.5*noise(tau*1.37+along*1.7,seed^u64((BigInt(index)+1n)*0x9e37n),ch),v=Math.max(-1,Math.min(1,p.correlation*shared+(1-p.correlation)*Math.max(-1,Math.min(1,own))));return finite(p.min+(v+1)*.5*(p.max-p.min),'wiggly result');
}
export function textWigglyInfluence(options:WigglyInfluenceOptions={},domain?:TextSelectorDomain):WigglyInfluence{
 fields(options,['min','max','wigglesPerSecond','correlation','temporalPhase','spatialPhase','lockDimensions','seed']);const p=snapshot(options);if(p.lockDimensions!==undefined&&typeof p.lockDimensions!=='boolean'||!Number.isSafeInteger(p.seed??0))fail('wiggly options','boolean dimensions lock and safe seed');
 const at=(u:TextGlyphUnit,c:FrameContext,dimension:number)=>{const input={min:number(p.min??-1,c,'min'),max:number(p.max??1,c,'max'),wigglesPerSecond:number(p.wigglesPerSecond??2,c,'wigglesPerSecond'),correlation:number(p.correlation??.5,c,'correlation'),temporalPhase:number(p.temporalPhase??0,c,'temporalPhase'),spatialPhase:number(p.spatialPhase??0,c,'spatialPhase'),lockDimensions:p.lockDimensions??false,seed:p.seed??0},indices=domain?.indices(u)??[u.logicalIndex];return indices.length?indices.reduce((v,index)=>v+sampleWigglyInfluence(index,dimension,c.time,input),0)/indices.length:0;};
 return Object.freeze(Object.assign(glyphInfluence((u,c)=>at(u,c,0)),{dimension(index:number){integer(index,'dimension');return glyphInfluence((u,c)=>at(u,c,index));}}));
}
