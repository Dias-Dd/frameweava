import {EngineError} from '../../../src/core/errors.ts';
import {assertColor,linear709} from '../../../src/media/surface.ts';
import {exrSelection,type ExrSelection} from '../../../src/media/exr-selection.ts';
import type {ColorEncoding,AlphaMode} from '../../../src/media/surface.ts';
import {defineNativeStage,type NativeStageInit} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeRasterResource} from '../../native-gpu/resources.ts';
import {createImageTools,authoringError,active,abortSignal} from './runtime.ts';
import type {ImageEffect,ImageSource,ImageStageFrame} from './types.ts';

export interface ImageResourceOptions {
  decode?:NativeRasterResource['decode'];width?:number;height?:number;
  color?:ColorEncoding;format?:'rgba16float'|'rgba32float';alpha?:AlphaMode;
  missingProfile?:'error'|'assume-srgb';
}
/** Defaults to Stage dimensions, scene-linear Rec709/F32/PM. Untagged SDR input
 * is explicitly interpreted as sRGB by this helper; choose missingProfile:error
 * for strict profile admission. This ID grants no filesystem/network access. */
export function imageResource(id:string,options:ImageResourceOptions={}):ImageSource {
  if(typeof id!=='string'||!id.length)authoringError('resource.id','expected a declared Resource ID');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['decode','width','height','color','format','alpha','missingProfile'].includes(k)))authoringError('resource.options','unknown image resource option');
  const config={...options,color:options.color?{...options.color}:undefined};
  return frame=>frame.resource({version:1,id,decode:config.decode??'icc-sdr',output:{width:config.width??frame.init.width,height:config.height??frame.init.height,color:config.color??linear709,format:config.format??'rgba32float',alpha:config.alpha??'premultiplied'},...(config.decode??'icc-sdr')==='icc-sdr'?{missingProfile:config.missingProfile??'assume-srgb'}:{}});
}
export interface ExrResourceOptions {
  selection:ExrSelection;color:ColorEncoding;alpha:AlphaMode;
  width?:number;height?:number;format?:'rgba16float'|'rgba32float';
}
/** Select a scene-linear color contribution from a declared original EXR. */
export function exrResource(id:string,options:ExrResourceOptions):ImageSource {
  if(typeof id!=='string'||!id.length)authoringError('resource.id','expected a declared Resource ID');
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['selection','color','alpha','width','height','format'].includes(k)))authoringError('resource.options','unknown EXR resource option');
  assertColor(options.color);
  const {width,height,format='rgba32float',alpha,color:{...color}}=options;
  if(color.transfer!=='linear'||color.reference!=='scene'||!['opaque','straight','premultiplied'].includes(alpha))authoringError('resource.options','EXR requires explicit scene-linear color and Alpha interpretation');
  const selection=exrSelection(options.selection);
  return frame=>frame.resource({version:1,id,decode:'exr',selection,output:{width:width??frame.init.width,height:height??frame.init.height,format,alpha,color}});
}
export interface ImageStagePreparation<I,P> {source?:ImageSource<ImageStageFrame<I,P>>;dispose?():void|Promise<void>}
export interface ImageStageOptions<I,P> {
  source?:ImageSource<ImageStageFrame<I,P>>;
  /** Once per Stage: compile a custom shader or prepare an admitted service.
   * Images are still created during renderAt, as required by the existing API. */
  prepare?:(init:NativeStageInit)=>ImageStagePreparation<I,P>|Promise<ImageStagePreparation<I,P>>;
  signal?:AbortSignal;
}
/** Optional convenience over defineNativeStage; ordinary low-level Stages and
 * createImageTools remain available without JSX or a new execution model. */
export function imageStage<I=Record<string,GpuPixelImage>,P=Record<string,never>>(effect:ImageEffect<ImageStageFrame<I,P>>,options:ImageStageOptions<I,P>={}){
  if(typeof effect!=='function')authoringError('effect','expected a function');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['source','prepare','signal'].includes(k))||options.source!==undefined&&typeof options.source!=='function'||options.prepare!==undefined&&typeof options.prepare!=='function'||options.signal!==undefined&&!abortSignal(options.signal))authoringError('stage.options','expected source, prepare and optional platform AbortSignal');
  return defineNativeStage<I,P>(async init=>{active(options.signal);const tools=createImageTools(init);let prepared:ImageStagePreparation<I,P>|undefined,source:ImageSource<ImageStageFrame<I,P>>|undefined,closing:Promise<void>|undefined;
    try{prepared=await options.prepare?.(init);if(prepared!==undefined&&(!prepared||typeof prepared!=='object'||Array.isArray(prepared)||Object.keys(prepared).some(k=>!['source','dispose'].includes(k))||prepared.source!==undefined&&typeof prepared.source!=='function'||prepared.dispose!==undefined&&typeof prepared.dispose!=='function'))authoringError('prepare','expected source and optional dispose functions');source=prepared?.source??options.source;if(source?.prepare!==undefined&&typeof source.prepare!=='function')authoringError('source.prepare','expected a function');if(source)await tools.prepareSource(source,{signal:options.signal});await tools.prepareSources(effect.sources??[],{signal:options.signal});await tools.prepareAssets(effect.assets??[],{signal:options.signal});}catch(error){await tools.dispose();if(typeof prepared?.dispose==='function')await prepared.dispose();throw error;}
    return {async renderAt(context,inputs,props){
      const enrich=(frame:Parameters<ImageSource>[0]):ImageStageFrame<I,P>=>({...frame,context,inputs,props});
      return tools.apply(source??(async()=>{if(!inputs||typeof inputs!=='object'||!('image'in inputs))throw new EngineError('E_IMAGE_SOURCE_MISSING','imageStage needs inputs.image or an explicit source',{frame:context.frame,hint:'Connect inputs={{image: ref("source")}} with inputTypes={{image:"surface"}}, or use imageResource("asset-id").'});return inputs.image as GpuPixelImage;}),effect,{context,signal:options.signal},enrich);
    },dispose(){return closing??=(async()=>{try{await tools.dispose();}finally{await prepared?.dispose?.();}})();}};
  });
}
