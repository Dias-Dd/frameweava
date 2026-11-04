// SPDX-License-Identifier: Apache-2.0
// Layout/mapping adapter: original Unicode itemization + existing verified HarfRust glyph geometry.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import {discretionaryMarker,type PlacedDiscretionaryHyphen} from './text-layout/discretionary.ts';
import {placeLineTabs,textTabOptions,type TextTabOptions,type PlacedTextTab} from './text-layout/tabs.ts';
import type {Diagnostic} from '../../../src/core/types.ts';
import type {PathData,TextLayoutData} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {createFontShaper,ShapedRun} from './font-shaping.ts';
import type {createTextItemizer,TextAnalysis,TextItem} from './text-itemizer.ts';
export type BidiFont=Pick<Awaited<ReturnType<typeof createFontShaper>>,'shapeRun'>;
export interface BidiLineOptions {
 /** Explicit verified default font, also the canonical style/resource for an empty line. */
 font:BidiFont;fontForRun?:(item:TextItem)=>BidiFont;scriptForRun?:(item:TextItem)=>string;
 fontSize?:number;x?:number;baseline?:number;width?:number;align?:'left'|'right'|'center'|'start'|'end';
 baseDirection?:'auto'|'ltr'|'rtl';language?:string;features?:Readonly<Record<string,number>>;
 missingGlyph?:'error'|'notdef';signal?:AbortSignal;tabs?:TextTabOptions;visibleSoftHyphen?:string;
}
export interface BidiShapedRun {
 readonly item:TextItem;readonly script:string;readonly text:string;
 /** Original UTF16 source index for every UTF16 unit of the clean shaping string. */
 readonly sourceUnits:readonly number[];readonly replacement?:{readonly sourceIndex:number;readonly original:"\u00ad";readonly value:string};readonly fontId:string;readonly globalGlyphIndices:readonly number[];
 /** Clean-run clusters; geometry lives only in the existing canonical layout/glyphPaths. */
 readonly localClusters:readonly Readonly<{start:number;end:number}>[];
}
export interface ShapedBidiLine {
 tabs?:readonly PlacedTextTab[];discretionaryHyphen?:PlacedDiscretionaryHyphen;
 layout:TextLayoutData;glyphPaths:ShapedRun['glyphPaths'];analysis:TextAnalysis;runs:BidiShapedRun[];
 fontInstances:({fontId:string}&ShapedRun['fontInstance'])[];diagnostics:Diagnostic[];
 advance:number;origin:readonly [number,number];ignoredRanges:{start:number;end:number;reason:'bidi-control'}[];
}
type LineGraphics=Pick<typeof Graphics,'LIMITS'|'validateTextLayoutData'|'validatePathData'>;
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_TEXT_LINE_PARAMETER',`${name} must be finite`);return n;}
function font(value:unknown):asserts value is BidiFont{if(!value||typeof value!=='object'||typeof Reflect.get(value,'shapeRun')!=='function'||'then' in value)fail('E_PA_TEXT_LINE_FONT','Supply an already initialized, explicit font shaper');}
function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b);}
function translated(graphics:LineGraphics,path:PathData,dx:number,dy:number,id:string):PathData{
 const point=(p:{id:string;x:number;y:number})=>({...p,x:finite(p.x+dx,'glyph x'),y:finite(p.y+dy,'glyph y')});
 return graphics.validatePathData({...path,id,commands:path.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:point(c.control),point:point(c.point)}:c.op==='C'?{...c,control1:point(c.control1),control2:point(c.control2),point:point(c.point)}:{...c,point:point(c.point)})});
}
/** One natural horizontal line. No auto wrap/fallback/OS font access, new schema, timeline or renderer. */
export async function shapeBidiLine(graphics:LineGraphics,itemizer:Pick<Awaited<ReturnType<typeof createTextItemizer>>,'analyze'>,text:string,p:BidiLineOptions):Promise<ShapedBidiLine>{
 if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['font','fontForRun','scriptForRun','fontSize','x','baseline','width','align','baseDirection','language','features','missingGlyph','signal','tabs','visibleSoftHyphen'].includes(k)))fail('E_PA_TEXT_LINE_PARAMETER','Only documented line options are accepted');
 font(p.font);if(p.fontForRun!==undefined&&typeof p.fontForRun!=='function'||p.scriptForRun!==undefined&&typeof p.scriptForRun!=='function')fail('E_PA_TEXT_LINE_PARAMETER','Font/script selectors must be synchronous functions');
 const {font:defaultFont,fontForRun,scriptForRun,signal,baseDirection:requestedDirection}=p;
 const size=finite(p.fontSize??48,'fontSize'),x=finite(p.x??0,'x'),baseline=finite(p.baseline??size,'baseline'),width=p.width===undefined?undefined:finite(p.width,'width'),align=p.align??'start',language=p.language??'und',features=structuredClone(p.features??{}),missingGlyph=p.missingGlyph??'error';
 if(size<=0||width!==undefined&&width<0||!['left','right','center','start','end'].includes(align))fail('E_PA_TEXT_LINE_PARAMETER','Positive font size, nonnegative width and known alignment required');
 const tabOptions=p.tabs===undefined?undefined:textTabOptions(p.tabs,size),marker=p.visibleSoftHyphen===undefined?undefined:discretionaryMarker(p.visibleSoftHyphen),markerAt=marker===undefined?-1:text.length-1;if(marker!==undefined&&text[markerAt]!=='\u00ad')fail('E_PA_TEXT_DISCRETIONARY','Visible soft hyphen requires the original line to end in U+00AD');
 const check=()=>{if(signal?.aborted)fail('E_PA_TEXT_CANCELLED','Bidi line shaping cancelled');};check();
 const analysis=await itemizer.analyze(text,{baseDirection:requestedDirection,signal});check();
 if(analysis.paragraphs.length>1||analysis.flags.some(flag=>flag&4)||/[\u000b\u000c\u0085\u2028\r\n]/u.test(text))fail('E_PA_TEXT_LINE_RANGE','This API shapes one natural line; split paragraphs/explicit hard lines before calling it');
 if(text.includes('\t')&&!tabOptions)fail('E_PA_TEXT_LINE_TAB','Explicit tab-stop layout is not supplied by this natural-line API');
 const baseDirection=analysis.paragraphs[0]?.direction??(requestedDirection==='rtl'?'rtl':'ltr'),seed=await defaultFont.shapeRun('',{script:'Zyyy',direction:baseDirection,fontSize:size,baseline:0,language,features,missingGlyph});check();
 const coordinates=seed.layout.coordinates;if(coordinates.unit!=='px')fail('E_PA_TEXT_LINE_SPACE','Line layout uses physical pixels');
 const fonts:TextLayoutData['fonts']=[],styles:TextLayoutData['styles']=[],instances:ShapedBidiLine['fontInstances']=[],keys=new Map<string,number>();
 const register=(run:ShapedRun)=>{
  const valid=graphics.validateTextLayoutData(run.layout);
  if(!same(valid.coordinates,coordinates)||valid.fonts.length!==1||valid.styles.length!==1||valid.styles[0].fontSize!==size||valid.layout.engine!=='harfrust'||valid.layout.version!=='0.15.0')fail('E_PA_TEXT_LINE_FONT','Use compatible existing single-instance HarfRust shapers with identical coordinates');
  if(!same(valid.fonts[0].source,run.fontInstance.source)||valid.fonts[0].faceIndex!==run.fontInstance.faceIndex)fail('E_PA_TEXT_LINE_FONT','Font instance provenance differs from layout');
  const instance=structuredClone(run.fontInstance),key=JSON.stringify([Object.entries(instance.source).sort(),instance.faceIndex,Object.entries(instance.variations).sort(),instance.normalizedCoordinates]);let index=keys.get(key);
  if(index===undefined){index=fonts.length;keys.set(key,index);const id='font.'+index;fonts.push({...valid.fonts[0],id});styles.push({...valid.styles[0],id:'style.'+index,fontId:id});instances.push({fontId:id,...instance});}return index;
 };
 register(seed);const diagnostics:Diagnostic[]=structuredClone(analysis.diagnostics) as Diagnostic[];diagnostics.push(...structuredClone(seed.diagnostics));
 const pending:{item:TextItem;script:string;text:string;sourceUnits:number[];raw:ShapedRun;font:BidiFont;fontIndex:number;advance:number;marker?:true}[]=[];let advance=0;
 for(const item of analysis.runs){
  check();const sourceUnits:number[]=[];let clean='';for(let i=item.start;i<item.end;i++)if(!(analysis.flags[i]&2)&&i!==markerAt){clean+=text[i];sourceUnits.push(i);}if(!clean)continue;
  if(item.splitsGrapheme)fail('E_PA_TEXT_LINE_GRAPHEME','Bidi boundary splits a grapheme; no incomplete cluster is sent to the shaper',{start:item.start,end:item.end});
  const script=scriptForRun?.(item)??item.script;if(!script||!/^[A-Za-z]{4}$/.test(script))fail('E_PA_TEXT_LINE_SCRIPT','Choose an explicit script for an unresolved item',{start:item.start,end:item.end,candidates:item.scriptCandidates});
  if(script!==item.script)diagnostics.push({code:'W_PA_TEXT_SCRIPT_SELECTED',severity:'warning',message:'Caller explicitly selected the shaping script',details:{start:item.start,end:item.end,script,candidates:item.scriptCandidates}});
  const selected=fontForRun?.(item)??defaultFont;font(selected);let raw:ShapedRun;const shapingText=tabOptions?clean.replaceAll('\t',' '):clean;
  try{raw=await selected.shapeRun(shapingText,{script,direction:item.direction,fontSize:size,x:0,baseline:0,language,features,missingGlyph});}catch(error){check();throw new EngineError('E_PA_TEXT_LINE_SHAPE','Font shaping failed for the specified original source range',{details:{sourceRange:{start:item.start,end:item.end},script,direction:item.direction,original:diagnostic(error)}});}check();
  const fontIndex=register(raw);if(raw.layout.text!==shapingText||raw.layout.glyphs.some(g=>g.advanceY!==0))fail('E_PA_TEXT_LINE_FONT','Expected the original clean horizontal shaping string');
  const runAdvance=finite(raw.layout.glyphs.reduce((a,g)=>a+g.advanceX,0),'run advance');if(runAdvance<0)fail('E_PA_TEXT_LINE_ADVANCE','Negative net run advance needs an explicit alternate layout policy');
  advance=finite(advance+runAdvance,'line advance');pending.push({item,script,text:clean,sourceUnits,raw,font:selected,fontIndex,advance:runAdvance});
 }
 if(marker!==undefined){
  let previous=markerAt-1;while(previous>=0&&((analysis.flags[previous]&3)!==0||text[previous]==='\u00ad'))previous--;const index=pending.findIndex(p=>p.sourceUnits.includes(previous));if(index<0)fail('E_PA_TEXT_DISCRETIONARY','No preceding shaped run can own this break marker');const owner=pending[index];let raw:ShapedRun;try{raw=await owner.font.shapeRun(marker,{script:owner.script,direction:owner.item.direction,fontSize:size,x:0,baseline:0,language,features,missingGlyph:'error'});}catch(error){check();throw new EngineError('E_PA_TEXT_DISCRETIONARY','The selected font cannot provide the explicit visible marker',{details:{sourceIndex:markerAt,original:diagnostic(error)}});}check();if(raw.layout.text!==marker||!raw.glyphPaths.length||raw.layout.glyphs.some(g=>g.advanceY!==0))fail('E_PA_TEXT_DISCRETIONARY','A real visible horizontal marker outline is required');const markerAdvance=finite(raw.layout.glyphs.reduce((a,g)=>a+g.advanceX,0),'marker advance');if(markerAdvance<0)fail('E_PA_TEXT_DISCRETIONARY','Negative marker advance is unsupported');const part={item:{...owner.item,start:markerAt,end:markerAt+1},script:owner.script,text:marker,sourceUnits:Array(marker.length).fill(markerAt),raw,font:owner.font,fontIndex:register(raw),advance:markerAdvance,marker:true as const};pending.splice(index+(owner.item.direction==='ltr'?1:0),0,part);advance=finite(advance+markerAdvance,'line advance');
 }
 const target=align==='start'?(baseDirection==='rtl'?'right':'left'):align==='end'?(baseDirection==='rtl'?'left':'right'):align,box=width??advance,left=finite(x+(target==='right'?box-advance:target==='center'?(box-advance)/2:0),'line origin');
 if(width!==undefined&&advance>width&&!(tabOptions&&text.includes('\t')))diagnostics.push({code:'W_PA_TEXT_LINE_OVERFLOW',severity:'warning',message:'Natural advance exceeds the explicit box; glyph paths are not clipped',details:{advance,width}});
 const glyphs:TextLayoutData['glyphs']=[],paths:ShapedRun['glyphPaths']=[],runs:BidiShapedRun[]=[];let pen=left,placedHyphen:PlacedDiscretionaryHyphen|undefined;
 for(const part of pending){
  check();const indices:number[]=[],local=graphics.validateTextLayoutData({...part.raw.layout,glyphs:part.raw.layout.glyphs.map(g=>({...g,x:finite(g.x+pen,'glyph x'),y:finite(g.y+baseline,'glyph y')})),lines:part.raw.layout.lines.map(l=>({...l,baseline}))});
  const first=glyphs.length;
  for(const g of local.glyphs){if(g.cluster.start<0||g.cluster.end>part.sourceUnits.length||g.cluster.start>=g.cluster.end)fail('E_PA_TEXT_LINE_MAPPING','Invalid shaper cluster');const start=part.sourceUnits[g.cluster.start],end=part.sourceUnits[g.cluster.end-1]+1;indices.push(glyphs.length);glyphs.push({...g,id:'glyph.'+glyphs.length,lineId:'line',styleId:'style.'+part.fontIndex,cluster:{start,end}});}
  if(glyphs.length>graphics.LIMITS.glyphs)fail('E_GRAPHICS_LIMIT','Bidi line exceeds the existing canonical glyph budget');
  const localPaths=part.raw.glyphPaths.map(p=>({glyphIndex:p.glyphIndex,path:translated(graphics,p.path,pen,baseline,'glyph.'+(first+p.glyphIndex))}));for(const p of localPaths)paths.push({glyphIndex:first+p.glyphIndex,path:p.path});
  if(part.marker)placedHyphen={sourceIndex:markerAt,replacement:marker!,glyphIndices:Object.freeze([...indices]),direction:part.item.direction};
  runs.push({item:part.item,script:part.script,text:part.text,...part.marker?{replacement:{sourceIndex:markerAt,original:'\u00ad' as const,value:marker!}}:{},sourceUnits:Object.freeze(part.sourceUnits),fontId:'font.'+part.fontIndex,globalGlyphIndices:Object.freeze(indices),localClusters:Object.freeze(local.glyphs.map(g=>Object.freeze({...g.cluster})))});
  for(const d of part.raw.diagnostics)diagnostics.push({...structuredClone(d),details:{sourceRange:{start:part.item.start,end:part.item.end},original:d.details??null}});
  pen=finite(pen+part.advance,'line pen');
 }
 const ignoredRanges:ShapedBidiLine['ignoredRanges']=[];for(let i=0;i<text.length;){if(!(analysis.flags[i]&2)){i++;continue;}const start=i;while(i<text.length&&(analysis.flags[i]&2))i++;ignoredRanges.push({start,end:i,reason:'bidi-control'});}
 const layout=graphics.validateTextLayoutData({schema:'frameweave.text-layout',version:1,id:'shaped.bidi-line',coordinates,text,layout:{engine:'unicode-bidi+harfrust',version:'0.3.18+0.15.0',clusterUnit:'utf16'},fonts,styles,paragraphs:text.length?[{id:'paragraph',start:0,end:text.length,direction:baseDirection}]:[],lines:text.length?[{id:'line',paragraphId:'paragraph',start:0,end:text.length,baseline}]:[],glyphs});
 check();const result:ShapedBidiLine={layout,glyphPaths:paths,analysis,runs,fontInstances:instances,diagnostics,advance,origin:[left,baseline],ignoredRanges,...placedHyphen?{discretionaryHyphen:placedHyphen}:{}};return tabOptions&&text.includes('\t')?placeLineTabs(graphics,result,tabOptions,{x,width,align,size}):result;
}
