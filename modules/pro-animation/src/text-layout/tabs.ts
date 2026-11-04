// SPDX-License-Identifier: Apache-2.0
// Physical tab layout only. Original UAX9 itemization and HarfRust shaping remain authoritative.
import {EngineError} from '../../../../src/core/errors.ts';
import type * as Graphics from '../../../graphics-contracts/index.ts';
import type {ShapedBidiLine} from '../bidi-line.ts';
export interface TextTabStop {position:number;align?:'start'|'center'|'end'|'decimal';decimal?:string}
export interface TextTabOptions {stops?:readonly TextTabStop[];/** Positive physical px beyond last explicit stop. Defaults 4em. */repeat?:number;afterLast?:'repeat'|'error';overlap?:'error'|'allow'}
export interface PlacedTextTab {readonly sourceIndex:number;readonly position:number;readonly fieldStart:number;readonly fieldAdvance:number;readonly advance:number;readonly alignment:string;readonly glyphIndex:number}
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_TEXT_TAB',message,{details});};
const finite=(n:number,name:string)=>{if(typeof n!=='number'||!Number.isFinite(n))fail(name+' must be finite');return n;};
export function textTabOptions(value:TextTabOptions,size:number):Required<TextTabOptions>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['stops','repeat','afterLast','overlap'].includes(k)))fail('Documented tab fields required');
 const p=structuredClone(value),stops=p.stops===undefined?[]:p.stops,repeat=finite(p.repeat===undefined?4*size:p.repeat,'repeat');if(!Array.isArray(stops)||repeat<=0||!['repeat','error'].includes(p.afterLast??'repeat')||!['error','allow'].includes(p.overlap??'error'))fail('Ordered stops, positive repeat and known policies required');let last=-Infinity;
 for(const s of stops){if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['position','align','decimal'].includes(k)))fail('Documented stop fields required');finite(s.position,'position');if(s.position<0||s.position<=last||!['start','center','end','decimal'].includes(s.align??'start'))fail('Strictly increasing nonnegative stops and known alignment required');last=s.position;if(s.decimal!==undefined&&typeof s.decimal!=='string')fail('Decimal marker must be a string');const chars=[...(s.decimal??'.')],cp=chars[0]?.codePointAt(0);if(chars.length!==1||cp!>=0xd800&&cp!<=0xdfff||/[\t\r\n\p{Bidi_Control}]/u.test(chars[0]))fail('One Unicode decimal marker required');}
 return {...p,stops,repeat,afterLast:p.afterLast??'repeat',overlap:p.overlap??'error'};
}
/** Called only after original paragraph bidi and actual blank-space shaping.
 * Tab uses an actual verified no-ink font-space glyph, with explicit computed advance;
 * no fabricated glyph/ink or changes to Unicode source indices are made. */
