// SPDX-License-Identifier: Apache-2.0
// Original-source/visual-order mapping only; all glyph transform math remains createGlyphAnimator.
import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {ShapedRun} from './font-shaping.ts';
import type {ShapedBidiLine} from './bidi-line.ts';
import {discretionaryMarker} from './text-layout/discretionary.ts';
import {createGlyphAnimator,type GlyphAnimationUnit,type GlyphAnimationOptions,type AnimatedGlyphDrawing} from './glyph-animation.ts';

export type BidiAnimationSource=Pick<ShapedBidiLine,'layout'|'glyphPaths'|'runs'|'fontInstances'|'diagnostics'>;
export interface BidiAnimationUnit extends GlyphAnimationUnit {readonly runIndex:number;readonly fontId:string}
export interface BidiAnimationOptions extends Omit<GlyphAnimationOptions,'transform'> {
 transform?:(unit:BidiAnimationUnit,context:FrameContext)=>ReturnType<NonNullable<GlyphAnimationOptions['transform']>>;
}
const fail=(message:string):never=>{throw new EngineError('E_PA_BIDI_ANIMATION_MAPPING',message);};
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
const key=(run:number,indices:readonly number[])=>run+':'+indices.join(',');

/** Prepare once. The canonical TextLayoutData/glyphPaths are the only source of geometry. */
export function createBidiAnimator(graphics:Pick<typeof Graphics,'validateTextLayoutData'|'validatePathData'>,line:BidiAnimationSource){
 const layout=freeze(graphics.validateTextLayoutData(line.layout)),instances=freeze(structuredClone(line.fontInstances)),sourceDiagnostics=structuredClone(line.diagnostics);
 if(layout.layout.engine!=='unicode-bidi+harfrust')fail('Use prepared canonical bidi line or multiline geometry');
 const outlines=new Map<number,PathData>(),assigned=new Set<number>();
 for(const p of line.glyphPaths){if(!Number.isSafeInteger(p.glyphIndex)||p.glyphIndex<0||p.glyphIndex>=layout.glyphs.length||outlines.has(p.glyphIndex))fail('Each outline must reference one unique canonical glyph');outlines.set(p.glyphIndex,graphics.validatePathData(p.path));}
 if(instances.length!==layout.fonts.length||new Set(instances.map(f=>f.fontId)).size!==instances.length)fail('Each canonical font needs one explicit font instance');
 for(const f of layout.fonts){const instance=instances.find(i=>i.fontId===f.id);if(!instance||JSON.stringify(instance.source)!==JSON.stringify(f.source)||instance.faceIndex!==f.faceIndex)fail('Canonical font provenance differs from the supplied instance');}
 const children=line.runs.map((run,runIndex)=>{
  const {text,sourceUnits,globalGlyphIndices:indices,localClusters}=structuredClone(run),font=layout.fonts.find(f=>f.id===run.fontId),styles=layout.styles.filter(s=>s.fontId===run.fontId);
  if(!font)return fail('Missing canonical run font');
  const parentLines=layout.lines.filter(l=>l.start<=run.item.start&&run.item.end<=l.end);if(parentLines.length!==1)fail('Each run must belong to one canonical line');const parentLine=parentLines[0];
  if(styles.length!==1||text.length!==sourceUnits.length||indices.length!==localClusters.length||!Number.isSafeInteger(run.item.start)||!Number.isSafeInteger(run.item.end)||run.item.start<0||run.item.end>layout.text.length||run.item.start>=run.item.end)fail('Run/font/source metadata is inconsistent');
  const replacement=run.replacement;if(replacement){if(replacement.original!=='\u00ad'||layout.text[replacement.sourceIndex]!=='\u00ad'||discretionaryMarker(replacement.value)!==text||replacement.sourceIndex!==run.item.start||run.item.end!==replacement.sourceIndex+1||sourceUnits.some(i=>i!==replacement.sourceIndex))fail('Discretionary glyph replacement must preserve exactly one original U+00AD source range');}
  else for(let i=0;i<sourceUnits.length;i++)if(!Number.isSafeInteger(sourceUnits[i])||sourceUnits[i]<run.item.start||sourceUnits[i]>=run.item.end||i>0&&sourceUnits[i]<=sourceUnits[i-1]||text[i]!==layout.text[sourceUnits[i]])fail('Clean run must map monotonically to the original UTF16 text');
  const glyphs=indices.map((index,local)=>{
   if(!Number.isSafeInteger(index)||index!==assigned.size||index>=layout.glyphs.length||assigned.has(index))fail('Runs must cover each canonical glyph exactly once in visual order');assigned.add(index);
   const g=layout.glyphs[index],cluster=localClusters[local];
   if(g.styleId!==styles[0].id||!cluster||!Number.isSafeInteger(cluster.start)||!Number.isSafeInteger(cluster.end)||cluster.start<0||cluster.start>=cluster.end||cluster.end>text.length||g.cluster.start!==sourceUnits[cluster.start]||g.cluster.end!==sourceUnits[cluster.end-1]+1)fail('Original and clean glyph cluster mapping disagree');
   if(g.lineId!==parentLine.id)fail('Run glyph references a different canonical line');return {...g,lineId:'line',cluster};
  });
  const {fontId:_,...fontInstance}=instances.find(f=>f.fontId===run.fontId)!;
  const shaped:ShapedRun={layout:{...layout,text,layout:{engine:'harfrust',version:'0.15.0',clusterUnit:'utf16'},fonts:[font],styles,paragraphs:text.length?[{id:'paragraph',start:0,end:text.length,direction:run.item.direction,...(layout.paragraphs.find(p=>p.id===parentLine.paragraphId)!.writingMode===undefined?{}:{writingMode:layout.paragraphs.find(p=>p.id===parentLine.paragraphId)!.writingMode})}]:[],lines:text.length?[{id:'line',paragraphId:'paragraph',start:0,end:text.length,baseline:parentLine.baseline,...(parentLine.baselineAxis===undefined?{}:{baselineAxis:parentLine.baselineAxis})}]:[],glyphs},glyphPaths:indices.flatMap((index,glyphIndex)=>outlines.has(index)?[{glyphIndex,path:outlines.get(index)!}]:[]),fontInstance,diagnostics:[]};
  return {runIndex,fontId:font.id,lineId:parentLine.id,sourceUnits,indices,animator:createGlyphAnimator(graphics,shaped)};
 });
 if(assigned.size!==layout.glyphs.length)fail('Some canonical glyphs are not assigned to any run');
 const modes=(p:Pick<BidiAnimationOptions,'unit'|'order'>)=>{const unit=p.unit??'cluster',order=p.order??'logical';if(!['cluster','glyph'].includes(unit)||!['logical','visual'].includes(order))throw new EngineError('E_PA_GLYPH_PARAMETER','Known cluster/glyph unit and logical/visual order required');return {unit,order};};
 const prepare=(unit:'cluster'|'glyph'):BidiAnimationUnit[]=>{
  const records=children.flatMap(child=>child.animator.units({unit,order:'visual'}).map(u=>{
   const cluster={start:child.sourceUnits[u.cluster.start],end:child.sourceUnits[u.cluster.end-1]+1};
   return {...u,lineId:child.lineId,runIndex:child.runIndex,fontId:child.fontId,glyphIndices:u.glyphIndices.map(i=>child.indices[i]),cluster,text:layout.text.slice(cluster.start,cluster.end)};
  }));
  const logical=[...records].sort((a,b)=>a.cluster.start-b.cluster.start||a.cluster.end-b.cluster.end||a.glyphIndices[0]-b.glyphIndices[0]),visual=[...records].sort((a,b)=>a.glyphIndices[0]-b.glyphIndices[0]);
  logical.forEach((u,i)=>u.logicalIndex=i);visual.forEach((u,i)=>u.visualIndex=i);return freeze(records);
 };
 const prepared={cluster:prepare('cluster'),glyph:prepare('glyph')};
 const units=(p:Pick<BidiAnimationOptions,'unit'|'order'>={}):readonly BidiAnimationUnit[]=>{const {unit,order}=modes(p);return freeze([...prepared[unit]].sort((a,b)=>order==='logical'?a.logicalIndex-b.logicalIndex:a.visualIndex-b.visualIndex).map(u=>({...u,index:order==='logical'?u.logicalIndex:u.visualIndex,count:prepared[unit].length})));};
 return {sourceLayout:layout,fontInstances:instances,units,animate(p:BidiAnimationOptions,context:FrameContext){
  modes(p);if(p.signal?.aborted)throw new EngineError('E_PA_GLYPH_CANCELLED','Glyph animation cancelled');if(p.transform!==undefined&&typeof p.transform!=='function')throw new EngineError('E_PA_GLYPH_TRANSFORM','Transform callback must be a function');
  const mapped=new Map(units(p).map(u=>[key(u.runIndex,u.glyphIndices),u])),glyphs:AnimatedGlyphDrawing[]=new Array(layout.glyphs.length),diagnostics=structuredClone(sourceDiagnostics);
  for(const child of children){const drawing=child.animator.animate({...p,transform:p.transform?(u,ctx)=>p.transform!(mapped.get(key(child.runIndex,u.glyphIndices.map(i=>child.indices[i])))!,ctx):undefined},context);diagnostics.push(...drawing.diagnostics);
   for(const g of drawing.glyphs){const index=child.indices[g.glyphIndex];glyphs[index]={...g,glyphIndex:index,cluster:layout.glyphs[index].cluster};}
  }
  return {sourceLayout:layout,fontInstances:instances,glyphs,diagnostics};
 }};
}
