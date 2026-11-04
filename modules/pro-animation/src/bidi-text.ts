// SPDX-License-Identifier: Apache-2.0
// Explicit-line layout over original paragraph bidi + existing HarfRust glyph geometry.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import type {PlacedTextTab} from './text-layout/tabs.ts';
import {discretionaryMarker,type PlacedDiscretionaryHyphen} from './text-layout/discretionary.ts';
import type {Diagnostic} from '../../../src/core/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {TextLayoutData} from '../../graphics-contracts/types.ts';
import {shapeBidiLine,type BidiLineOptions,type ShapedBidiLine} from './bidi-line.ts';
import type {createTextItemizer,TextAnalysis,TextItem} from './text-itemizer.ts';

export interface BidiTextOptions extends Omit<BidiLineOptions,'visibleSoftHyphen'> {
 /** Explicit visible marker at a used U+00AD soft break; does not guess spelling or language. */
 discretionaryHyphen?:string;
 /** Additional, strictly ordered UTF16 line ends inside a paragraph. No automatic wrapping. */
 softBreaks?:readonly number[];
 /** Explicit positive physical px. Defaults to 1.2 * fontSize; no OS metrics guessed. */
 lineHeight?:number;
}
export interface BidiTextLine {
 readonly tabs?:readonly PlacedTextTab[];readonly discretionaryHyphen?:PlacedDiscretionaryHyphen;
 readonly id:string;readonly paragraphId:string;readonly start:number;readonly end:number;readonly contentEnd:number;
 readonly baseline:number;readonly advance:number;readonly origin:readonly [number,number];
 readonly direction:'ltr'|'rtl';readonly glyphStart:number;readonly glyphEnd:number;
}
export interface ShapedBidiText extends Pick<ShapedBidiLine,'layout'|'glyphPaths'|'runs'|'fontInstances'|'diagnostics'> {
 analysis:TextAnalysis;lines:BidiTextLine[];
 ignoredRanges:{start:number;end:number;reason:'bidi-control'|'hard-break'}[];
}
type Itemizer=Pick<Awaited<ReturnType<typeof createTextItemizer>>,'analyze'|'analyzeLine'>;
type TextGraphics=Pick<typeof Graphics,'LIMITS'|'validateTextLayoutData'|'validatePathData'>;
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
function finite(value:number,name:string){if(typeof value!=='number'||!Number.isFinite(value))fail('E_PA_TEXT_BLOCK_PARAMETER',`${name} must be finite`);return value;}
const boundary=(text:string,i:number)=>Number.isSafeInteger(i)&&i>=0&&i<=text.length&&!(i>0&&i<text.length&&text.charCodeAt(i)>=0xdc00&&text.charCodeAt(i)<=0xdfff&&text.charCodeAt(i-1)>=0xd800&&text.charCodeAt(i-1)<=0xdbff);

/** Hard lines + caller-chosen soft lines. Resolve each line in the ORIGINAL paragraph,
 * never by analyzing its substring as an independent bidi paragraph.
 */
