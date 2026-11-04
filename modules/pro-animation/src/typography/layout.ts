// SPDX-License-Identifier: Apache-2.0
// Static canonical-layout edits. Original glyph identities/GPOS outlines are retained;
// no shaping, line breaker, timeline, document model or pixel renderer is replaced.
import * as graphics from '../../../graphics-contracts/index.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import type {ShapedBidiText,BidiTextLine} from '../bidi-text.ts';
import {createParagraphIndex,type ParagraphIndex} from '../text-layout/queries.ts';
import {finite,frozen,union,type TextBox} from '../text-layout/common.ts';
import type {ParagraphFlow} from '../text-layout/layout.ts';
type WritableLine={-readonly[K in keyof BidiTextLine]:BidiTextLine[K]};
type Editable=Omit<ShapedBidiText,'lines'>&{lines:WritableLine[];flow?:ParagraphFlow;typesetting?:readonly {operation:string}[]};
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_TYPESET',message,{details});};
function value(input:Signal<number>,context:FrameContext|undefined,name:string){if(typeof input!=='number'&&!context)fail(name+' Signal requires explicit FrameContext');return finite(typeof input==='number'?input:evaluate(input,context!),name);}
function editing(input:ShapedBidiText){
 const index=createParagraphIndex(input),source=structuredClone(index.source) as Editable,paths=new Map(source.glyphPaths.map(p=>[p.glyphIndex,p.path])),lines=new Map(source.lines.map((l,i)=>[l.id,{line:l,canonical:source.layout.lines[i]}]));
 const moveGlyph=(i:number,dx:number,dy:number)=>{const g=source.layout.glyphs[i];g.x=finite(g.x+dx,'glyph.x');g.y=finite(g.y+dy,'glyph.y');const p=paths.get(i);if(p){const shift=(v:{id:string;x:number;y:number})=>({...v,x:finite(v.x+dx,'path.x'),y:finite(v.y+dy,'path.y')});p.commands=p.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:shift(c.control),point:shift(c.point)}:c.op==='C'?{...c,control1:shift(c.control1),control2:shift(c.control2),point:shift(c.point)}:{...c,point:shift(c.point)});}};
 const moveLine=(id:string,dx:number,dy:number)=>{finite(dx,'line.dx');finite(dy,'line.dy');const entry=lines.get(id)!;for(let i=entry.line.glyphStart;i<entry.line.glyphEnd;i++)moveGlyph(i,dx,dy);entry.line.origin=[finite(entry.line.origin[0]+dx,'origin.x'),finite(entry.line.origin[1]+dy,'origin.y')];entry.line.baseline=entry.canonical.baseline=finite(entry.line.baseline+dy,'baseline');};
 // Spacing is attached to a complete visual cluster, never inserted inside a ligature/mark.
 const gaps=(amounts:ReadonlyMap<number,number>)=>{for(const line of source.lines){let offset=0;for(const c of index.clusters.filter(c=>c.lineId===line.id)){for(const i of c.glyphIndices)moveGlyph(i,offset,0);const gap=finite(amounts.get(c.index)??0,'cluster gap');if(c.advanceX+gap<0)fail('Spacing would reverse a cluster advance; choose an explicit overlap transform',{cluster:c.cluster,advance:c.advanceX,gap});source.layout.glyphs[c.glyphIndices.at(-1)!].advanceX+=gap;offset+=gap;}line.advance=finite(line.advance+offset,'line.advance');if(line.direction==='rtl')moveLine(line.id,-offset,0);}};
 const finish=(operation:string)=>{source.layout=graphics.validateTextLayoutData(source.layout);source.typesetting=[...(source.typesetting??[]),{operation}];createParagraphIndex(source);return frozen(source);};
 return {source,index,moveGlyph,moveLine,gaps,finish};
}
const alignment=(align:string,direction:string)=>align==='start'?(direction==='rtl'?'right':'left'):align==='end'?(direction==='rtl'?'left':'right'):align;
export function alignParagraphLines(input:ShapedBidiText,options:{x:Signal<number>;width:Signal<number>;align?:'left'|'right'|'center'|'start'|'end'},context?:FrameContext){
 const e=editing(input),x=value(options.x,context,'x'),width=value(options.width,context,'width'),align=options.align??'start';if(width<0||!['left','right','center','start','end'].includes(align))fail('Nonnegative width and known alignment required');for(const line of e.source.lines){const a=alignment(align,line.direction),target=x+(a==='right'?width-line.advance:a==='center'?(width-line.advance)/2:0);e.moveLine(line.id,target-line.origin[0],0);}if(e.source.flow)e.source.flow={...e.source.flow,width};return e.finish('alignParagraphLines');
}
const horizontalSpace=(text:string)=>/^[ \u00a0\u2002-\u200a\u202f\u205f\u3000]+$/u.test(text);
/** Adds physical spacing to existing visible advance gaps. Does not alter break/cluster identity. */
export function spaceParagraphWords(input:ShapedBidiText,options:{amount:Signal<number>},context?:FrameContext){
 const e=editing(input),amount=value(options.amount,context,'word spacing'),gaps=new Map<number,number>();for(const c of e.index.clusters)if(horizontalSpace(c.text))gaps.set(c.index,amount);e.gaps(gaps);return e.finish('spaceParagraphWords');
}
export function trackParagraphClusters(input:ShapedBidiText,options:{amount:Signal<number>;includeTrailing?:boolean},context?:FrameContext){
 const e=editing(input),amount=value(options.amount,context,'cluster tracking'),gaps=new Map<number,number>();for(const line of e.source.lines){const clusters=e.index.clusters.filter(c=>c.lineId===line.id);for(const c of clusters.slice(0,options.includeTrailing?undefined:-1))gaps.set(c.index,amount);}e.gaps(gaps);return e.finish('trackParagraphClusters');
}
/** Space-only justification. Arabic kashida/CJK character distribution need explicit other policies. */
export function justifyParagraphLines(input:ShapedBidiText,options:{width:Signal<number>;lastLine?:'preserve'|'justify';shrink?:boolean;minSpaceRatio?:number},context?:FrameContext){
 const e=editing(input),width=value(options.width,context,'justification width'),ratio=finite(options.minSpaceRatio??0,'minSpaceRatio'),gaps=new Map<number,number>();if(width<=0||ratio<0||ratio>1||!['preserve','justify'].includes(options.lastLine??'preserve'))fail('Positive width, minSpaceRatio[0,1] and known last-line policy required');
 for(const [i,line]of e.source.lines.entries()){
  const last=i===e.source.lines.length-1||e.source.lines[i+1].paragraphId!==line.paragraphId;if(last&&options.lastLine!=='justify')continue;const delta=width-line.advance;if(Math.abs(delta)<=1e-9)continue;if(delta<0&&!options.shrink)continue;
  const all=e.index.clusters.filter(c=>c.lineId===line.id),first=all.findIndex(c=>!horizontalSpace(c.text)),lastInk=all.reduce((last,c,j)=>horizontalSpace(c.text)?last:j,-1),spaces=all.filter((c,j)=>j>first&&j<lastInk&&c.text===' ');
  if(!spaces.length){e.source.diagnostics.push({code:'W_PA_TYPESET_JUSTIFY_GAPS',severity:'warning',message:'No eligible interior U+0020 spaces; no synthetic CJK/kashida expansion or glyph scaling',details:{line:line.id,residual:delta}});continue;}
  let residual=delta,active=[...spaces];while(active.length&&Math.abs(residual)>1e-9){const share=residual/active.length,next:typeof active=[];let used=0;for(const c of active){const previous=gaps.get(c.index)??0,min=c.advanceX*(ratio-1),take=Math.max(share,min-previous);gaps.set(c.index,previous+take);used+=take;if(take===share)next.push(c);}residual-=used;if(used===0)break;active=next;}
  if(Math.abs(residual)>1e-7)e.source.diagnostics.push({code:'W_PA_TYPESET_JUSTIFY_RESIDUAL',severity:'warning',message:'Minimum space ratio prevents exact fitting; overflow is preserved explicitly',details:{line:line.id,residual}});
 }e.gaps(gaps);if(e.source.flow)e.source.flow={...e.source.flow,width};return e.finish('justifyParagraphLines');
}
export function setParagraphLeading(input:ShapedBidiText,options:{lineHeight:Signal<number>;paragraphGap?:Signal<number>},context?:FrameContext){
 const e=editing(input),height=value(options.lineHeight,context,'lineHeight'),gap=value(options.paragraphGap??0,context,'paragraphGap');if(height<=0)fail('Positive line height required');let baseline=e.source.lines[0].baseline;for(const [i,line]of e.source.lines.entries()){if(i)baseline+=height+(line.paragraphId!==e.source.lines[i-1].paragraphId?gap:0);e.moveLine(line.id,0,baseline-line.baseline);}if(e.source.flow)e.source.flow={...e.source.flow,lineHeight:height};return e.finish('setParagraphLeading');
}
export function shiftParagraphBaseline(input:ShapedBidiText,options:{amount:Signal<number>;lineIds?:readonly string[]},context?:FrameContext){
 const e=editing(input),amount=value(options.amount,context,'baseline shift'),ids=new Set(options.lineIds??e.source.lines.map(l=>l.id));if([...ids].some(id=>!e.source.lines.some(l=>l.id===id)))fail('Baseline shift references an unknown line');for(const line of e.source.lines)if(ids.has(line.id))e.moveLine(line.id,0,amount);return e.finish('shiftParagraphBaseline');
}
export function snapParagraphBaselines(input:ShapedBidiText,options:{grid:Signal<number>;offset?:Signal<number>},context?:FrameContext){
 const e=editing(input),grid=value(options.grid,context,'baseline grid'),offset=value(options.offset??0,context,'grid offset');if(grid<=0)fail('Positive baseline grid required');for(const line of e.source.lines){const target=finite(offset+Math.round((line.baseline-offset)/grid)*grid,'snapped baseline');e.moveLine(line.id,0,target-line.baseline);}return e.finish('snapParagraphBaselines');
}
/** Explicit post-layout indentation: no silent reflow, clipping or change to font shaping. */
export function indentParagraphLines(input:ShapedBidiText,options:{first?:Signal<number>;rest?:Signal<number>;direction?:'auto'|'ltr'|'rtl'},context?:FrameContext){
 const e=editing(input),first=value(options.first??0,context,'first indent'),rest=value(options.rest??0,context,'rest indent'),direction=options.direction??'auto';if(!['auto','ltr','rtl'].includes(direction))fail('Known indent direction required');for(const [i,line]of e.source.lines.entries()){const beginning=i===0||e.source.lines[i-1].paragraphId!==line.paragraphId,sign=(direction==='auto'?line.direction:direction)==='rtl'?-1:1;e.moveLine(line.id,sign*(beginning?first:rest),0);}return e.finish('indentParagraphLines');
}
/** Repositions already width-shaped lines into finite physical columns; never invents a document/page model. */
export function flowParagraphColumns(input:ShapedBidiText,options:{x:number;y:number;width:number;height:number;gap?:number;columns:number}){
 const e=editing(input),x=finite(options.x,'column x'),y=finite(options.y,'column y'),width=finite(options.width,'column width'),height=finite(options.height,'column height'),gap=finite(options.gap??0,'column gap'),count=options.columns;if(width<=0||height<=0||!Number.isSafeInteger(count)||count<1)fail('Positive finite column dimensions/count required');let column=0,top=y;
 for(const line of e.source.lines){const box=e.index.lineBoxes.find(b=>b.id===line.id)!.box;if(line.advance>width+1e-8||box.height>height)fail('Source line does not fit a column; rewrap/reduce explicit line height first',{line:line.id});if(top+box.height>y+height+1e-8){column++;top=y;}if(column>=count)throw new EngineError('E_PA_TYPESET_OVERFLOW','Explicit finite columns exhausted; no lines were silently dropped');const target=x+column*(width+gap)+(line.direction==='rtl'?width-line.advance:0);e.moveLine(line.id,target-line.origin[0],top-box.top);top+=box.height;}
 if(e.source.flow)e.source.flow={...e.source.flow,width};return e.finish('flowParagraphColumns');
}
/** Uniformly scale original unhinted outlines/advances; this is not font selection or re-shaping. */
export function fitParagraphBox(input:ShapedBidiText,options:{box:TextBox;allowUpscale?:boolean;anchor?:'start'|'center'|'end'}){
 const e=editing(input),combined=union(e.index.lineBoxes.map(l=>l.box))!,{left,top,right,bottom}=combined,target=options.box;for(const n of [target.left,target.top,target.right,target.bottom])finite(n,'fit box');if(target.right<=target.left||target.bottom<=target.top||right<=left||bottom<=top)fail('Positive source and target advance/em bounds required');const anchor=options.anchor??'center';if(!['start','center','end'].includes(anchor))fail('Known fit anchor required');let scale=Math.min((target.right-target.left)/(right-left),(target.bottom-target.top)/(bottom-top));if(!options.allowUpscale)scale=Math.min(1,scale);const f=anchor==='start'?0:anchor==='end'?1:.5,tx=target.left+f*(target.right-target.left-(right-left)*scale)-left*scale,ty=target.top+f*(target.bottom-target.top-(bottom-top)*scale)-top*scale;
 const xy=(p:{id:string;x:number;y:number})=>({...p,x:finite(p.x*scale+tx,'scaled x'),y:finite(p.y*scale+ty,'scaled y')});
 for(const g of e.source.layout.glyphs){g.x=g.x*scale+tx;g.y=g.y*scale+ty;g.advanceX*=scale;g.advanceY*=scale;}
 for(const {path}of e.source.glyphPaths)path.commands=path.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:xy(c.control),point:xy(c.point)}:c.op==='C'?{...c,control1:xy(c.control1),control2:xy(c.control2),point:xy(c.point)}:{...c,point:xy(c.point)});
 for(const [i,line]of e.source.lines.entries()){line.origin=[line.origin[0]*scale+tx,line.origin[1]*scale+ty];line.advance*=scale;line.baseline=e.source.layout.lines[i].baseline=line.baseline*scale+ty;}for(const style of e.source.layout.styles)style.fontSize*=scale;if(e.source.flow)e.source.flow={...e.source.flow,fontSize:e.source.flow.fontSize*scale,lineHeight:e.source.flow.lineHeight*scale,width:e.source.flow.width*scale};return e.finish('fitParagraphBox');
}

