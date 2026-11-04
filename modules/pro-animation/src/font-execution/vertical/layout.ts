// SPDX-License-Identifier: Apache-2.0 AND Unicode-3.0
// Column placement; original UAX9/14/29/50 and HarfRust perform their respective algorithms.
import {EngineError} from '../../../../../src/core/errors.ts';
import type {PathData,TextLayoutData,TextGlyphOrientation} from '../../../../graphics-contracts/types.ts';
import * as graphics from '../../../../graphics-contracts/index.ts';
import type {InspectedFont} from '../../typography/fonts.ts';
import type {TextItem} from '../../text-itemizer.ts';
import type {ParagraphItemizer} from '../../text-layout/layout.ts';
import {textGraphemes,unicodeLineBreaks} from '../../text-layout/breaks.ts';
import {sourceText,finite,frozen} from '../../text-layout/common.ts';
import {readDirectedFontRun} from '../kernel.ts';
import {shapeVerticalRun,type VerticalRunOptions,type VerticalRun} from './run.ts';
import {unicodeVerticalOrientation} from './orientation.ts';
import {textTabOptions,type TextTabOptions,type PlacedTextTab} from '../../text-layout/tabs.ts';
import {discretionaryMarker,type PlacedDiscretionaryHyphen} from '../../text-layout/discretionary.ts';
import {placeVerticalTabs,type VerticalPiece} from './tabs.ts';
export interface VerticalTextOptions extends Omit<VerticalRunOptions,'script'|'direction'|'orientation'|'inlineDirection'|'context'|'tateChuYoko'> {
 itemizer:ParagraphItemizer;
 /** Existing verified itemizer detects scripts; override only unresolved items. */
 scriptForRun?:(item:TextItem)=>string;
 baseDirection?:'auto'|'ltr'|'rtl';textOrientation?:'mixed'|'upright'|'sideways-right'|'sideways-left';
 inlineSize?:number;columnAdvance?:number;align?:'start'|'center'|'end';
 wrap?:'none'|'word'|'grapheme';overflow?:'allow'|'error'|'grapheme';locale?:string;
 /** Physical inline-axis stops; same start/center/end/decimal solver as horizontal text. */
 tabs?:TextTabOptions;discretionaryHyphen?:string;
 /** Original UTF16 grapheme-boundary ranges; each is one horizontal unscaled em cell. */
 tateChuYoko?:readonly {start:number;end:number}[];
}
export interface VerticalText extends VerticalRun {
 readonly columns:readonly {id:string;start:number;end:number;contentEnd:number;baseline:number;advance:number;glyphStart:number;glyphEnd:number;tabs?:readonly PlacedTextTab[];discretionaryHyphen?:PlacedDiscretionaryHyphen}[];
 readonly flow:Readonly<{unicodeOrientation:'16.0.0';unicodeLineBreak:'16.0.0';measurements:number;policy:'greedy';segmentation:string}>;
 readonly ignoredRanges:readonly {start:number;end:number;reason:'bidi-control'|'hard-break'}[];
}
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_TEXT_VERTICAL',message,{details});};
function translate(path:PathData,dx:number,dy:number,id:string):PathData {
 const pt=(v:{id:string;x:number;y:number})=>({...v,x:finite(v.x+dx,'path x'),y:finite(v.y+dy,'path y')});
 return {...path,id,commands:path.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:pt(c.control),point:pt(c.point)}:c.op==='C'?{...c,control1:pt(c.control1),control2:pt(c.control2),point:pt(c.point)}:{...c,point:pt(c.point)})};
}
/** No font lookup or permission change. One borrowed inspected font; fallback remains explicit.
 * Original paragraph context is used for each wrapped column. Does not implement CSS layout. */
