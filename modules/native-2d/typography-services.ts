// SPDX-License-Identifier: Apache-2.0
import {evaluate} from '../../src/core/animation.ts';
import type {ParagraphOptions} from '../pro-animation/src/text-layout/layout.ts';
import {createParagraphIndex,paragraphMetrics} from '../pro-animation/src/text-layout/queries.ts';
import {prepareParagraphMeshes,type PreparedParagraphMeshes} from '../pro-animation/src/text-layout/native.ts';
import {trackParagraphClusters} from '../pro-animation/src/typography/layout.ts';
import {prepareSolidPathStroke} from '../pro-animation/src/path-authoring/prepare.ts';
import {createTextLayoutGeometry} from '../graphics-contracts/index.ts';
import type {TextItem} from '../pro-animation/src/text-itemizer.ts';
import type {Services2D,TextNode,FrameContext,PreparedText2D} from './types.ts';
import {error2D,number2D} from './model.ts';

/** The public Node typography provider and an admitted Stage provider satisfy
 * this seam. The adapter never loads a font, grants WASM, or owns the provider. */
export interface ParagraphProvider2D {
 prepareParagraph(text:string,options:Omit<ParagraphOptions,'font'|'fontForRun'|'itemizer'>&{font:string;fontForRun?:(item:TextItem)=>string;tolerance?:number}):Promise<PreparedParagraphMeshes>;
}
export interface TypographyServices2DOptions {
 typography:ParagraphProvider2D;
 pathOperations?:Services2D['pathOperations'];curveFactory?:Services2D['curveFactory'];
 defaultFont?:string;tolerance?:number;maxCacheBytes?:number;
 /** Explicit original item/run selection; no OS fallback font discovery. */
 fontForRun?:(item:TextItem,node:TextNode,context:FrameContext)=>string;
 signal?:AbortSignal;
}
/** Borrow actual PA services, returning geometry in the existing native-2d
 * seam. Only immutable layout/mesh data is cached; no frame or GPU result. */