export async function shapeBidiText(graphics:TextGraphics,itemizer:Itemizer,text:string,p:BidiTextOptions):Promise<ShapedBidiText>{
 if(typeof text!=='string')fail('E_PA_TEXT_INPUT','Expected original Unicode text');
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['font','fontForRun','scriptForRun','fontSize','x','baseline','width','align','baseDirection','language','features','missingGlyph','signal','softBreaks','lineHeight','tabs','discretionaryHyphen'].includes(k)))fail('E_PA_TEXT_BLOCK_PARAMETER','Use documented explicit text-block options');
 if(!itemizer||typeof itemizer.analyzeLine!=='function')fail('E_PA_TEXT_LINE_KERNEL','An initialized contextual line itemizer is required');
 const {font,fontForRun,scriptForRun,signal,baseDirection,language,align,width,missingGlyph}=p,features=structuredClone(p.features??{}),tabs=structuredClone(p.tabs),hyphen=p.discretionaryHyphen===undefined?undefined:discretionaryMarker(p.discretionaryHyphen);
 const size=finite(p.fontSize??48,'fontSize'),x=finite(p.x??0,'x'),baseline=finite(p.baseline??size,'baseline'),height=finite(p.lineHeight??size*1.2,'lineHeight');
 if(size<=0||height<=0)fail('E_PA_TEXT_BLOCK_PARAMETER','fontSize and lineHeight must be positive');
 if(p.softBreaks!==undefined&&!Array.isArray(p.softBreaks))fail('E_PA_TEXT_BLOCK_BREAK','softBreaks must be an ordered array of original UTF16 boundaries');
 if((p.softBreaks?.length??0)>Math.max(0,text.length-1))fail('E_PA_TEXT_BLOCK_BREAK','More soft breaks than interior source boundaries');
 const soft=[...(p.softBreaks??[])];let previous=0;
 for(const end of soft){if(!boundary(text,end)||end<=previous||end>=text.length)fail('E_PA_TEXT_BLOCK_BREAK','softBreaks must be strictly increasing interior scalar boundaries');previous=end;}
 const check=()=>{if(signal?.aborted)fail('E_PA_TEXT_CANCELLED','Multiline shaping cancelled');};check();
 const analysis=await itemizer.analyze(text,{baseDirection,signal});check();
 const hard:{start:number;end:number}[]=[];
 for(let i=0;i<text.length;){const ch=text.codePointAt(i)!,n=ch>0xffff?2:1;if(analysis.flags[i]&4||[0x0b,0x0c,0x85,0x2028].includes(ch)){const end=ch===13&&text[i+1]==='\n'?i+2:i+n;hard.push({start:i,end});i=end;}else i+=n;}
 for(const at of soft)if(hard.some(h=>h.start<=at&&at<=h.end))fail('E_PA_TEXT_BLOCK_BREAK','A soft break cannot split or duplicate a hard-break boundary',{at});
 const paragraphs:TextLayoutData['paragraphs']=[];
 for(const raw of analysis.paragraphs){
  const last=paragraphs.at(-1);
  // Some bidi implementations expose CR and LF as separate B paragraphs. Keep
  // the canonical CRLF pair together without changing any resolved glyph levels.
  if(last&&text[last.end-1]==='\r'&&text[raw.start]==='\n'&&raw.end===raw.start+1)last.end=raw.end;
  else paragraphs.push({id:'paragraph.'+paragraphs.length,start:raw.start,end:raw.end,direction:raw.direction});
 }
 const trailing=hard.at(-1),needsEmpty=text.length===0||trailing?.end===text.length&&Boolean(analysis.flags[trailing.start]&4);
 if(needsEmpty)paragraphs.push({id:'paragraph.'+paragraphs.length,start:text.length,end:text.length,direction:baseDirection==='rtl'?'rtl':'ltr'});
 const ranges:{start:number;end:number;contentEnd:number}[]=[];let start=0,si=0;
 for(const h of hard){while(si<soft.length&&soft[si]<h.start){const end=soft[si++];ranges.push({start,end,contentEnd:end});start=end;}ranges.push({start,end:h.end,contentEnd:h.start});start=h.end;}
 while(si<soft.length){const end=soft[si++];ranges.push({start,end,contentEnd:end});start=end;}
 ranges.push({start,end:text.length,contentEnd:text.length});
 const layoutParts:TextLayoutData['lines']=[],lines:BidiTextLine[]=[],glyphs:TextLayoutData['glyphs']=[],glyphPaths:ShapedBidiLine['glyphPaths']=[],runs:ShapedBidiLine['runs']=[],fonts:TextLayoutData['fonts']=[],styles:TextLayoutData['styles']=[],fontInstances:ShapedBidiLine['fontInstances']=[],diagnostics:Diagnostic[]=structuredClone(analysis.diagnostics) as Diagnostic[],ignoredRanges:ShapedBidiText['ignoredRanges']=[];
 const identities=new Map<string,number>();let coordinates:TextLayoutData['coordinates']|undefined;
 for(const [index,range]of ranges.entries()){
  check();const para=paragraphs.find(par=>par.start<=range.start&&(range.start<par.end||range.start===par.start&&par.start===par.end))??(range.start===text.length?paragraphs.at(-1):undefined);
  if(!para||range.end>para.end)fail('E_PA_TEXT_BLOCK_RANGE','Line does not lie in one canonical bidi paragraph',range);
  const runOffset=runs.length,globalItem=(item:TextItem):TextItem=>({...item,paragraph:paragraphs.indexOf(para),start:item.start+range.start,end:item.end+range.start,visualIndex:runOffset+item.visualIndex});
  const body=text.slice(range.start,range.contentEnd),localBaseline=finite(baseline+index*height,'line baseline');
  // Bidi is paragraph-local by definition. Avoid rescanning unrelated paragraphs
  // for every line, while keeping the ENTIRE parent (including future controls).
  const paragraphText=text.slice(para.start,para.end),contextual={analyze:async()=>itemizer.analyzeLine(paragraphText,{start:range.start-para.start,end:range.contentEnd-para.start},{baseDirection:para.direction,signal})};
  let line:ShapedBidiLine;
  try{line=await shapeBidiLine(graphics,contextual,body,{font,...fontForRun?{fontForRun:item=>fontForRun(globalItem(item))}:{},...scriptForRun?{scriptForRun:item=>scriptForRun(globalItem(item))}:{},fontSize:size,x,baseline:localBaseline,width,align,baseDirection:para.direction,language,features,missingGlyph,signal,tabs,visibleSoftHyphen:hyphen!==undefined&&soft.includes(range.end)&&text[range.end-1]==='\u00ad'?hyphen:undefined});}
  catch(error){check();if(error instanceof EngineError&&error.code==='E_PA_TEXT_LINE_KERNEL')throw error;throw new EngineError('E_PA_TEXT_BLOCK_SHAPE','Shaping failed for this original-source line',{details:{line:index,sourceRange:{start:range.start,end:range.contentEnd},original:diagnostic(error)}});}check();
  if(index===0){
   // Delegate count/layout limits to the existing contract before shaping the
   // remaining lines. No duplicated paragraph/line caps or silent truncation.
   const preview=ranges.map((r,i)=>{const parent=paragraphs.find(par=>par.start<=r.start&&(r.start<par.end||r.start===par.start&&par.start===par.end))??(r.start===text.length?paragraphs.at(-1):undefined);if(!parent||r.end>parent.end)fail('E_PA_TEXT_BLOCK_RANGE','Line crosses the existing paragraph contract',r);return {id:'line.'+i,paragraphId:parent.id,start:r.start,end:r.end,baseline:finite(baseline+i*height,'line baseline')};});
   graphics.validateTextLayoutData({...line.layout,text,paragraphs,lines:preview,glyphs:[]});
  }
  if(coordinates&&JSON.stringify(coordinates)!==JSON.stringify(line.layout.coordinates))fail('E_PA_TEXT_BLOCK_SPACE','All lines must share the existing coordinates');coordinates??=line.layout.coordinates;
  const fontMap=new Map<string,number>();
  for(const instance of line.fontInstances){
   const key=JSON.stringify([Object.entries(instance.source).sort(),instance.faceIndex,Object.entries(instance.variations).sort(),instance.normalizedCoordinates]);let id=identities.get(key);
   if(id===undefined){id=fonts.length;identities.set(key,id);const old=line.layout.fonts.find(f=>f.id===instance.fontId)!,style=line.layout.styles.find(s=>s.fontId===instance.fontId)!;fonts.push({...old,id:'font.'+id});styles.push({...style,id:'style.'+id,fontId:'font.'+id});fontInstances.push({...instance,fontId:'font.'+id});}fontMap.set(instance.fontId,id);
  }
  const lineId='line.'+index,glyphStart=glyphs.length;
  for(const g of line.layout.glyphs){const style=line.layout.styles.find(s=>s.id===g.styleId)!;glyphs.push({...g,id:'glyph.'+glyphs.length,lineId,styleId:'style.'+fontMap.get(style.fontId),cluster:{start:g.cluster.start+range.start,end:g.cluster.end+range.start}});}
  if(glyphs.length>graphics.LIMITS.glyphs)fail('E_GRAPHICS_LIMIT','Multiline glyphs exceed the existing canonical budget');
  for(const path of line.glyphPaths)glyphPaths.push({glyphIndex:glyphStart+path.glyphIndex,path:graphics.validatePathData({...path.path,id:'glyph.'+(glyphStart+path.glyphIndex)})});
  for(const run of line.runs)runs.push({...run,...run.replacement?{replacement:{...run.replacement,sourceIndex:run.replacement.sourceIndex+range.start}}:{},item:globalItem(run.item),fontId:'font.'+fontMap.get(run.fontId),sourceUnits:Object.freeze(run.sourceUnits.map(i=>i+range.start)),globalGlyphIndices:Object.freeze(run.globalGlyphIndices.map(i=>i+glyphStart))});
  for(const d of line.diagnostics)diagnostics.push({...d,details:{sourceRange:{start:range.start,end:range.contentEnd},original:d.details??null}});
  ignoredRanges.push(...line.ignoredRanges.map(r=>({...r,start:r.start+range.start,end:r.end+range.start})));if(range.contentEnd<range.end)ignoredRanges.push({start:range.contentEnd,end:range.end,reason:'hard-break'});
  layoutParts.push({id:lineId,paragraphId:para.id,start:range.start,end:range.end,baseline:localBaseline});
  lines.push({id:lineId,paragraphId:para.id,...range,baseline:localBaseline,advance:line.advance,origin:line.origin,direction:para.direction,glyphStart,glyphEnd:glyphs.length,...line.discretionaryHyphen?{discretionaryHyphen:{...line.discretionaryHyphen,sourceIndex:line.discretionaryHyphen.sourceIndex+range.start,glyphIndices:line.discretionaryHyphen.glyphIndices.map(i=>i+glyphStart)}}:{},...line.tabs?{tabs:line.tabs.map(t=>({...t,sourceIndex:t.sourceIndex+range.start,glyphIndex:t.glyphIndex+glyphStart}))}:{}});
 }
 const layout=graphics.validateTextLayoutData({schema:'frameweave.text-layout',version:1,id:'shaped.bidi-text',coordinates:coordinates!,text,layout:{engine:'unicode-bidi+harfrust',version:'0.3.18+0.15.0',clusterUnit:'utf16'},fonts,styles,paragraphs,lines:layoutParts,glyphs});check();
 return {layout,glyphPaths,runs,fontInstances,analysis,lines,diagnostics,ignoredRanges};
}
