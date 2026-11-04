// SPDX-License-Identifier: Apache-2.0
// Actual-time preparation only. Existing kurbo, paragraph meshes and GPU draw own algorithms.
import {EngineError} from '../../../../src/core/errors.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import {createCurveSampler,createCurveSamplerFromKernel,type CurveKernel,type CurveKernelFactory} from '../curve-sampler.ts';
import {layoutPathText,pathTextTransform,type PathTextLine,type PathTextFrame,type LayoutPathTextOptions} from '../path-text/index.ts';
import type {NativeParagraphHandle,NativeParagraphDrawOptions,createNativeParagraphRenderer} from '../text-layout/native.ts';
import type {NativeGlyphEnvironment} from '../text-animation/native.ts';
type CurveServices={curveFactory:CurveKernelFactory;curveKernelFactory?:never}|{curveFactory?:never;curveKernelFactory:()=>Promise<CurveKernel>};
export interface PathTextMotionOptions {
 /** A path can await the existing original Morph engine, using this actual context. */
 path:PathData|((context:Readonly<FrameContext>)=>PathData|Promise<PathData>);
 line:PathTextLine;accuracy?:number;layout?:LayoutPathTextOptions;
 signal?:AbortSignal;
}
const fail=(message:string):never=>{throw new EngineError('E_PA_PATH_TEXT_MOTION',message);};
function context(value:FrameContext){const c=structuredClone(value);if(!c||![c.frame,c.time,c.globalFrame,c.globalTime,c.dt,c.progress,c.seed,c.durationInFrames,c.fps?.num,c.fps?.den].every(Number.isFinite)||c.fps.num<=0||c.fps.den<=0)fail('Actual finite Stage context and positive rational fps required');Object.freeze(c.fps);return Object.freeze(c);}
/** No frozen integer-frame table. Every requested path/distance/control resolves at
 * the supplied local and global time, and calls original arclength inversion again. */
export async function preparePathTextAt(options:PathTextMotionOptions,services:CurveServices,value:FrameContext):Promise<PathTextFrame>{
 const c=context(value),{path,line,layout,signal,accuracy}=options;if(Number(typeof services?.curveFactory==='function')+Number(typeof services?.curveKernelFactory==='function')!==1)fail('Exactly one existing curve factory required');if(layout?.signal!==undefined)fail('Use one top-level cancellation signal');const settings=structuredClone({...layout,control:undefined});const control=layout?.control;signal?.throwIfAborted();const geometry=graphics.validatePathData(await (typeof path==='function'?path(c):path));signal?.throwIfAborted();
 const sampler=services.curveKernelFactory?await createCurveSamplerFromKernel(graphics,await services.curveKernelFactory(),geometry,{accuracy,signal}):await createCurveSampler(graphics,services.curveFactory!,geometry,{accuracy,signal});
 try{const frame=await layoutPathText(line,sampler,{...settings,control,signal},c);signal?.throwIfAborted();return frame;}finally{await sampler.dispose();}
}
/** Borrows an already prepared original paragraph renderer and its own handle.
 * It owns only one in-flight preparation and no font, glyph buffer, image history
 * or GPU owner. Its dispose awaits preparation/recording, not device completion. */
export function createNativePathTextMotion(environment:NativeGlyphEnvironment,renderer:Pick<ReturnType<typeof createNativeParagraphRenderer>,'at'>,handle:NativeParagraphHandle,services:CurveServices){
 const caps=environment.gpu?.capabilities();if(caps?.backend!=='native-wgpu'||caps.hardwareVerified!==true)fail('Admitted Native GPU environment required');if(typeof renderer?.at!=='function'||!handle)fail('Existing prepared paragraph renderer/handle required');let closed=false,busy=false,pending:Promise<unknown>|undefined,closing:Promise<void>|undefined,last:PathTextFrame|undefined;
 return Object.freeze({draw(options:PathTextMotionOptions&{draw?:Omit<NativeParagraphDrawOptions,'transform'|'signal'>},value:FrameContext){if(closed||busy)return Promise.reject(new EngineError(closed?'E_PA_PATH_TEXT_MOTION_CLOSED':'E_PA_PATH_TEXT_MOTION_BUSY','Await an open path-text motion operation'));let c:FrameContext,paint:Omit<NativeParagraphDrawOptions,'transform'>;const {draw,...shape}=options;try{c=context(value);if(draw&&(Object.hasOwn(draw,'transform')||Object.hasOwn(draw,'signal')))fail('Path layout owns transforms; use one top-level signal');const {inkForUnit,...data}=draw??{};paint={...structuredClone(data),inkForUnit,signal:shape.signal};}catch(e){return Promise.reject(e);}busy=true;const task=(async()=>{const frame=await preparePathTextAt(shape,services,c);if(closed)fail('Closed during path layout');const image=await renderer.at(c).draw(handle,{...paint,transform:pathTextTransform(frame)});if(closed||shape.signal?.aborted){await environment.gpu.release(image);shape.signal?.throwIfAborted();fail('Closed before publication');}last=frame;return image;})();pending=task;void task.then(()=>{busy=false;pending=undefined;},()=>{busy=false;pending=undefined;});return task;},geometry:()=>last,dispose(){closed=true;return closing??=(async()=>{await pending?.catch(()=>{});last=undefined;})();}});
}