/** Recover a verified cluster-affine control for existing native glyph geometry.
 * Only these post-layout positions/advances/uniform sizes may change; outline
 * edits, new fonts/axes/glyph identities need explicit mesh preparation again. */
export function paragraphLayoutTransform(original:ParagraphIndex,adjusted:ParagraphIndex){
 const a=original.source,b=adjusted.source;if(JSON.stringify(a.layout.coordinates)!==JSON.stringify(b.layout.coordinates)||a.layout.text!==b.layout.text||JSON.stringify(a.fontInstances)!==JSON.stringify(b.fontInstances)||a.layout.glyphs.length!==b.layout.glyphs.length||original.clusters.length!==adjusted.clusters.length)fail('Existing font identities, source text and cluster topology required');
 const targetPaths=new Map(b.glyphPaths.map(p=>[p.glyphIndex,p.path])),sourcePaths=new Map(a.glyphPaths.map(p=>[p.glyphIndex,p.path])),styleA=new Map(a.layout.styles.map(s=>[s.id,s])),styleB=new Map(b.layout.styles.map(s=>[s.id,s]));
 const close=(x:number,y:number)=>Math.abs(x-y)<=32*Number.EPSILON*Math.max(1,Math.abs(x),Math.abs(y));
 const controls=original.clusters.map((unit,index)=>{
  const to=adjusted.clusters[index];if(unit.text!==to.text||unit.lineId!==to.lineId||JSON.stringify(unit.glyphIndices)!==JSON.stringify(to.glyphIndices))fail('Original visual cluster topology required');
  const first=unit.glyphIndices[0],g=a.layout.glyphs[first],h=b.layout.glyphs[first],scale=styleB.get(h.styleId)!.fontSize/styleA.get(g.styleId)!.fontSize,dx=h.x-scale*g.x,dy=h.y-scale*g.y,matrix=[scale,0,0,scale,dx,dy] as const;
  for(const id of unit.glyphIndices){const old=a.layout.glyphs[id],next=b.layout.glyphs[id];if(old.glyphId!==next.glyphId||JSON.stringify(old.cluster)!==JSON.stringify(next.cluster)||!close(next.x,old.x*scale+dx)||!close(next.y,old.y*scale+dy)||!close(styleB.get(next.styleId)!.fontSize,styleA.get(old.styleId)!.fontSize*scale))fail('Each original shaped cluster must have one coherent affine transform');
   const op=sourcePaths.get(id),np=targetPaths.get(id);if(Boolean(op)!==Boolean(np)||op&&np&&op.commands.length!==np.commands.length)fail('Outline topology changed; prepare geometry again');
   if(op&&np)for(let ci=0;ci<op.commands.length;ci++){const from=op.commands[ci],to=np.commands[ci];if(from.op!==to.op)fail('Outline command changed; prepare geometry again');for(const key of ['point','control','control1','control2']){const p=Reflect.get(from,key),q=Reflect.get(to,key);if(Boolean(p)!==Boolean(q)||p&&q&&(!close(q.x,p.x*scale+dx)||!close(q.y,p.y*scale+dy)))fail('Outline is not the declared cluster affine; prepare geometry again');}}
  }return Object.freeze({matrix,opacity:1});
 });
 const units=original.clusters;return (unit:typeof units[number])=>{if(!Number.isSafeInteger(unit.index)||!units[unit.index]||unit.text!==units[unit.index].text||unit.lineId!==units[unit.index].lineId||JSON.stringify(unit.cluster)!==JSON.stringify(units[unit.index].cluster))fail('Control requested for a different prepared layout');return controls[unit.index];};
}
