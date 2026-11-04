// SPDX-License-Identifier: Apache-2.0 AND Unicode-3.0
import {EngineError} from '../../../../src/core/errors.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {ShapeRunOptions,ShapedRun} from '../font-shaping.ts';
import type {BidiFont} from '../bidi-line.ts';
import {textGraphemes} from '../text-layout/breaks.ts';
import {unicodeJoiningType} from './joining.ts';
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_COMPOSE_KASHIDA',message,{details});};
export interface KashidaInsertion {at:number;count:number}
export interface KashidaRun extends ShapedRun {elongation:{source:string;shapingText:string;insertions:readonly KashidaInsertion[];mapping:readonly {start:number;end:number}[]}}
/** Legal joining/grapheme/actual original cluster boundaries, not guessed x gaps.
 * Deliberately excludes protected original ligature interiors (e.g. lam-alef). */
export function kashidaOpportunities(run:ShapedRun):readonly number[]{
 const text=run.layout.text,scalars:{start:number;end:number;cp:number}[]=[];let at=0;for(const ch of text){scalars.push({start:at,end:at+ch.length,cp:ch.codePointAt(0)!});at+=ch.length;}
 const result:number[]=[],scalarEnds=new Map(scalars.map((v,i)=>[v.end,i])),intervals=run.layout.glyphs.map(g=>g.cluster).sort((a,b)=>a.start-b.start),clusterEnds=new Set(intervals.map(v=>v.end));let cursor=0,maxEnd=-1;
 for(const g of textGraphemes(text)){
  const edge=g.end;while(cursor<intervals.length&&intervals[cursor].start<edge)maxEnd=Math.max(maxEnd,intervals[cursor++].end);
  if(edge===text.length||maxEnd>edge||!clusterEnds.has(edge))continue;
  let left=scalarEnds.get(edge)??-1,right=left+1;while(left>=0&&unicodeJoiningType(scalars[left].cp)==='T')left--;while(right<scalars.length&&unicodeJoiningType(scalars[right].cp)==='T')right++;
  if(left<0||right>=scalars.length)continue;
  const a=unicodeJoiningType(scalars[left].cp),b=unicodeJoiningType(scalars[right].cp);
  if(['D','L','C'].includes(a)&&['D','R','C'].includes(b))result.push(edge);
 }return Object.freeze(result);
}
/** Original font shapes real Tatweel glyphs and joining forms. Source attribution
 * remains canonical UTF16; local metadata retains every actual shaping-input unit.
 * No drawn rectangle, disconnected scaled stroke or invented font glyph is used. */
export async function shapeKashidaRun(font:BidiFont,text:string,options:ShapeRunOptions,insertions:readonly KashidaInsertion[],signal?:AbortSignal):Promise<KashidaRun>{
 if(!Array.isArray(insertions))fail('Typed Kashida insertions required');
 const p=structuredClone(options),cuts=insertions.map(v=>({...v}));signal?.throwIfAborted();
 if(p.script!=='Arab')fail('An explicitly itemized Arabic run is required');
 const plain=await font.shapeRun(text,p),legal=new Set(kashidaOpportunities(plain)),counts=new Map<number,number>();
 let total=0;for(const cut of cuts){if(!legal.has(cut.at)||counts.has(cut.at)||!Number.isSafeInteger(cut.count)||cut.count<1)fail('Unique legal original-source boundaries and positive integer counts required',{cut,legal:[...legal]});counts.set(cut.at,cut.count);total+=cut.count;}
 if(!Number.isSafeInteger(total)||text.length+total>graphics.LIMITS.string)throw new EngineError('E_GRAPHICS_LIMIT','Actual elongated shaping text exceeds the existing canonical source budget');
 if(!total)return {...plain,elongation:{source:text,shapingText:text,insertions:[],mapping:Array.from({length:text.length},(_,i)=>({start:i,end:i+1}))}};
 const probe=await font.shapeRun('\u0640',{...p,context:undefined,missingGlyph:'error'});if(probe.layout.glyphs.some(g=>g.glyphId===0)||!probe.glyphPaths.length)fail('Selected font has no real visible Tatweel glyph');
 const map:{start:number;end:number}[]=[],pieces:string[]=[];
 for(let i=0;i<text.length;i++){
  const count=counts.get(i);if(count){const owner=plain.layout.glyphs.find(g=>g.cluster.end===i);if(!owner)fail('No complete original source cluster owns the insertion');pieces.push('\u0640'.repeat(count));for(let n=0;n<count;n++)map.push({...owner!.cluster});}
  pieces.push(text[i]);map.push({start:i,end:i+1});
 }
 const shapingText=pieces.join('');signal?.throwIfAborted();const shaped=await font.shapeRun(shapingText,p);signal?.throwIfAborted();if(shaped.layout.glyphs.some(g=>g.glyphId===0))fail('Actual elongated font shaping returned .notdef');
 const glyphs=shaped.layout.glyphs.map(g=>{let start=Infinity,end=-Infinity;for(let i=g.cluster.start;i<g.cluster.end;i++){const source=map[i];if(!source)fail('Original shaper cluster exceeds the actual expanded input');start=Math.min(start,source.start);end=Math.max(end,source.end);}return {...g,cluster:{start,end}};});
 const layout=graphics.validateTextLayoutData({...shaped.layout,text,paragraphs:shaped.layout.paragraphs.map(v=>({...v,start:0,end:text.length})),lines:shaped.layout.lines.map(v=>({...v,start:0,end:text.length})),glyphs});
 return {...shaped,layout,elongation:{source:text,shapingText,insertions:Object.freeze(cuts),mapping:Object.freeze(map)}};
}