export async function layoutVerticalText(font:InspectedFont,text:string,input:VerticalTextOptions):Promise<VerticalText>{
 sourceText(text);const {itemizer,scriptForRun,signal,...raw}=input,p=structuredClone(raw),check=()=>signal?.throwIfAborted();check();
 const {fontSize:size,baseline:x=size,y=0,writingMode='vertical-rl',textOrientation='mixed',baseDirection='auto',inlineSize,columnAdvance=size*1.2,align='start',wrap=inlineSize===undefined?'none':'word',overflow='allow',locale='und'}=p;
 [size,x,y,columnAdvance].forEach(v=>finite(v,'vertical px'));
 if(!(size>0&&columnAdvance>0)||inlineSize!==undefined&&!(finite(inlineSize,'inlineSize')>0)||!['vertical-rl','vertical-lr'].includes(writingMode)||!['mixed','upright','sideways-right','sideways-left'].includes(textOrientation)||!['none','word','grapheme'].includes(wrap)||!['allow','error','grapheme'].includes(overflow)||!['start','center','end'].includes(align)||!['auto','ltr','rtl'].includes(baseDirection)||typeof itemizer?.analyzeLine!=='function')fail('Valid vertical controls and an existing contextual itemizer required');
 if(wrap!=='none'&&inlineSize===undefined)fail('Wrapping requires a positive inlineSize');
 if(p.tateChuYoko!==undefined&&!Array.isArray(p.tateChuYoko))fail('Tate-chu-yoko requires explicit original source ranges');
 const combined=[...(p.tateChuYoko??[])];if(combined.some(r=>!r||typeof r!=='object'))fail('Tate-chu-yoko requires source range objects');combined.sort((a,b)=>a.start-b.start);const sourceBoundaries=new Set([0,...textGraphemes(text,{locale}).map(g=>g.end)]);
 for(const [i,r]of combined.entries())if(!r||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start>=r.end||!sourceBoundaries.has(r.start)||!sourceBoundaries.has(r.end)||i>0&&combined[i-1].end>r.start||/[\t\r\n\u000b\u000c\u0085\u2028\u2029\u00ad\p{Bidi_Control}]/u.test(text.slice(r.start,r.end)))fail('Tate-chu-yoko requires nonoverlapping whole graphemes within one clean line',{range:r});
 if(combined.length&&textOrientation==='sideways-left')fail('Tate-chu-yoko uses forward vertical cells, not negative sideways-left progression');
 const tabs=text.includes('\t')||p.tabs!==undefined?textTabOptions(p.tabs??{},size):undefined,marker=discretionaryMarker(p.discretionaryHyphen??'\u2010');
 const shaping={fontSize:size,features:p.features,language:p.language,variations:p.variations,missingGlyph:p.missingGlyph,paint:p.paint,tsume:p.tsume,signal},seed=await shapeVerticalRun(font,'',{...shaping,script:'Zyyy',baseline:x,y,writingMode});check();
 const paragraphs:TextLayoutData['paragraphs']=[],lines:TextLayoutData['lines']=[],glyphs:TextLayoutData['glyphs']=[],glyphPaths:VerticalRun['glyphPaths']=[],colorGlyphs:NonNullable<VerticalRun['colorGlyphs']>=[],diagnostics:VerticalRun['diagnostics']=[],columns:VerticalText['columns'][number][]=[],ignored:VerticalText['ignoredRanges'][number][]=[];
 const hard:{start:number;contentEnd:number;end:number}[]=[];let start=0;
 for(const m of text.matchAll(/\r\n|[\r\n\u000b\u000c\u0085\u2028\u2029]/gu)){hard.push({start,contentEnd:m.index,end:m.index+m[0].length});ignored.push({start:m.index,end:m.index+m[0].length,reason:'hard-break'});start=m.index+m[0].length;}hard.push({start,contentEnd:text.length,end:text.length});
 let measurements=0;
 for(const para of hard){
  check();const original=text.slice(para.start,para.contentEnd),full=await itemizer.analyze(original,{baseDirection,signal}),direction=full.paragraphs[0]?.direction??(baseDirection==='rtl'?'rtl':'ltr'),pid='paragraph.'+paragraphs.length;
  paragraphs.push({id:pid,start:para.start,end:para.end,direction,writingMode});
  for(let i=0;i<full.flags.length;){if(!(full.flags[i]&2)){i++;continue;}const a=i;while(i<full.flags.length&&(full.flags[i]&2))i++;ignored.push({start:para.start+a,end:para.start+i,reason:'bidi-control'});}
  const graphemes=textGraphemes(original,{locale}),boundaries=new Set([0,...graphemes.map(v=>v.end)]),permitted=(v:number)=>!combined.some(r=>r.start<para.start+v&&para.start+v<r.end),opportunities=(wrap==='grapheme'?graphemes.map(v=>v.end):unicodeLineBreaks(original).map(v=>v.position)).filter(v=>boundaries.has(v)&&permitted(v));
  async function shapeLine(a:number,b:number){
   check();const analysis=await itemizer.analyzeLine(original,{start:a,end:b},{baseDirection:direction,signal}),pieces:VerticalPiece[]=[],markerAt=b<original.length&&original[b-1]==='\u00ad'?para.start+b-1:undefined;let advance=0;
   for(const item of analysis.runs){
    if(item.splitsGrapheme)fail('Original bidi boundary splits a grapheme',{start:para.start+a+item.start,end:para.start+a+item.end});
    const globalItem={...item,start:para.start+a+item.start,end:para.start+a+item.end},candidate=scriptForRun?.(globalItem)??item.script;
    for(const range of combined)if(range.start<globalItem.end&&globalItem.start<range.end&&!(globalItem.start<=range.start&&range.end<=globalItem.end))fail('Tate-chu-yoko group crosses an original contextual script/bidi run; select a single resolved run',{range,item:globalItem});
    const script=candidate??fail('Choose an explicit script for the unresolved original item',{item:globalItem});
    if(!/^[A-Za-z]{4}$/.test(script))fail('Four-letter original script required',{item:globalItem});
    const units:number[]=[];let clean='';for(let i=item.start;i<item.end;i++){const source=para.start+a+i;if(source===markerAt){clean+=marker;units.push(...Array(marker.length).fill(source));}else if(!(analysis.flags[i]&2)&&analysis.text[i]!=='\u00ad'){clean+=analysis.text[i]==='\t'?' ':analysis.text[i];units.push(source);}}if(!clean)continue;
    const parts:{start:number;end:number;orientation:TextGlyphOrientation;combined?:number}[]=[];
    for(const g of textGraphemes(clean,{locale})){
     let orientation:TextGlyphOrientation=textOrientation==='mixed'?'upright':textOrientation;
     if(textOrientation==='mixed'){
      const scalar=[...g.text].find(c=>!/[\p{Mark}\p{Default_Ignorable_Code_Point}]/u.test(c))??[...g.text][0],property=unicodeVerticalOrientation(scalar.codePointAt(0)!);
      if(property==='R')orientation='sideways-right';
      else if(property==='Tr'){
       // UAX50 transformed-or-rotated fallback: compare actual vertical/horizontal shaping; vertical required features may ignore disabling.
       const opts={script,direction:'ttb' as const,language:p.language,variations:p.variations,signal},v=await readDirectedFontRun(font,g.text,{...opts,features:p.features}),un=await readDirectedFontRun(font,g.text,{...opts,direction:item.direction,features:{...p.features,vert:0,vrt2:0}});
       orientation=JSON.stringify(v.glyphs.map(g=>g.glyphId))!==JSON.stringify(un.glyphs.map(g=>g.glyphId))?'upright':'sideways-right';
      }
     }
     const group=combined.findIndex(r=>r.start<=units[g.start]&&units[g.end-1]<r.end),tag=group<0?undefined:group;if(tag!==undefined)orientation='upright';
     const last=parts.at(-1),tab=original[units[g.start]-para.start]==='\t',lastTab=last&&original[units[last.start]-para.start]==='\t';if(last?.orientation===orientation&&last.combined===tag&&!tab&&!lastTab)last.end=g.end;else parts.push({start:g.start,end:g.end,orientation,combined:tag});
    }
    for(const part of (item.direction==='rtl'?[...parts].reverse():parts)){
     const run=await shapeVerticalRun(font,clean.slice(part.start,part.end),{...shaping,script,direction:item.direction,baseline:0,y:0,writingMode,orientation:part.orientation,tateChuYoko:part.combined!==undefined,context:{before:clean.slice(0,part.start),after:clean.slice(part.end)}});check();
     const amount=run.advance[1];if(run.advance[0]!==0||textOrientation!=='sideways-left'&&amount<0||textOrientation==='sideways-left'&&amount>0)fail('Original run has incompatible cross-column or inline advances',{advance:run.advance});
     pieces.push({run,sourceUnits:units.slice(part.start,part.end)});advance=finite(advance+amount,'inline advance');
    }
   }
   const placed=tabs&&original.slice(a,b).includes('\t')?placeVerticalTabs(pieces,original.slice(a,b),para.start+a,advance,tabs,size):{pieces,advance,tabs:[],diagnostics:[]};return {...placed,markerAt};
  }
  let cursor=0,done=false;
  while(!done){
   check();let end=original.length;
   if(wrap!=='none'&&cursor<original.length){let best=cursor;
    const candidates=[...new Set([...opportunities.filter(v=>v>cursor),original.length])].sort((a,b)=>a-b);
    let firstOverflow=cursor;for(const edge of candidates){const m=await shapeLine(cursor,edge);measurements++;if(Math.abs(m.advance)<=inlineSize!){best=edge;continue;}if(firstOverflow===cursor)firstOverflow=edge;
     if(best===cursor&&overflow==='grapheme'&&wrap!=='grapheme'){for(const g of graphemes){if(g.end<=cursor||g.end>edge||!permitted(g.end))continue;const small=await shapeLine(cursor,g.end);measurements++;if(Math.abs(small.advance)>inlineSize!){if(best===cursor)best=g.end;break;}best=g.end;}}
    }end=best===cursor?firstOverflow:best;if(end<=cursor)fail('No advancing permitted column boundary');
   }
   const line=await shapeLine(cursor,end),extent=Math.abs(line.advance),sign=line.advance<0?-1:1,offset=inlineSize===undefined?0:align==='end'?inlineSize-extent:align==='center'?(inlineSize-extent)/2:0;
   if(inlineSize!==undefined&&extent>inlineSize){if(overflow==='error')fail('Unbreakable vertical source exceeds inlineSize',{start:para.start+cursor,end:para.start+end,advance:line.advance,inlineSize});diagnostics.push({code:'W_PA_TEXT_VERTICAL_OVERFLOW',severity:'warning',message:'Original source preserved beyond the explicit inline box; no clipping',details:{start:para.start+cursor,end:para.start+end,advance:line.advance,inlineSize}});}
   const baseline=x+(writingMode==='vertical-rl'?-1:1)*columnAdvance*columns.length,id='column.'+columns.length,glyphStart=glyphs.length;let pen=y+sign*offset;
   diagnostics.push(...(line.diagnostics??[]));
   for(const {run,sourceUnits}of line.pieces){
    const first=glyphs.length;for(const g of run.layout.glyphs){const a=sourceUnits[g.cluster.start],b=sourceUnits[g.cluster.end-1]+1;if(a===undefined||!Number.isFinite(b))fail('Invalid original source cluster mapping');glyphs.push({...g,id:'glyph.'+glyphs.length,lineId:id,x:baseline+g.x,y:pen+g.y,cluster:{start:a,end:b}});}
    for(const item of run.glyphPaths)glyphPaths.push({glyphIndex:first+item.glyphIndex,path:translate(item.path,baseline,pen,'glyph.'+(first+item.glyphIndex))});
    for(const item of run.colorGlyphs??[])colorGlyphs.push({glyphIndex:first+item.glyphIndex,format:item.format});diagnostics.push(...run.diagnostics);pen=finite(pen+run.advance[1],'column pen');
   }
   const terminal=end===original.length;lines.push({id,paragraphId:pid,start:para.start+cursor,end:terminal?para.end:para.start+end,baseline,baselineAxis:'x'});
   const usedHyphen=line.markerAt===undefined?undefined:{sourceIndex:line.markerAt,replacement:marker,direction,glyphIndices:glyphs.map((g,i)=>i>=glyphStart&&g.cluster.start<=line.markerAt!&&g.cluster.end>line.markerAt!?i:-1).filter(i=>i>=0)};
   columns.push({id,start:para.start+cursor,end:terminal?para.end:para.start+end,contentEnd:para.start+end,baseline,advance:line.advance,glyphStart,glyphEnd:glyphs.length,...line.tabs.length?{tabs:line.tabs.map(t=>({...t,glyphIndex:t.glyphIndex+glyphStart}))}:{},...usedHyphen?{discretionaryHyphen:usedHyphen}:{}});cursor=end;done=terminal;
  }
 }
 check();const layout=graphics.validateTextLayoutData({...seed.layout,id:'shaped.vertical-text',text,layout:{engine:'unicode-bidi+harfrust+uax50',version:'0.3.18+0.15.0+16.0.0',clusterUnit:'utf16'},paragraphs,lines,glyphs});
 return {layout,glyphPaths,diagnostics,fontInstance:seed.fontInstance,...colorGlyphs.length?{colorGlyphs}:{},advance:[(columns.length-1)*columnAdvance*(writingMode==='vertical-rl'?-1:1),Math.max(0,...columns.map(c=>Math.abs(c.advance)))],columns:frozen(columns),ignoredRanges:frozen(ignored.sort((a,b)=>a.start-b.start)),flow:frozen({unicodeOrientation:'16.0.0',unicodeLineBreak:'16.0.0',measurements,policy:'greedy',segmentation:typeof process==='undefined'?'runtime Intl.Segmenter':process.version+' / ICU '+process.versions.icu})};
}
