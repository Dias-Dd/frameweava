// SPDX-License-Identifier: Apache-2.0
// Geometry-only composition of existing shaped glyphs, Signal, and repeatPath transforms.
import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal,Diagnostic} from '../../../src/core/types.ts';
import type {PathData,TextLayoutData} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {ShapedRun} from './font-shaping.ts';
import type {TextTransform} from './animated-text.ts';
import {createShapeModifiers} from './shape-modifiers.ts';
import {createTextLayoutGeometry} from '../../graphics-contracts/text-geometry.ts';

export interface GlyphAnimationUnit {
 readonly index:number;readonly logicalIndex:number;readonly visualIndex:number;readonly count:number;
 readonly cluster:Readonly<{start:number;end:number}>;readonly text:string;readonly lineId:string;
 readonly glyphIndices:readonly number[];readonly anchor:readonly [number,number];
 readonly advanceX:number;readonly advanceY:number;
}
export interface GlyphAnimationOptions {
 /** Cluster is the default: attached marks share one rigid transform. Glyph can intentionally separate them. */
 unit?:'cluster'|'glyph';order?:'logical'|'visual';signal?:AbortSignal;
 transform?:(unit:GlyphAnimationUnit,context:FrameContext)=>TextTransform&{anchor?:readonly [Signal<number>,Signal<number>]};
}
type DeepReadonly<T>=T extends readonly (infer U)[]?readonly DeepReadonly<U>[]:T extends object?{readonly [K in keyof T]:DeepReadonly<T[K]>}:T;
export type GlyphAnimationSource=DeepReadonly<TextLayoutData>;
export interface AnimatedGlyphDrawing {
 glyphIndex:number;glyphId:number;cluster:Readonly<{start:number;end:number}>;
 /** No path means the shaper returned no outline (e.g. a space); never fabricated ink. */
 path?:PathData;opacity:number;
}
interface Group {cluster:{start:number;end:number};lineId:string;glyphIndices:number[];anchor:[number,number];advanceX:number;advanceY:number;logicalIndex:number;visualIndex:number}
const fail=(code:string,message:string,details?:unknown):never=>{throw new EngineError(code,message,{details});};
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

