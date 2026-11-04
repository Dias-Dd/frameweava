// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
import type {ShapedBidiLine} from '../bidi-line.ts';import type {ShapedBidiText} from '../bidi-text.ts';
import {createParagraphIndex,type ParagraphCluster} from '../text-layout/queries.ts';
import {solveJustification,type JustificationFit,type JustificationVariable} from './fit.ts';
export interface AdjustmentRange {min:number;preferred:number;max:number;weight?:number}
export interface CompositionSpacing {
 word?:AdjustmentRange;letterEm?:AdjustmentRange;glyphScale?:AdjustmentRange;cjkEm?:AdjustmentRange;
 trimEdgeSpaces?:boolean;
 cjk?:{kinsoku?:boolean;compressPunctuation?:boolean;maxCompressionEm?:number;hangingEndEm?:number;prohibitStart?:string;prohibitEnd?:string};
}
export const defaultKinsokuStart='、。，．・：；？！‼⁇⁈⁉）］｝〕〉》」』】〙〗〟’”｠»ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー';
export const defaultKinsokuEnd='（［｛〔〈《「『【〘〖〝‘“｟«';
const cjkChar=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u,spaces=/^[ \u2000-\u200a\u205f\u3000]+$/u;
const cursive=new Set(['Arab','Syrc','Mong','Nkoo','Mand','Phag','Adlm','Rohg','Sogd','Sogo','Mani','Phlp','Ougr']);
const fail=(message:string):never=>{throw new EngineError('E_PA_COMPOSE_PARAMETER',message);};
export function compositionSpacing(input:CompositionSpacing={}){
 const p=structuredClone(input),word=p.word??{min:.8,preferred:1,max:1.5,weight:1},letter=p.letterEm??{min:-.025,preferred:0,max:.06,weight:2},glyph=p.glyphScale??{min:.98,preferred:1,max:1.02,weight:6},cjk=p.cjkEm??{min:0,preferred:0,max:.2,weight:1};
 for(const [name,r]of Object.entries({word,letter,glyph,cjk})){if(![r.min,r.preferred,r.max,r.weight??1].every(Number.isFinite)||r.min>r.preferred||r.preferred>r.max||(r.weight??1)<=0)fail('Ordered finite '+name+' controls and positive weight required');}
 if(word.min<0||glyph.min<=0)fail('Nonnegative word factor and positive glyph scale required');
 const cp=p.cjk??{},maxCompression=cp.maxCompressionEm??.5,hang=cp.hangingEndEm??0;if(!Number.isFinite(maxCompression)||maxCompression<0||!Number.isFinite(hang)||hang<0)fail('Finite nonnegative punctuation compression/overhang required');
 return {word,letter,glyph,cjk,trim:p.trimEdgeSpaces??true,kinsoku:cp.kinsoku??true,compress:cp.compressPunctuation??false,maxCompression,hang,prohibitStart:cp.prohibitStart??defaultKinsokuStart,prohibitEnd:cp.prohibitEnd??defaultKinsokuEnd};
}
export type PreparedSpacing=ReturnType<typeof compositionSpacing>;
export function permittedLineBoundary(text:string,at:number,p:PreparedSpacing){
 if(!p.kinsoku||at===0||at===text.length)return true;
 const before=[...text.slice(0,at).trimEnd()].at(-1)??'',after=[...text.slice(at).trimStart()][0]??'';
 return (!before||!p.prohibitEnd.includes(before))&&(!after||!p.prohibitStart.includes(after));
}
export function paragraphLine(line:ShapedBidiLine):ShapedBidiText{
 const direction=line.analysis.paragraphs[0]?.direction??'ltr',layout=line.layout.text.length?line.layout:{...line.layout,paragraphs:[{id:'paragraph',start:0,end:0,direction}],lines:[{id:'line',paragraphId:'paragraph',start:0,end:0,baseline:line.origin[1]}]};
 return {...line,layout,lines:[{id:'line',paragraphId:'paragraph',start:0,end:line.layout.text.length,contentEnd:line.layout.text.length,baseline:line.origin[1],advance:line.advance,origin:line.origin,direction,glyphStart:0,glyphEnd:line.layout.glyphs.length}]};
}
export interface ClusterPlacement {indices:readonly number[];cluster:{start:number;end:number};oldLeft:number;advance:number;inkShift:number;kind:'trimmed'|'word'|'body';gap:'letter'|'cjk'|'none'}
export interface LineSpacingSummary {clusters:readonly ClusterPlacement[];body:number;words:number;letters:number;cjk:number;hang:number;empty:boolean}
/** Derived from the formal existing Paragraph Reader, including GPOS pen spans/ink bounds. */
export function summarizeLineSpacing(source:ShapedBidiText,p:PreparedSpacing,fontSize:number,breaks:ReadonlySet<number>,sourceOffset=0,lineId?:string):LineSpacingSummary {
 const index=createParagraphIndex(source),clusters=lineId===undefined?index.clusters:index.clusters.filter(c=>c.lineId===lineId);let first=clusters.findIndex(c=>!spaces.test(c.text)),last=clusters.reduce((v,c,i)=>spaces.test(c.text)?v:i,-1);if(first<0)first=clusters.length;
 let body=0,words=0,letters=0,cjk=0,hang=0;
 const rows:ClusterPlacement[]=clusters.map((c,i)=>{
  if(c.advanceX<0)fail('Negative whole-cluster advances require an explicit overlapping layout policy');
  const blank=spaces.test(c.text)&&!c.inkBox,kind=p.trim&&blank&&(i<first||i>last)?'trimmed':blank?'word':'body';let advance=kind==='trimmed'?0:c.advanceX,inkShift=0;
  if(kind==='body'&&p.compress&&c.inkBox){const firstChar=[...c.text][0],lastChar=[...c.text].at(-1)!;if(p.prohibitEnd.includes(firstChar)){const left=Math.max(0,c.inkBox.left-c.advanceBox.left);inkShift=Math.min(left,p.maxCompression*fontSize);advance-=inkShift;}if(p.prohibitStart.includes(lastChar)){const right=Math.max(0,c.advanceBox.right-c.inkBox.right);advance-=Math.min(right,p.maxCompression*fontSize,advance);}advance=Math.max(0,advance);}
  let gap:ClusterPlacement['gap']='none';const next=clusters[i+1];
  if(kind==='body'&&next&&i>=first&&i<last&&!spaces.test(next.text)){
   const a=source.runs[c.runIndex].script,b=source.runs[next.runIndex].script,boundary=c.cluster.end===next.cluster.start?c.cluster.end:next.cluster.end===c.cluster.start?next.cluster.end:undefined;
   if(!cursive.has(a)&&!cursive.has(b)&&boundary!==undefined){if(cjkChar.test(c.text+next.text)){if(breaks.has(sourceOffset+boundary)&&permittedLineBoundary(source.layout.text,boundary,p)){gap='cjk';cjk++;}}else{gap='letter';letters++;}}
  }
  if(kind==='word')words+=advance;else if(kind==='body')body+=advance;
  return {indices:c.glyphIndices,cluster:c.cluster,oldLeft:c.advanceBox.left,advance,inkShift,kind,gap};
 });
 const end=rows[last],unit=clusters[last];if(end?.kind==='body'&&unit&&p.prohibitStart.includes([...unit.text].at(-1)!))hang=Math.min(end.advance,p.hang*fontSize);
 return {clusters:rows,body,words,letters,cjk,hang,empty:first===clusters.length};
}
export interface ComposedLineFit {fit:JustificationFit;natural:number;logicalWidth:number;advance:number;hang:number;summary:LineSpacingSummary;cost:number;feasible:boolean;ragged:boolean}
export function fitComposedLine(summary:LineSpacingSummary,width:number,fontSize:number,p:PreparedSpacing,options:{justify:boolean;allowResidual:boolean;last:boolean}):ComposedLineFit{
 const variable=(id:string,r:AdjustmentRange,coefficient:number):JustificationVariable=>({id,...r,coefficient,weight:(r.weight??1)/Math.max((r.max-r.min)**2,1e-12)}),variables=[variable('word',p.word,summary.words),variable('glyph',p.glyph,summary.body-summary.hang),variable('letter',p.letter,summary.letters*fontSize),variable('cjk',p.cjk,summary.cjk*fontSize)];
 const natural=variables.reduce((s,v)=>s+v.coefficient*v.preferred,0),ragged=summary.empty||!options.justify&&natural<=width,fit=solveJustification(ragged?0:width-natural,variables),hang=summary.hang*fit.values.glyph,logicalWidth=natural+fit.achieved,residual=width-logicalWidth,tolerance=128*Number.EPSILON*Math.max(1,width,logicalWidth),exact=Math.abs(residual)<=tolerance;
 const feasible=ragged||exact||options.allowResidual,cost=fit.cost+(ragged&&!options.last?((width-natural)/Math.max(1,width))**2:!ragged&&!exact?1e6+1e6*(residual/Math.max(1,width))**2:0);
 return {fit,natural,logicalWidth,advance:logicalWidth+hang,hang,summary,cost,feasible,ragged};
}