export function typographyServices2D(options:TypographyServices2DOptions){
 const {typography,pathOperations,curveFactory,signal}=options,max=options.maxCacheBytes??32*1024**2,tolerance=options.tolerance??.02;
 if(typeof typography?.prepareParagraph!=='function'||!Number.isSafeInteger(max)||max<0||!Number.isFinite(tolerance)||tolerance<=0)error2D('E_NATIVE_2D_SERVICE','Actual paragraph provider and finite geometry/cache budgets required');
 let closed=false,busy=false,bytes=0,hits=0,preparations=0,pending:Promise<void>|undefined,closing:Promise<void>|undefined;
 const cache=new Map<string,{value:PreparedText2D;bytes:number}>();
 const services:Services2D={pathOperations,curveFactory,text:{async prepare(node,context,viewport){
  if(closed)error2D('E_NATIVE_2D_CLOSED','Text service is disposed');if(signal?.aborted)error2D('E_RENDER_CANCELLED','Text preparation cancelled');if(busy)error2D('E_NATIVE_2D_BUSY','Await the previous text preparation');
  const text=evaluate(node.text,context);if(typeof text!=='string')error2D('E_NATIVE_2D_PARAMETER','Text Signal must yield a Unicode string',node.id);
  const font=node.font==='default'?(options.defaultFont??'default'):node.font,fontSize=number2D(node.fontSize??32,context,'fontSize',Number.MIN_VALUE),width=number2D(node.width??viewport[0],context,'text width',Number.MIN_VALUE),lineHeight=number2D(node.lineHeight??fontSize*1.2,context,'lineHeight',Number.MIN_VALUE),spacing=number2D(node.letterSpacing??0,context,'letterSpacing'),stroke=node.stroke?number2D(node.stroke.width,context,'stroke width',0):0;
  if(node.fallback?.length&&!options.fontForRun)error2D('E_NATIVE_2D_SERVICE','Fallback lists require an explicit admitted fontForRun resolver',node.id);
  if(node.width!==undefined&&spacing!==0)error2D('E_NATIVE_2D_SERVICE','Wrapped tracking needs an explicit PA reflow policy; post-layout spacing cannot silently preserve the old wrap',node.id);
  const key=JSON.stringify([text,font,fontSize,width,lineHeight,spacing,node.width!==undefined,node.direction,node.script,node.language,node.fallback,viewport,stroke,node.stroke?.cap,node.stroke?.join,node.stroke?.miterLimit,...options.fontForRun?[node,context]:[]]),cached=cache.get(key);
  if(cached){cache.delete(key);cache.set(key,cached);hits++;return structuredClone(cached.value);}
  busy=true;let completed!:()=>void;pending=new Promise<void>(done=>{completed=done;});
  try{
   let prepared=await typography.prepareParagraph(text,{font,fontSize,width,lineHeight,baseline:fontSize,wrap:node.width===undefined?'none':'word',overflow:'error',baseDirection:node.direction??'auto',language:node.language??'und',missingGlyph:'error',tolerance,signal,...node.script?{scriptForRun:item=>item.script??node.script!}:{},...options.fontForRun?{fontForRun:item=>options.fontForRun!(item,node,context)}:{}});
   if(prepared.layout.coordinates.width!==viewport[0]||prepared.layout.coordinates.height!==viewport[1])error2D('E_NATIVE_2D_SERVICE','Typography coordinates must match the scene logical viewport',node.id);
   if(spacing!==0){if(!pathOperations)error2D('E_NATIVE_2D_SERVICE','Cluster tracking needs the admitted original path service',node.id);const tracked=trackParagraphClusters(prepared.index.source,{amount:spacing},context);prepared=await prepareParagraphMeshes(createParagraphIndex(tracked),{pathOperations,tolerance,signal});}
   const metrics=paragraphMetrics(prepared.index),box=metrics.advanceBounds??metrics.inkBounds??{left:0,top:0,right:0,bottom:0},strokePositions:number[]=[];
   if(stroke){if(!pathOperations)error2D('E_NATIVE_2D_SERVICE','Text stroke needs the admitted original path service',node.id);const geometry=createTextLayoutGeometry(prepared.layout);for(const glyph of prepared.index.source.glyphPaths){const mesh=await prepareSolidPathStroke(geometry.orientGlyphPath(glyph.glyphIndex,glyph.path),{pathOperations,width:stroke,cap:node.stroke?.cap,join:node.stroke?.join,miterLimit:node.stroke?.miterLimit,tolerance,signal});for(const n of mesh.positions)strokePositions.push(n);}}
   const fontIdentities=[...new Map(prepared.fontInstances.map(f=>[JSON.stringify(f.source),f.source])).values()],value:PreparedText2D={mesh:{positions:prepared.positions},...stroke?{strokeMesh:{positions:strokePositions}}:{},layout:prepared.layout,bounds:{left:box.left,top:box.top,right:box.right,bottom:box.bottom},baseline:prepared.layout.lines[0]?.baseline??fontSize,diagnostics:prepared.diagnostics,fontIdentities};
   if(signal?.aborted)error2D('E_RENDER_CANCELLED','Text preparation cancelled');preparations++;
   const count=JSON.stringify(value).length*2+key.length*2;while(cache.size&&bytes+count>max){const first=cache.keys().next().value!,old=cache.get(first)!;cache.delete(first);bytes-=old.bytes;}if(count<=max){cache.set(key,{value:structuredClone(value),bytes:count});bytes+=count;}
   return value;
  }finally{busy=false;completed();}
 }}};
 return {services,inspect:()=>({closed,busy,preparations,hits,cacheEntries:cache.size,logicalCacheBytes:bytes,maxCacheBytes:max,ownership:'borrowed providers; owned data cache',physicalMemory:'unknown'}),dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pending;cache.clear();bytes=0;})();}};
}
