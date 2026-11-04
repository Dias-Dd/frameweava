// SPDX-License-Identifier: Apache-2.0
// Mixed-font metadata adapter only. Existing canonical tessellation and Native glyph renderer perform all work.
import {EngineError} from '../../../../src/core/errors.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import {prepareLayoutGlyphMeshes,type PrepareGlyphOptions} from '../text-animation/geometry.ts';
import {createNativeGlyphRenderer,type NativeGlyphEnvironment,type NativeGlyphDrawOptions,type NativeGlyphHandle} from '../text-animation/native.ts';
import type {GlyphTransformValue} from '../text-animation/common.ts';
import {createParagraphIndex,type ParagraphIndex,type ParagraphCluster} from './queries.ts';
import {fail} from './common.ts';
export async function prepareParagraphMeshes(index:ParagraphIndex,options:Pick<PrepareGlyphOptions,'pathOperations'|'tolerance'|'gridSize'|'signal'>){
 const units=index.clusters.map(c=>({...c,direction:c.paragraphDirection})),mesh=await prepareLayoutGlyphMeshes({layout:index.source.layout,units,glyphPaths:index.source.glyphPaths,diagnostics:index.source.diagnostics},options);return {...mesh,index,fontInstances:index.source.fontInstances};
}
export type PreparedParagraphMeshes=Awaited<ReturnType<typeof prepareParagraphMeshes>>;
declare const brand:unique symbol;
export interface NativeParagraphHandle {readonly [brand]:true;readonly glyphCount:number;readonly lineCount:number}
export interface NativeParagraphDrawOptions extends Omit<NativeGlyphDrawOptions,'transform'> {transform?:(unit:ParagraphCluster,context:FrameContext)=>GlyphTransformValue}
/** Binds the same admitted Native owner once. No pixel kernel, renderer or device is introduced. */
export function createNativeParagraphRenderer(environment:NativeGlyphEnvironment){
 const renderer=createNativeGlyphRenderer(environment),handles=new WeakMap<object,{handle:NativeGlyphHandle;index:ParagraphIndex}>();
 const draw=async(handle:NativeParagraphHandle,options:NativeParagraphDrawOptions,context:FrameContext)=>{
  const prepared=handles.get(handle);if(!prepared)throw new EngineError('E_PA_TEXT_LAYOUT_HANDLE','Paragraph geometry belongs to a different Stage/adapter');
  if(!options||typeof options!=='object'||options.transform!==undefined&&typeof options.transform!=='function')fail('draw options','documented options and pure transform callback');
  const {transform,...rest}=options;return renderer.at(context).draw(prepared.handle,{...rest,transform:transform?(u,c)=>transform(prepared.index.clusters[u.index],c):undefined});
 };
 return {async prepare(geometry:PreparedParagraphMeshes){
  const original=geometry.index,index=createParagraphIndex(original.source,{lineHeight:original.lineHeight,ascent:original.ascent,...original.wordDataAvailable?{words:original.words}:{}}),expected=index.clusters.map(c=>({...c,direction:c.paragraphDirection}));
  if(JSON.stringify(geometry.layout)!==JSON.stringify(index.source.layout)||JSON.stringify(geometry.units)!==JSON.stringify(expected)||JSON.stringify(geometry.fontInstances)!==JSON.stringify(index.source.fontInstances))fail('paragraph preparation','matching canonical layout, original cluster mapping and complete font instances');
  const handle=await renderer.prepare(geometry),result=Object.freeze({glyphCount:geometry.layout.glyphs.length,lineCount:geometry.layout.lines.length}) as NativeParagraphHandle;handles.set(result,{handle,index});return result;
 },draw,at(context:FrameContext){return {draw:(handle:NativeParagraphHandle,options:NativeParagraphDrawOptions={})=>draw(handle,options,context)};},dispose:()=>renderer.dispose()};
}
