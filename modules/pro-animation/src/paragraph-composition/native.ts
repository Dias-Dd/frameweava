// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';import {evaluate} from '../../../../src/core/animation.ts';
import type {Signal,FrameContext} from '../../../../src/core/types.ts';import type {NativeStageInit} from '../../../native-gpu/authoring.ts';
import type {BidiFont} from '../bidi-line.ts';import type {ParagraphItemizer} from '../text-layout/layout.ts';
import type {createPathOperations} from '../path-operations.ts';
import {createParagraphIndex} from '../text-layout/queries.ts';
import {prepareParagraphMeshes,createNativeParagraphRenderer,type NativeParagraphDrawOptions} from '../text-layout/native.ts';
import {composeParagraph,type ParagraphCompositionOptions,type ComposedParagraph} from './compose.ts';
export interface NativeComposedTextOptions extends Omit<ParagraphCompositionOptions,'font'|'itemizer'|'fontSize'|'width'|'x'|'baseline'> {
 text:Signal<string>;fontSize:Signal<number>;width:Signal<number>;x?:Signal<number>;baseline?:Signal<number>;draw?:Omit<NativeParagraphDrawOptions,'signal'>;
}
/** Same admitted Native owner and formal Paragraph Reader/renderer; no CPU pixels or new scheduler. */
export function createNativeComposedText(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:BidiFont;itemizer:ParagraphItemizer;pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>}){
 let closed=false,pending:Promise<Awaited<ReturnType<ReturnType<typeof createNativeParagraphRenderer>['draw']>>>|undefined,last:ComposedParagraph|undefined,closing:Promise<void>|undefined;
 const active=()=>{if(closed)throw new EngineError('E_PA_TEXT_CLOSED','Composed text disposed');};
 async function record(options:NativeComposedTextOptions,context:FrameContext){
  const {text,fontSize,width,x,baseline,draw,...rest}=options;active();rest.signal?.throwIfAborted();
  const source=await composeParagraph(evaluate(text,context),{...rest,font:services.font,itemizer:services.itemizer,fontSize:evaluate(fontSize,context),width:evaluate(width,context),x:evaluate(x??0,context),baseline:evaluate(baseline??fontSize,context)});active();rest.signal?.throwIfAborted();
  const mesh=await prepareParagraphMeshes(createParagraphIndex(source),{pathOperations:services.pathOperations,tolerance:.02,signal:rest.signal}),renderer=createNativeParagraphRenderer(init);
  try{const handle=await renderer.prepare(mesh),image=await renderer.at(context).draw(handle,{...draw,signal:rest.signal});if(closed||rest.signal?.aborted){await init.gpu.release(image);active();rest.signal?.throwIfAborted();}last=source;return image;}finally{await renderer.dispose();}
 }
 return Object.freeze({draw(options:NativeComposedTextOptions,context:FrameContext){try{active();if(pending)throw new EngineError('E_PA_TEXT_BUSY','Await current paragraph composition');}catch(e){return Promise.reject(e);}const task=record(options,context);pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;},layout:()=>last,dispose(){closed=true;return closing??=(async()=>{await pending?.catch(()=>{});last=undefined;})();}});
}
