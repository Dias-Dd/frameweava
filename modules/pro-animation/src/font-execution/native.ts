// SPDX-License-Identifier: Apache-2.0
// Real shape/reflow each explicit frame -> existing canonical geometry -> admitted Native GPU renderer.
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import type {NativeStageInit} from '../../../native-gpu/authoring.ts';
import type {createPathOperations} from '../path-operations.ts';
import type {InspectedFont} from '../typography/fonts.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import {createGlyphAnimator} from '../glyph-animation.ts';
import {prepareLayoutGlyphMeshes} from '../text-animation/geometry.ts';
import {createNativeGlyphRenderer,type NativeGlyphDrawOptions} from '../text-animation/native.ts';
import {shapeVariableRun,type VariableRunOptions,type VariableRun} from './axes.ts';
export interface NativeVariableTextOptions extends VariableRunOptions {text:Signal<string>;draw?:Omit<NativeGlyphDrawOptions,'signal'>}
export function createNativeVariableText(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:InspectedFont;pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>}){
 let closed=false,busy=false,last:VariableRun|undefined;
 return Object.freeze({
  async draw(options:NativeVariableTextOptions,context:FrameContext){if(closed)throw new EngineError('E_PA_TEXT_CLOSED','Variable text disposed');if(busy)throw new EngineError('E_PA_TEXT_BUSY','Await current variable text');const {text,draw,...runOptions}=options;busy=true;
   try{const value=evaluate(text,context);if(typeof value!=='string')throw new EngineError('E_PA_FONT_AXIS','Text Signal must yield Unicode source');const run=await shapeVariableRun(services.font,value,runOptions,context);if(!run.fontInstances.length)throw new EngineError('E_PA_FONT_AXIS','Original font provenance is missing');
    const animator=createGlyphAnimator(graphics,{...run,fontInstance:run.fontInstances[0]}),units=animator.units().map(u=>({...u,direction:run.layout.paragraphs[0].direction})),mesh=await prepareLayoutGlyphMeshes({layout:run.layout,units,glyphPaths:run.glyphPaths,diagnostics:run.diagnostics},{pathOperations:services.pathOperations,tolerance:.02,signal:options.signal}),renderer=createNativeGlyphRenderer(init);
    try{const prepared=await renderer.prepare(mesh),image=await renderer.at(context).draw(prepared,{...draw,signal:options.signal});last=run;return image;}finally{await renderer.dispose();}
   }finally{busy=false;}
  },layout:()=>last,dispose(){if(busy)throw new EngineError('E_PA_TEXT_BUSY','Await current variable text recording');closed=true;last=undefined;},
 });
}
