// SPDX-License-Identifier: Apache-2.0 AND Unicode-3.0
// Authoring/math only. Original bidi/shaping, canonical data and Native rendering are reused.
import {EngineError} from '../../../../src/core/errors.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import {shapeBidiText,type BidiTextOptions,type ShapedBidiText} from '../bidi-text.ts';
import {shapeBidiLine,type BidiFont,type ShapedBidiLine} from '../bidi-line.ts';
import type {TextItem} from '../text-itemizer.ts';
import type {ParagraphItemizer,ParagraphFlow} from '../text-layout/layout.ts';
import {textGraphemes,textWords,unicodeLineBreaks} from '../text-layout/breaks.ts';
import {sourceText,finite,frozen} from '../text-layout/common.ts';
import {createParagraphIndex} from '../text-layout/queries.ts';
import {optimizeParagraphBreaks} from './breaks.ts';
import {kashidaOpportunities,shapeKashidaRun,type KashidaInsertion} from './kashida.ts';
import {compositionSpacing,permittedLineBoundary,paragraphLine,summarizeLineSpacing,fitComposedLine,type CompositionSpacing,type ComposedLineFit} from './policies.ts';
export interface ParagraphCompositionOptions extends Omit<BidiTextOptions,'width'|'align'|'tabs'> {
 itemizer:ParagraphItemizer;width:number;align?:'left'|'right'|'center'|'start'|'end'|'justify';justifyLastLine?:boolean;
 firstLineIndent?:number;restIndent?:number;spacing?:CompositionSpacing;
 overflow?:'error'|'allow'|'grapheme';locale?:string;
 /** Discrete real font-shaped candidates, not an artistic capacity ceiling. Caller may supply any counts. */
 arabic?:{kashidaCounts?:readonly number[];penaltyPerInsertion?:number};
 linePenalty?:number;fitnessPenalty?:number;consecutiveHyphenPenalty?:number;hyphenPenalty?:number;emergencyPenalty?:number;
 minimumLastLineFill?:number;shortLastLinePenalty?:number;
 /** Resource controls, separate from creative parameters. Omission does not cap total text/lines. */
 budget?:{maxMeasurements?:number;cacheEntries?:number};
}
type Elongation={sourceRange:{start:number;end:number};shapingText:string;insertions:readonly KashidaInsertion[];font:unknown};
export interface ComposedParagraph extends ShapedBidiText {
 flow:ParagraphFlow;
 composition:{algorithm:'measured-global-dp/1';cost:number;measurements:number;cacheHits:number;measuredEdges:number;spacing:CompositionSpacing;elongations:readonly Elongation[];lines:readonly {id:string;start:number;end:number;width:number;indent:number;natural:number;logicalWidth:number;advance:number;overhang:number;controls:Readonly<Record<string,number>>;residual:number;last:boolean;ragged:boolean;fitStatus:'exact'|'ragged'|'residual';kashidas:readonly KashidaInsertion[]}[]};
}
interface Choice {start:number;end:number;last:boolean;width:number;indent:number;fit:ComposedLineFit;plan:readonly KashidaInsertion[];signature:string;cost:number}
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_COMPOSE_PARAMETER',message,{details});};
/** One call performs global line selection, real optional elongation and joint spacing.
 * It never draws pixels, changes the time evaluator, discovers fonts or fetches data. */