export function placeLineTabs(graphics:Pick<typeof Graphics,'validateTextLayoutData'|'validatePathData'>,input:ShapedBidiLine,options:TextTabOptions,box:{x:number;width?:number;align:string;size:number}):ShapedBidiLine{
 const p=textTabOptions(options,box.size),out=structuredClone(input),layout=out.layout,glyphs=layout.glyphs,direction=layout.paragraphs[0]?.direction??'ltr',paths=new Map(out.glyphPaths.map(p=>[p.glyphIndex,p])),tabs:{glyph:number;source:number;before:number;after:number}[]=[],groups:{indices:number[];advance:number;oldStart:number;offset:number}[]=[{indices:[],advance:0,oldStart:out.origin[0],offset:0}];let oldPen=out.origin[0];const sourceTabs=[...layout.text.matchAll(/\t/gu)].map(m=>m.index),seen=new Set<number>();
 for(const [i,g]of glyphs.entries()){
  if(layout.text.slice(g.cluster.start,g.cluster.end).includes('\t')){if(g.cluster.end-g.cluster.start!==1||layout.text[g.cluster.start]!=='\t'||seen.has(g.cluster.start)||paths.has(i)||g.advanceY!==0)fail('A tab must map to exactly one actual no-ink horizontal space glyph',{cluster:g.cluster});seen.add(g.cluster.start);const before=groups.length-1;tabs.push({glyph:i,source:g.cluster.start,before,after:groups.length});oldPen=finite(oldPen+g.advanceX,'old pen');groups.push({indices:[],advance:0,oldStart:oldPen,offset:0});}
  else{const group=groups.at(-1)!;group.indices.push(i);group.advance=finite(group.advance+g.advanceX,'field advance');oldPen=finite(oldPen+g.advanceX,'old pen');}
 }
 for(const group of groups)if(group.advance<0)fail('Negative net field advance requires an alternate explicit layout policy');
 if(sourceTabs.some(n=>!seen.has(n)))fail('Shaper did not preserve an independent tab placeholder',{expected:sourceTabs,observed:[...seen]});
 const ordered=direction==='rtl'?[...groups.keys()].reverse():[...groups.keys()],placed:PlacedTextTab[]=[];let cursor=groups[ordered[0]].advance,extent=cursor;
 for(let n=1;n<ordered.length;n++){
  const group=groups[ordered[n]],tab=direction==='rtl'?tabs[tabs.length-n]:tabs[n-1];let stop=p.stops.find(s=>s.position>cursor);
  if(!stop){if(p.afterLast==='error')fail('No explicit stop after this field',{sourceIndex:tab.source,cursor});const last=p.stops.at(-1)?.position??0,steps=Math.floor((cursor-last)/p.repeat)+1,position=finite(last+steps*p.repeat,'repeat position');if(!Number.isSafeInteger(steps)||position<=cursor)fail('Tab grid spacing exceeds Float64 positional resolution');stop={position,align:'start'};}
  const alignment=stop.align??'start';let anchor=alignment==='end'?group.advance:alignment==='center'?group.advance/2:0;
  if(alignment==='decimal'){
   const marker=stop.decimal??'.',start=group.indices.reduce((a,i)=>Math.min(a,glyphs[i].cluster.start),Infinity),end=group.indices.reduce((a,i)=>Math.max(a,glyphs[i].cluster.end),0),at=Number.isFinite(start)?layout.text.indexOf(marker,start):-1;
   if(at>=0&&at<end){const i=group.indices.find(i=>glyphs[i].cluster.start<=at&&at<glyphs[i].cluster.end);if(i===undefined||glyphs[i].cluster.start!==at)fail('Decimal marker has no independently resolvable glyph origin',{at});const x=glyphs[i!].x-group.oldStart;anchor=direction==='rtl'?group.advance-x:x;}else anchor=group.advance;
  }
  group.offset=finite(stop.position-anchor,'field offset');const gap=finite(group.offset-cursor,'tab advance');if(gap<0){if(p.overlap!=='allow')fail('Aligned field overlaps previous field; choose a later stop or explicitly allow overlap',{sourceIndex:tab.source,gap,position:stop.position});out.diagnostics.push({code:'W_PA_TEXT_TAB_OVERLAP',severity:'warning',message:'Explicit tab policy permits overlapping fields; no automatic clipping or skipped stop',details:{sourceIndex:tab.source,gap}});}
  cursor=finite(group.offset+group.advance,'line cursor');extent=Math.max(extent,cursor,stop.position);placed.push({sourceIndex:tab.source,position:stop.position,fieldStart:group.offset,fieldAdvance:group.advance,advance:gap,alignment,glyphIndex:tab.glyph});
 }
 const align=box.align==='start'?(direction==='rtl'?'right':'left'):box.align==='end'?(direction==='rtl'?'left':'right'):box.align,width=box.width??extent,left=finite(box.x+(align==='right'?width-extent:align==='center'?(width-extent)/2:0),'line left'),deltas=new Map<number,number>();
 for(const group of groups){const target=direction==='rtl'?left+extent-group.offset-group.advance:left+group.offset;for(const i of group.indices){const dx=finite(target-group.oldStart,'glyph shift');glyphs[i].x=finite(glyphs[i].x+dx,'glyph x');deltas.set(i,dx);}}
 for(const tab of tabs){const a=groups[tab.before],b=groups[tab.after],endA=direction==='rtl'?left+extent-a.offset:left+a.offset+a.advance,startB=direction==='rtl'?left+extent-b.offset-b.advance:left+b.offset;glyphs[tab.glyph].x=endA;glyphs[tab.glyph].advanceX=finite(startB-endA,'visual tab advance');}
 for(const item of out.glyphPaths){const dx=deltas.get(item.glyphIndex)??0,move=(v:{id:string;x:number;y:number})=>({...v,x:finite(v.x+dx,'path x')});item.path=graphics.validatePathData({...item.path,commands:item.path.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:move(c.control),point:move(c.point)}:c.op==='C'?{...c,control1:move(c.control1),control2:move(c.control2),point:move(c.point)}:{...c,point:move(c.point)})});}
 out.layout=graphics.validateTextLayoutData(layout);out.origin=[left,out.origin[1]];out.advance=extent;out.tabs=Object.freeze(placed.sort((a,b)=>a.sourceIndex-b.sourceIndex));if(box.width!==undefined&&extent>box.width)out.diagnostics.push({code:'W_PA_TEXT_TAB_OVERFLOW',severity:'warning',message:'Tabbed advance exceeds declared width; contents remain intact',details:{advance:extent,width:box.width}});return out;
}
