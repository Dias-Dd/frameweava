// SPDX-License-Identifier: Apache-2.0
import type {NativeStageInit} from '../../../../native-gpu/authoring.ts';
import type {FrameContext,Signal} from '../../../../../src/core/types.ts';
import {evaluate} from '../../../../../src/core/animation.ts';
import {EngineError} from '../../../../../src/core/errors.ts';
import type {InspectedFont} from '../../typography/fonts.ts';
import type {ParagraphItemizer} from '../../text-layout/layout.ts';
import type {createPathOperations} from '../../path-operations.ts';
import {prepareGlyphMeshes} from '../../text-animation/geometry.ts';
import {createNativeGlyphRenderer,type NativeGlyphDrawOptions} from '../../text-animation/native.ts';
import {layoutVerticalText,type VerticalTextOptions,type VerticalText} from './layout.ts';
import {renderNativeColrRun} from '../colr/native.ts';
import {prepareEmbeddedFontLayout,createNativeEmbeddedText,type EmbeddedGlyphSource} from '../embedded.ts';
import {checkedInk} from '../../text-styling/ink.ts';
import {affinity} from '../../text-animation/common.ts';
export interface NativeVerticalTextOptions extends Omit<VerticalTextOptions,'itemizer'|'fontSize'|'baseline'|'y'|'paint'|'tsume'> {
 text:Signal<string>;fontSize:Signal<number>;baseline?:Signal<number>;y?:Signal<number>;draw?:Omit<NativeGlyphDrawOptions,'signal'>;
 /** Intrinsic COLR or a declared original embedded table/strike. Default outline. */
 paint?:'outline'|'color'|EmbeddedGlyphSource;paletteIndex?:Signal<number>;
 tsume?:Signal<number>;
}
/** Borrow admitted font/itemizer/path services. Original mesh/Native GPU draw handles ink/Alpha/precision. */
export function createNativeVerticalText(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:InspectedFont;itemizer:ParagraphItemizer;pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>}){
 const caps=init.gpu?.capabilities();if(caps?.backend!=='native-wgpu'||!caps.hardwareVerified)throw new EngineError('E_PA_TEXT_DEVICE','Vertical text requires the admitted Native GPU owner');
 let closed=false,pending:Promise<Awaited<ReturnType<ReturnType<typeof createNativeGlyphRenderer>['draw']>>>|undefined,last:VerticalText|undefined,closing:Promise<void>|undefined;
 const active=()=>{if(closed)throw new EngineError('E_PA_TEXT_CLOSED','Vertical text disposed');};
 async function record(options:NativeVerticalTextOptions,context:FrameContext){
  const {text,fontSize,baseline,y,tsume,draw:inputDraw,paint:inputPaint='outline',paletteIndex,scriptForRun,signal,...raw}=options,{transform,inkForUnit,...drawData}=inputDraw??{},draw={...structuredClone(drawData),transform,inkForUnit},shape={...structuredClone(raw),tsume:tsume===undefined?undefined:evaluate(tsume,context),scriptForRun,signal},paint=typeof inputPaint==='object'?structuredClone(inputPaint):inputPaint,value=evaluate(text,context),size=evaluate(fontSize,context),x=evaluate(baseline??fontSize,context),inline=evaluate(y??0,context);active();signal?.throwIfAborted();
  if(paletteIndex!==undefined&&paint!=='color')throw new EngineError('E_PA_TEXT_VERTICAL','Palette selection belongs to COLR paint');
  const ink=checkedInk(draw.ink?.map(v=>evaluate(v,context))??[1,1,1,1]),format=draw.format??'rgba32float',palette=paletteIndex===undefined?undefined:evaluate(paletteIndex,context);
  const run=await layoutVerticalText(services.font,value,{...shape,itemizer:services.itemizer,fontSize:size,baseline:x,y:inline,paint:typeof paint==='object'?'embedded':paint});active();signal?.throwIfAborted();
  let image:Awaited<ReturnType<ReturnType<typeof createNativeGlyphRenderer>['draw']>>;
  if(paint==='color'&&run.colorGlyphs?.length)image=await renderNativeColrRun(init,services,run,context,{format,foreground:ink,paletteIndex:palette,transform,inkForUnit,signal});
  else if(typeof paint==='object'){
   const prepared=await prepareEmbeddedFontLayout(services.font,run,paint,{signal}),renderer=createNativeEmbeddedText(init,services);active();signal?.throwIfAborted();
   try{image=await renderer.drawRun(prepared,{format,ink,inkForUnit,signal,transform:transform?(unit,c)=>{const pose=transform(unit,c),[a,b,d,e,x,y]=affinity(pose.matrix);return {matrix:[a,b,0,0,d,e,0,0,0,0,1,0,x,y,0,1],opacity:pose.opacity};}:undefined},context);}finally{await renderer.dispose();}
  }else{
   if(paint==='color'&&palette!==undefined&&palette!==0)throw new EngineError('E_PA_FONT_COLOR','The shaped outline-only run has no alternate color palette');
   const mesh=await prepareGlyphMeshes(run,{pathOperations:services.pathOperations,tolerance:.02,signal}),renderer=createNativeGlyphRenderer(init);
   try{const handle=await renderer.prepare(mesh);image=await renderer.at(context).draw(handle,{...draw,signal});}finally{await renderer.dispose();}
  }
  if(closed||signal?.aborted){await init.gpu.release(image);active();signal?.throwIfAborted();}last=run;return image;
 }
 return Object.freeze({draw(options:NativeVerticalTextOptions,context:FrameContext){try{active();if(pending)throw new EngineError('E_PA_TEXT_BUSY','Await current vertical text');}catch(e){return Promise.reject(e);}const task=record(options,context);pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;},layout:()=>last,dispose(){closed=true;return closing??=(async()=>{await pending?.catch(()=>{});last=undefined;})();}});
}