export async function composeParagraph(text:string,options:ParagraphCompositionOptions):Promise<ComposedParagraph>{
 sourceText(text);const {font,fontForRun,scriptForRun,itemizer,signal,...raw}=options,p=structuredClone(raw),check=()=>signal?.throwIfAborted();check();
 const width=finite(p.width,'paragraph width'),size=finite(p.fontSize??48,'fontSize'),height=finite(p.lineHeight??size*1.2,'lineHeight'),x=finite(p.x??0,'x'),baseline=finite(p.baseline??size,'baseline'),firstIndent=finite(p.firstLineIndent??0,'firstLineIndent'),restIndent=finite(p.restIndent??0,'restIndent'),align=p.align??'justify',overflow=p.overflow??'grapheme',spacing=compositionSpacing(p.spacing);
 if(width<=0||size<=0||height<=0||width-firstIndent<=0||width-restIndent<=0||!['left','right','center','start','end','justify'].includes(align)||!['error','allow','grapheme'].includes(overflow)||typeof font?.shapeRun!=='function'||typeof itemizer?.analyzeLine!=='function')fail('Positive physical paragraph geometry, known policies and existing font/itemizer required');
 if(text.includes('\t'))fail('Use the existing explicit tab-stop compositor for tabbed text; joint re-spacing cannot silently move tab anchors');
 const maxMeasurements=p.budget?.maxMeasurements??Infinity,cacheEntries=p.budget?.cacheEntries??256;if(maxMeasurements!==Infinity&&(!Number.isSafeInteger(maxMeasurements)||maxMeasurements<0)||!Number.isSafeInteger(cacheEntries)||cacheEntries<0)fail('Nonnegative caller resource budgets required');
 const kCounts=[...new Set([0,...p.arabic?.kashidaCounts??[]])].sort((a,b)=>a-b),kPenalty=p.arabic?.penaltyPerInsertion??.05,hyphenPenalty=p.hyphenPenalty??5,emergencyPenalty=p.emergencyPenalty??10000,hyphen=p.discretionaryHyphen??'-',lastFill=p.minimumLastLineFill??.25,shortLastPenalty=p.shortLastLinePenalty??8;
 if(kCounts.some(n=>!Number.isSafeInteger(n)||n<0)||![kPenalty,hyphenPenalty,emergencyPenalty,shortLastPenalty].every(v=>Number.isFinite(v)&&v>=0)||!Number.isFinite(lastFill)||lastFill<0||lastFill>1)fail('Unsigned elongation counts, finite nonnegative costs and last-line fill in [0,1] required');
 const base:BidiTextOptions={font,fontForRun,scriptForRun,fontSize:size,x:0,baseline:0,lineHeight:height,align:'left',baseDirection:p.baseDirection,language:p.language,features:p.features,missingGlyph:p.missingGlyph,signal,softBreaks:p.softBreaks,discretionaryHyphen:hyphen};
 const natural=await shapeBidiText(graphics,itemizer,text,base),graphemes=textGraphemes(text,{locale:p.locale}),words=textWords(text,{locale:p.locale}),edges=new Set([0,...graphemes.map(g=>g.end)]),uaxBreaks=new Set(unicodeLineBreaks(text).map(v=>v.position)),cache=new Map<string,Choice>();check();
 let measurements=0,cacheHits=0,cost=0,measuredEdges=0;const selected:Choice[]=[];
 const fontSelector=(plan:readonly KashidaInsertion[],collected?:Elongation[])=>(item:TextItem):BidiFont=>{
  const original=fontForRun?.(item)??font,inside=plan.filter(v=>item.start<v.at&&v.at<item.end);if(!inside.length)return original;
  const sourceUnits:number[]=[];let expected='';for(let i=item.start;i<item.end;i++)if(!/\p{Bidi_Control}/u.test(text[i])){expected+=text[i];sourceUnits.push(i);}
  return {async shapeRun(clean,shape){
   // The existing line service can separately request a visible discretionary marker.
   let units=sourceUnits;if(expected!==clean){if(expected.endsWith('\u00ad')&&clean===expected.slice(0,-1))units=sourceUnits.slice(0,-1);else return original.shapeRun(clean,shape);}
   const local=inside.map(v=>({at:units.indexOf(v.at),count:v.count}));if(local.some(v=>v.at<0))fail('Elongation source boundary does not belong to the actual clean run');
   const result=await shapeKashidaRun(original,clean,shape,local,signal);collected?.push({sourceRange:{start:item.start,end:item.end},shapingText:result.elongation.shapingText,insertions:inside,font:result.fontInstance});return result;
  }};
 };
 const signature=(source:ShapedBidiText,start:number,lineId?:string)=>JSON.stringify(source.layout.glyphs.filter(g=>!lineId||g.lineId===lineId).map(g=>[g.glyphId,g.cluster.start-start,g.cluster.end-start,g.x,g.advanceX,g.advanceY]));
 for(const segment of natural.lines){
  const para=natural.layout.paragraphs.find(v=>v.id===segment.paragraphId)!,paragraphIndex=natural.layout.paragraphs.indexOf(para),segmentEnd=segment.contentEnd,segmentStart=segment.start;
  const measure=async(start:number,end:number,last:boolean):Promise<Choice>=>{
   check();const indent=start===para.start?firstIndent:restIndent,available=width-indent,key=start+':'+end+':'+Number(last),cached=cache.get(key);if(cached){cache.delete(key);cache.set(key,cached);cacheHits++;return cached;}
   const globalItem=(item:TextItem):TextItem=>({...item,paragraph:paragraphIndex,start:item.start+start,end:item.end+start}),contextual={analyze:()=>itemizer.analyzeLine(text.slice(para.start,para.end),{start:start-para.start,end:end-para.start},{baseDirection:para.direction,signal})};
   const shape=async(plan:readonly KashidaInsertion[])=>{
    if(measurements>=maxMeasurements)throw new EngineError('E_PA_COMPOSE_BUDGET','Caller measurement budget exhausted; no partial paragraph was published',{details:{maxMeasurements,measurements,start,end}});measurements++;check();
    const line=await shapeBidiLine(graphics,contextual,text.slice(start,end),{font,fontForRun:item=>fontSelector(plan)(globalItem(item)),scriptForRun:scriptForRun?item=>scriptForRun(globalItem(item)):undefined,fontSize:size,x:0,baseline:0,align:'left',baseDirection:para.direction,language:p.language,features:p.features,missingGlyph:p.missingGlyph,signal,visibleSoftHyphen:text[end-1]==='\u00ad'&&(end<segmentEnd||p.softBreaks?.includes(end))?hyphen:undefined});check();return line;
   };
   const plain=await shape([]),legal:number[]=[];
   if(kCounts.length>1)for(const run of plain.runs)if(run.script==='Arab'){
    const identity=plain.fontInstances.find(f=>f.fontId===run.fontId)!,runLayout=graphics.validateTextLayoutData({...plain.layout,text:run.text,paragraphs:[{id:'paragraph',start:0,end:run.text.length,direction:run.item.direction}],lines:[{id:'line',paragraphId:'paragraph',start:0,end:run.text.length,baseline:0}],glyphs:run.globalGlyphIndices.map((i,n)=>({...plain.layout.glyphs[i],cluster:run.localClusters[n]}))});
    for(const at of kashidaOpportunities({layout:runLayout,glyphPaths:[],diagnostics:[],fontInstance:identity}))legal.push(start+run.sourceUnits[at]);
   }
   legal.sort((a,b)=>a-b);let best:Choice|undefined;
   for(const count of kCounts){if(count&&!legal.length)continue;if(count+end-start>graphics.LIMITS.string)throw new EngineError('E_GRAPHICS_LIMIT','Actual elongated line exceeds the existing canonical source budget');const allocations=new Map<number,number>();for(let n=0;n<count;n++){const at=legal[n%legal.length];allocations.set(at,(allocations.get(at)??0)+1);}const plan=[...allocations].map(([at,count])=>({at,count})),line=count?await shape(plan):plain,source=paragraphLine(line),summary=summarizeLineSpacing(source,spacing,size,uaxBreaks,start),justify=align==='justify'&&(!last||p.justifyLastLine===true),fit=fitComposedLine(summary,available,size,spacing,{justify,allowResidual:overflow==='allow',last});
    const shortCost=last&&start>segmentStart&&fit.ragged&&lastFill>0?shortLastPenalty*(Math.max(0,lastFill-fit.logicalWidth/available)/lastFill)**2:0;
    const proposal:Choice={start,end,last,width:available,indent,fit,plan,signature:signature(source,0),cost:fit.cost+count*kPenalty+shortCost};if(!best||proposal.fit.feasible&&!best.fit.feasible||proposal.fit.feasible===best.fit.feasible&&proposal.cost<best.cost)best=proposal;
   }
   const result=best!;if(cacheEntries){cache.set(key,result);if(cache.size>cacheEntries)cache.delete(cache.keys().next().value!);}return result;
  };
  if(segmentStart===segmentEnd){selected.push(await measure(segmentStart,segmentEnd,true));continue;}
  const candidates=(emergency:boolean)=>{const points=[...new Set([segmentStart,...uaxBreaks,...(emergency?edges:[])])].filter(v=>v>=segmentStart&&v<segmentEnd&&edges.has(v)&&(v===segmentStart||permittedLineBoundary(text,v,spacing)));points.push(segmentEnd);return points.sort((a,b)=>a-b);};
  const search=(points:readonly number[])=>optimizeParagraphBreaks(points,async(start,end,last)=>{const c=await measure(start,end,last);return {cost:c.cost+(!uaxBreaks.has(end)&&!last?emergencyPenalty:0)+(text[end-1]==='\u00ad'&&!last?hyphenPenalty:0),fitness:c.fit.fit.fitness,hyphenated:text[end-1]==='\u00ad'&&!last,feasible:c.fit.feasible};},{linePenalty:p.linePenalty,fitnessPenalty:p.fitnessPenalty,consecutiveHyphenPenalty:p.consecutiveHyphenPenalty,signal});
  // A constrained grapheme emergency is a fallback policy, not permission to split
  // every word in the normal candidate graph. Both paths use the same global DP.
  let result:Awaited<ReturnType<typeof search>>;try{result=await search(candidates(false));}catch(error){if(!(error instanceof EngineError)||error.code!=='E_PA_COMPOSE_UNBREAKABLE'||overflow!=='grapheme')throw error;result=await search(candidates(true));}
  cost+=result.cost;measuredEdges+=result.measuredEdges;let start=segmentStart;for(const end of result.breaks){selected.push(await measure(start,end,end===segmentEnd));start=end;}
 }
 const soft=new Set(p.softBreaks??[]);for(const c of selected)if(!c.last)soft.add(c.end);const plans=selected.flatMap(c=>c.plan),elongations:Elongation[]=[];
 const final=await shapeBidiText(graphics,itemizer,text,{...base,x:0,baseline,lineHeight:height,softBreaks:[...soft].sort((a,b)=>a-b),fontForRun:fontSelector(plans,elongations)});check();
 const index=createParagraphIndex(final),source=structuredClone(index.source),paths=new Map(source.glyphPaths.map(p=>[p.glyphIndex,p.path])),lineRecords:ComposedParagraph['composition']['lines'][number][]=[];
 if(source.lines.length!==selected.length)throw new EngineError('E_PA_COMPOSE_UNSTABLE','Final original-source line structure differs from the measured complete plan');
 for(const [n,line]of source.lines.entries()){
  const chosen=selected[n];if(line.start!==chosen.start||line.contentEnd!==chosen.end||signature(source,line.start,line.id)!==chosen.signature)throw new EngineError('E_PA_COMPOSE_UNSTABLE','Font/script callbacks changed the measured original glyphs or advances',{details:{line:line.id,start:line.start,end:line.contentEnd}});
  const summary=summarizeLineSpacing(source,spacing,size,uaxBreaks,0,line.id),fitted=fitComposedLine(summary,chosen.width,size,spacing,{justify:align==='justify'&&(!chosen.last||p.justifyLastLine===true),allowResidual:overflow==='allow',last:chosen.last});
  const target=align==='justify'?'start':align,resolved=target==='start'?(line.direction==='rtl'?'right':'left'):target==='end'?(line.direction==='rtl'?'left':'right'):target,left=x+(line.direction==='ltr'?chosen.indent:0)+(resolved==='right'?chosen.width-fitted.logicalWidth:resolved==='center'?(chosen.width-fitted.logicalWidth)/2:0);let pen=left;
  for(const row of summary.clusters){
   const control=fitted.fit.values,factor=row.kind==='trimmed'?0:row.kind==='word'?control.word:control.glyph,gap=(row.gap==='letter'?control.letter:row.gap==='cjk'?control.cjk:0)*size,newAdvance=row.advance*factor+gap;
   if(newAdvance<0)throw new EngineError('E_PA_COMPOSE_ADVANCE','Requested spacing reverses a complete shaped cluster; choose a non-reversing range',{details:{cluster:row.cluster,newAdvance}});
   const point=(v:{id:string;x:number;y:number})=>({...v,x:finite(pen+control.glyph*(v.x-row.oldLeft-row.inkShift),'composed x')});let sum=0;
   for(const i of row.indices){const g=source.layout.glyphs[i];g.x=point({id:g.id,x:g.x,y:g.y}).x;g.advanceX*=factor;sum+=g.advanceX;const path=paths.get(i);if(path)path.commands=path.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:point(c.control),point:point(c.point)}:c.op==='C'?{...c,control1:point(c.control1),control2:point(c.control2),point:point(c.point)}:{...c,point:point(c.point)});}
   source.layout.glyphs[row.indices.at(-1)!].advanceX+=newAdvance-sum;pen=finite(pen+newAdvance,'composed pen');
  }
  const advance=pen-left;(line as {advance:number;origin:readonly[number,number]}).advance=advance;(line as {origin:readonly[number,number]}).origin=[left,line.baseline];const residual=chosen.width-(advance-fitted.hang);
  if(!fitted.ragged&&Math.abs(residual)>1e-7*Math.max(1,chosen.width))source.diagnostics.push({code:'W_PA_COMPOSE_RESIDUAL',severity:'warning',message:'Explicit spacing bounds retain an under/overfull line; no hidden stretch or clipping',details:{line:line.id,residual,width:chosen.width}});
  lineRecords.push({id:line.id,start:line.start,end:line.contentEnd,width:chosen.width,indent:chosen.indent,natural:fitted.natural,logicalWidth:advance-fitted.hang,advance,overhang:fitted.hang,controls:fitted.fit.values,residual,last:chosen.last,ragged:fitted.ragged,fitStatus:fitted.ragged?'ragged':Math.abs(residual)<=1e-7*Math.max(1,chosen.width)?'exact':'residual',kashidas:chosen.plan});
 }
 source.layout=graphics.validateTextLayoutData(source.layout);createParagraphIndex(source);check();
 return frozen({...source,flow:{width,fontSize:size,lineHeight:height,wrap:'measured-global',overflow,lineBreakUnicode:'16.0.0',segmentation:{runtime:typeof process==='undefined'?'unknown':process.version,unicode:typeof process==='undefined'?'runtime':process.versions.unicode??'unknown',icu:typeof process==='undefined'?'runtime':process.versions.icu??'unknown'},graphemes,words,softBreaks:[...soft].sort((a,b)=>a-b),measurements},composition:{algorithm:'measured-global-dp/1',cost,measurements,cacheHits,measuredEdges,spacing:structuredClone(p.spacing??{}),elongations,lines:lineRecords}});
}
