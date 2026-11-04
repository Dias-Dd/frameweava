// SPDX-License-Identifier: Apache-2.0
// Existing grapheme/word segmentation and canonical source clusters; never infer glyph IDs as characters.
import {textGraphemes,textWords} from '../text-layout/breaks.ts';
import {sourceText,frozen} from '../text-layout/common.ts';
import {createRangeSelectorSampler,type RangeSelectorOptions} from '../selectors.ts';
import {range,fields,fail,type TextGlyphUnit,type GlyphSelector} from '../text-animation/common.ts';
import {glyphInfluence} from './influence.ts';
export type SelectorBasedOn='characters'|'characters-excluding-spaces'|'words'|'lines';
export interface TextSelectorDomain {readonly source:string;readonly basedOn:SelectorBasedOn;readonly count:number;indices(unit:TextGlyphUnit):readonly number[]}
export function createTextSelectorDomain(text:string,units:readonly TextGlyphUnit[],options:{basedOn?:SelectorBasedOn;locale?:string}={}):TextSelectorDomain{
 sourceText(text);fields(options,['basedOn','locale']);const basedOn=options.basedOn??'characters';if(!['characters','characters-excluding-spaces','words','lines'].includes(basedOn)||!Array.isArray(units))fail('domain','canonical glyph units and known Based On');const lineIds=[...new Set(units.map(u=>u.lineId))],parts=basedOn==='words'?textWords(text,{locale:options.locale}):basedOn==='lines'?[]:textGraphemes(text,{locale:options.locale}).filter(g=>basedOn==='characters'||!/^\p{White_Space}+$/u.test(g.text)),count=basedOn==='lines'?lineIds.length:parts.length,map=new Map<string,readonly number[]>(),key=(u:TextGlyphUnit)=>u.lineId+':'+u.cluster.start+':'+u.cluster.end;
 for(const u of units){range(text,u.cluster);if(u.text!==text.slice(u.cluster.start,u.cluster.end))fail('unit','original complete source cluster');const indices:number[]=[];if(basedOn==='lines')indices.push(lineIds.indexOf(u.lineId));else{let lo=0,hi=parts.length;while(lo<hi){const middle=(lo+hi)>>>1;if(parts[middle].end<=u.cluster.start)lo=middle+1;else hi=middle;}for(let i=lo;i<parts.length&&parts[i].start<u.cluster.end;i++)indices.push(i);}map.set(key(u),Object.freeze(indices));}
 return Object.freeze({source:text,basedOn,count,indices(u:TextGlyphUnit){const a=map.get(key(u));if(!a||u.text!==text.slice(u.cluster.start,u.cluster.end))fail('unit','a unit from the same prepared source/line mapping');return a;}});
}
/** Whole shaped clusters receive the mean source-unit influence; attached marks/ligatures are not split. */
export function textRangeInfluence(domain:TextSelectorDomain,options:RangeSelectorOptions&{units?:'fraction'|'percent'|'index'}={}):GlyphSelector{
 const sample=createRangeSelectorSampler(domain.count,options);return glyphInfluence((u,c)=>{const indices=domain.indices(u);return indices.length?indices.reduce((v,i)=>v+sample(i,c),0)/indices.length:0;});
}
export function inspectTextSelectorDomain(domain:TextSelectorDomain,units:readonly TextGlyphUnit[]){return frozen({source:domain.source,basedOn:domain.basedOn,count:domain.count,units:units.map(u=>({cluster:{...u.cluster},lineId:u.lineId,indices:[...domain.indices(u)]}))});}