/** Prepare once from a verified shaper result. Animation never fetches fonts or invokes inference/shaping. */
export function createGlyphAnimator(graphics:Pick<typeof Graphics,'validateTextLayoutData'|'validatePathData'>,run:ShapedRun){
 const layout=freeze(graphics.validateTextLayoutData(run.layout));
 if(layout.coordinates.unit!=='px')fail('E_PA_GLYPH_SPACE','Glyph transforms use physical pixel geometry');
 const geometry=createTextLayoutGeometry(layout),outlines=new Map<number,PathData>(),shape=createShapeModifiers(graphics);
 for(const item of run.glyphPaths){
  if(!Number.isInteger(item.glyphIndex)||item.glyphIndex<0||item.glyphIndex>=layout.glyphs.length||outlines.has(item.glyphIndex))fail('E_PA_GLYPH_MAPPING','Each outline must reference one unique existing glyph index');
  const path=graphics.validatePathData(item.path);
  if(Object.keys(layout.coordinates).some(key=>Reflect.get(layout.coordinates,key)!==Reflect.get(path.coordinates,key)))fail('E_PA_GLYPH_SPACE','Glyph geometry and layout must share identical coordinates');
  outlines.set(item.glyphIndex,freeze(geometry.orientGlyphPath(item.glyphIndex,path)));
 }
 // Provenance stays local return metadata, not a new wire schema or a claim of byte reauthentication.
 const metadata=(()=>{try{return {fontInstance:freeze(structuredClone(run.fontInstance)),sourceDiagnostics:structuredClone(run.diagnostics)};}catch{throw new EngineError('E_PA_GLYPH_INPUT','Shaped provenance/diagnostics must be cloneable');}})();
 const {fontInstance,sourceDiagnostics}=metadata;
 const lineOrder=new Map(layout.lines.map((line,index)=>[line.id,index]));
 const groups:Record<'cluster'|'glyph',Group[]>={cluster:[],glyph:[]},clusterMap=new Map<string,Group>();
 for(const [index,glyph]of layout.glyphs.entries()){
  const key=JSON.stringify([glyph.lineId,glyph.cluster.start,glyph.cluster.end]);let group=clusterMap.get(key);
  if(!group){group={cluster:{...glyph.cluster},lineId:glyph.lineId,glyphIndices:[],anchor:[...geometry.glyphAnchor(index)],advanceX:0,advanceY:0,logicalIndex:0,visualIndex:groups.cluster.length};groups.cluster.push(group);clusterMap.set(key,group);}
  group.glyphIndices.push(index);group.advanceX+=glyph.advanceX;group.advanceY+=glyph.advanceY;
  groups.glyph.push({cluster:{...glyph.cluster},lineId:glyph.lineId,glyphIndices:[index],anchor:[...geometry.glyphAnchor(index)],advanceX:glyph.advanceX,advanceY:glyph.advanceY,logicalIndex:0,visualIndex:index});
 }
 for(const list of Object.values(groups)){
  const logical=[...list].sort((a,b)=>lineOrder.get(a.lineId)!-lineOrder.get(b.lineId)!||a.cluster.start-b.cluster.start||a.cluster.end-b.cluster.end||a.visualIndex-b.visualIndex);
  logical.forEach((group,index)=>group.logicalIndex=index);freeze(list);
 }
 const modes=(options:Pick<GlyphAnimationOptions,'unit'|'order'>)=>{
  const unit=options.unit??'cluster',order=options.order??'logical';if(!['cluster','glyph'].includes(unit)||!['logical','visual'].includes(order))fail('E_PA_GLYPH_PARAMETER','Known cluster/glyph unit and logical/visual order required');return {unit,order};
 };
 const units=(options:Pick<GlyphAnimationOptions,'unit'|'order'>={}):readonly GlyphAnimationUnit[]=>{
  const {unit,order}=modes(options),list=groups[unit];return freeze([...list].sort((a,b)=>order==='logical'?a.logicalIndex-b.logicalIndex:a.visualIndex-b.visualIndex).map(group=>({...group,index:order==='logical'?group.logicalIndex:group.visualIndex,count:list.length,text:layout.text.slice(group.cluster.start,group.cluster.end)})));
 };
 return {
  sourceLayout:layout as GlyphAnimationSource,fontInstance:fontInstance as DeepReadonly<ShapedRun['fontInstance']>,units,
  animate(options:GlyphAnimationOptions,context:FrameContext){
   const {unit}=modes(options);const check=()=>{if(options.signal?.aborted)fail('E_PA_GLYPH_CANCELLED','Glyph animation cancelled',{reason:String(options.signal.reason)});};check();if(options.transform!==undefined&&typeof options.transform!=='function')fail('E_PA_GLYPH_TRANSFORM','Transform callback must be a function');
   const records=new Map<number,AnimatedGlyphDrawing>();const diagnostics=structuredClone(sourceDiagnostics);
   if(unit==='glyph'&&groups.cluster.some(group=>group.glyphIndices.length>1))diagnostics.push({code:'W_PA_GLYPH_CLUSTER_SPLIT',severity:'warning',message:'Independent glyph transforms can separate attached marks in one logical cluster; ligatures remain single glyphs'});
   const scalar=(s:Signal<number>,name:string)=>{const n=evaluate(s,context);if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_GLYPH_TRANSFORM',`${name} must be finite`);return n;};
   for(const item of units(options)){
    check();const transform=options.transform?.(item,context)??{};
    if(!transform||typeof transform!=='object'||'then' in transform||Object.keys(transform).some(key=>!['dx','dy','rotation','scaleX','scaleY','opacity','anchor'].includes(key)))fail('E_PA_GLYPH_TRANSFORM','Return synchronous typed numeric/Signal transforms');
    const dx=scalar(transform.dx??0,'dx'),dy=scalar(transform.dy??0,'dy'),rotation=scalar(transform.rotation??0,'rotation'),sx=scalar(transform.scaleX??1,'scaleX'),sy=scalar(transform.scaleY??1,'scaleY'),opacity=scalar(transform.opacity??1,'opacity');
    if(opacity<0||opacity>1)fail('E_PA_GLYPH_TRANSFORM','Opacity must be [0,1]');
    const raw=transform.anchor??item.anchor;if(!Array.isArray(raw)||raw.length!==2)fail('E_PA_GLYPH_TRANSFORM','Explicit anchor must have two coordinates');const anchor:[number,number]=[scalar(raw[0],'anchor.x'),scalar(raw[1],'anchor.y')];
    for(const index of item.glyphIndices){
     check();const glyph=layout.glyphs[index],path=outlines.get(index);let result:PathData|undefined;
     if(path){
      if(dx===0&&dy===0&&rotation===0&&sx===1&&sy===1)result=graphics.validatePathData(path);
      else{const iterator=shape.repeatPath(path,{copies:1,offset:1,position:[dx,dy],anchor,rotation,scale:[sx,sy],startOpacity:opacity,signal:options.signal},context),copy=iterator.next();if(copy.done)fail('E_PA_GLYPH_OUTPUT','Expected one existing path transform');result=copy.value.path;iterator.return?.(undefined);}
     }
     records.set(index,{glyphIndex:index,glyphId:glyph.glyphId,cluster:glyph.cluster,...result?{path:result}:{},opacity});
    }
   }
   check();return {sourceLayout:layout as GlyphAnimationSource,fontInstance:fontInstance as DeepReadonly<ShapedRun['fontInstance']>,glyphs:layout.glyphs.map((_,index)=>records.get(index)!),diagnostics};
  },
 };
}
