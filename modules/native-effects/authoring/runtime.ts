import {EngineError} from '../../../src/core/errors.ts';
import type {NativeStageInit} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeImageProcessOptions} from '../images.ts';
import type {ImageEffect,ImageEffectFactory,ImageFrame,ImageInput,ImageProcessor,ImageSource,ImageAsset} from './types.ts';

export function authoringError(path:string,message:string):never {
  throw new EngineError('E_IMAGE_AUTHORING_PARAMETER',`${path}: ${message}`,{details:{path},hint:'Use a named image effect or an ordinary (image, frame) function.'});
}
export function active(signal?:AbortSignal){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Image effect recording cancelled');}
export function abortSignal(value:unknown):value is AbortSignal{return typeof AbortSignal!=='undefined'&&value instanceof AbortSignal;}
export function image(value:GpuPixelImage,path:string){if(!value||typeof value!=='object'||!value.info)authoringError(path,'expected a Stage-local GPU image');return value;}
export function annotate(error:unknown,name:string,index:number,frame:ImageFrame):never {
  if(error instanceof EngineError)throw new EngineError(error.code,error.message,{stageId:error.stageId,frame:error.frame??frame.context?.frame,hint:error.hint,details:{original:error.details,imageEffect:{name,index}}});
  throw new EngineError('E_IMAGE_EFFECT_CALLBACK',`${name}: ${error instanceof Error?error.message:String(error)}`,{frame:frame.context?.frame,details:{imageEffect:{name,index}},hint:'Check the named image operation or custom callback.'});
}

/** Reuses each requested factory once per Stage. Factories retain their own
 * existing scratch/result leases; this coordinator never owns the GPU device. */
export function createImageTools(init:NativeStageInit){
  if(!init?.gpu||init.gpu.capabilities().backend!=='native-wgpu'||init.gpu.capabilities().hardwareVerified!==true)throw new EngineError('E_NATIVE_EFFECTS_DEVICE','Image authoring requires an admitted hardware Native GPU scope');
  const processors=new Map<object,{dispose():Promise<void>}>(),retainedSources=new Set<GpuPixelImage>();
  type Prepared<C extends ImageFrame>={source:ImageSource<C>;dispose?():void|Promise<void>};
  // Each identity stores exactly the result of that source's typed prepare.
  const prepared=new Map<object,Promise<{dispose?():void|Promise<void>}>>();
  const assets=new Map<object,Promise<{value:unknown;dispose?():void|Promise<void>}>>();
  let closed=false,started=false,pending:Promise<GpuPixelImage>|undefined,closing:Promise<void>|undefined;
  function open(){if(closed)throw new EngineError('E_IMAGE_AUTHORING_CLOSED','Image tools are disposed');}
  function processor<F>(factory:ImageEffectFactory<F>):ImageProcessor<F>{
    if(typeof factory!=='function')authoringError('factory','expected an existing image effect factory');
    // The identity key always stores the result of exactly this typed factory.
    // No effect options, image data or user JSON are cast to a wider contract.
    const cached=processors.get(factory) as ImageProcessor<F>|undefined;if(cached)return cached;
    const result=factory(init);processors.set(factory,result);return result;
  }
  async function release(source:GpuPixelImage){try{await init.gpu.release(source);}catch(error){if(!(error instanceof EngineError)||error.code!=='E_NATIVE_SCOPE')throw error;}}
  async function prepareSource<C extends ImageFrame>(source:ImageSource<C>,options:{signal?:AbortSignal}={}):Promise<Prepared<C>>{
    open();if(started)throw new EngineError('E_IMAGE_SOURCE_INITIALIZATION','Declare image sources before the first frame');
    active(options.signal);if(typeof source!=='function'||source.prepare!==undefined&&typeof source.prepare!=='function')authoringError('sources','expected image source functions with optional prepare');
    const cached=prepared.get(source) as Promise<Prepared<C>>|undefined;if(cached)return cached;
    const task=(async()=>{const result=source.prepare?await source.prepare(init,options):{source};if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).some(k=>!['source','dispose'].includes(k))||typeof result.source!=='function'||result.dispose!==undefined&&typeof result.dispose!=='function'){if(result&&typeof result.dispose==='function')await result.dispose();authoringError('source.prepare.result','expected a source and optional dispose function');}return result;})();prepared.set(source,task);return task;
  }
  async function prepareSources(sources:readonly ImageSource[],options:{signal?:AbortSignal}={}){
    for(const source of sources)await prepareSource(source,options);
  }
  async function prepareAssets(declarations:readonly ImageAsset<unknown>[],options:{signal?:AbortSignal}={}){
    open();if(started)throw new EngineError('E_IMAGE_SOURCE_INITIALIZATION','Declare image assets before the first frame');
    for(const declaration of declarations){open();active(options.signal);if(!declaration||typeof declaration!=='object'||typeof declaration.prepare!=='function')authoringError('asset','expected a typed Stage asset declaration');if(assets.has(declaration)){await assets.get(declaration);continue;}
      const task=(async()=>{const result=await declaration.prepare(init,options);if(!result||typeof result!=='object'||Array.isArray(result)||!Object.hasOwn(result,'value')||Object.keys(result).some(k=>!['value','dispose'].includes(k))||result.dispose!==undefined&&typeof result.dispose!=='function'){if(result&&typeof result.dispose==='function')await result.dispose();authoringError('asset.prepare.result','expected value and optional dispose function');}return result;})();assets.set(declaration,task);await task;
    }
  }
  function apply(input:ImageInput,effect:ImageEffect,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
  function apply<C extends ImageFrame>(input:ImageInput<C>,effect:ImageEffect<C>,options:NativeImageProcessOptions,enrich:(frame:ImageFrame)=>C):Promise<GpuPixelImage>;
  function apply<C extends ImageFrame>(input:ImageInput<C>,effect:ImageEffect<C>,options:NativeImageProcessOptions={},enrich?:(frame:ImageFrame)=>C):Promise<GpuPixelImage>{
    try{open();if(pending)throw new EngineError('E_IMAGE_AUTHORING_BUSY','Await the previous image operation');if(typeof effect!=='function')authoringError('effect','expected a function');if(enrich!==undefined&&typeof enrich!=='function')authoringError('frame','expected a frame enrichment function');if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['context','signal'].includes(k))||options.signal!==undefined&&!abortSignal(options.signal))authoringError('options','expected context and an optional platform AbortSignal; renderer cancellation remains available when the JS host lacks that global');active(options.signal);}catch(error){return Promise.reject(error);}
    started=true;const task=(async()=>{
      for(const source of retainedSources){if(source===input)continue;await release(source);retainedSources.delete(source);}
      const owned=new Set<GpuPixelImage>();if(typeof input!=='function'&&retainedSources.delete(input))owned.add(input);
      const sources=new Map<string,Promise<GpuPixelImage>>(),sourceValues=new Map<object,Promise<GpuPixelImage>>(),operations=new Set<Promise<GpuPixelImage>>();let live=true;
      function track(task:Promise<GpuPixelImage>){operations.add(task);void task.then(()=>operations.delete(task),()=>operations.delete(task));return task;}
      function current(){open();active(options.signal);if(!live)throw new EngineError('E_IMAGE_AUTHORING_FRAME','ImageFrame has expired; use the current renderAt invocation');}
      function resolveInput<F extends ImageFrame>(source:ImageInput<F>,sourceFrame:F):Promise<GpuPixelImage>{current();if(typeof source!=='function')return Promise.resolve(image(source,'input'));let task=sourceValues.get(source);if(!task){task=track((async()=>{const ready=prepared.get(source) as Promise<Prepared<F>>|undefined;if(source.prepare&&!ready)throw new EngineError('E_IMAGE_SOURCE_INITIALIZATION','Source was not declared during Stage init',{hint:'Use a named effect, withImageSources(effect, source), or tools.prepareSources([source]) before rendering.'});const value=ready?(await ready).source:source;current();return image(await value(sourceFrame),'source.result');})());sourceValues.set(source,task);}return task;}
      let fullFrame:C;
      const frame:ImageFrame={init,context:options.context,signal:options.signal,
        process(factory,source,recipe){current();const input=image(source,'input');return typeof factory==='function'?track(processor(factory).processImage(input,recipe,options)):track((async()=>{const ready=await frame.asset(factory);current();return ready.processImage(input,recipe,options);})());},
        generate(factory,recipe){current();return track(processor(factory).generateImage(recipe,options));},
        resource(source){current();const key=JSON.stringify(source);let result=sources.get(key);if(!result){result=track(init.gpu.importResource(source,{signal:options.signal}).then(value=>{owned.add(value);return value;}));sources.set(key,result);}return result;},
        input(source){return resolveInput(source,fullFrame);},
        async asset<T>(declaration:ImageAsset<T>){current();const ready=assets.get(declaration);if(!ready)throw new EngineError('E_IMAGE_SOURCE_INITIALIZATION','Asset was not declared during Stage init',{hint:'Use a named effect, withImageAssets(effect, asset), or tools.prepareAssets([asset]) before rendering.'});const value=await ready;current();return value.value as T;},
      };
      // The three-argument overload fixes C=ImageFrame. Only the typed four-
      // argument overload may add author fields, before any source is evaluated.
      try{fullFrame=enrich?enrich(frame):frame as C;current();const source=await resolveInput(input,fullFrame);current();const result=image(await effect(image(source,'input'),fullFrame),'result');current();if(operations.size)throw new EngineError('E_IMAGE_AUTHORING_PENDING','Await every image operation before returning its frame');if(owned.delete(result))retainedSources.add(result);return result;}
      finally{live=false;await Promise.allSettled([...operations]);const cleanup=await Promise.allSettled([...owned].map(release));const failure=cleanup.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}
    })();pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
  }
  return {apply,prepareSource,prepareSources,prepareAssets,stats:()=>({version:1 as const,completion:'recorded-only' as const,closed,initializedFamilies:processors.size,preparedSources:prepared.size,preparedAssets:assets.size,retainedSources:retainedSources.size}),
    dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pending?.catch(()=>{});const settled=await Promise.allSettled([...processors.values()].map(p=>p.dispose()));processors.clear();const sources=await Promise.allSettled([...retainedSources].map(release));retainedSources.clear();const preparation=await Promise.allSettled([...prepared.values(),...assets.values()]);prepared.clear();assets.clear();const cleanup=await Promise.allSettled(preparation.reverse().filter((r):r is PromiseFulfilledResult<{dispose?():void|Promise<void>}>=>r.status==='fulfilled').map(r=>r.value.dispose?.()));const failure=[...settled,...sources,...cleanup].find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;})();},
  };
}

/** Ordinary sequential function composition. Every original publication stays
 * intact; no image fusion, reordering, readback or replacement shader occurs. */
export function compose<C extends ImageFrame=ImageFrame>(...effects:readonly ImageEffect<C>[]):ImageEffect<C>{
  for(let i=0;i<effects.length;i++)if(typeof effects[i]!=='function')authoringError('effects['+i+']','expected a function');
  const steps=[...effects];const result:ImageEffect<C>=async(input,frame)=>{let result=input;for(let i=0;i<steps.length;i++){active(frame.signal);try{result=image(await steps[i](result,frame),'effects['+i+'].result');}catch(error){annotate(error,steps[i].name||'custom',i,frame);}}active(frame.signal);return result;};return withImageAssets(withImageSources(result,...steps.flatMap(effect=>effect.sources??[])),...steps.flatMap(effect=>effect.assets??[]));
}
/** Declare auxiliary sources for an ordinary custom function. imageStage owns
 * preparation/cleanup; createImageTools users call prepareSources explicitly. */
export function withImageSources<C extends ImageFrame>(effect:ImageEffect<C>,...inputs:readonly ImageInput[]):ImageEffect<C>{
  if(typeof effect!=='function')authoringError('effect','expected a function');
  const sources=new Set<ImageSource>(effect.sources??[]);for(const input of inputs){if(typeof input==='function')sources.add(input);else image(input,'source');}
  const operation:ImageEffect<C>=(image,frame)=>effect(image,frame);Object.defineProperties(operation,{name:{value:effect.name},sources:{value:Object.freeze([...sources])},assets:{value:effect.assets}});return operation;
}
export function withImageAssets<C extends ImageFrame>(effect:ImageEffect<C>,...assets:readonly ImageAsset<unknown>[]):ImageEffect<C>{
  if(typeof effect!=='function')authoringError('effect','expected a function');for(const asset of assets)if(!asset||typeof asset!=='object'||typeof asset.prepare!=='function')authoringError('asset','expected a typed Stage asset declaration');
  const operation:ImageEffect<C>=(image,frame)=>effect(image,frame);Object.defineProperties(operation,{name:{value:effect.name},sources:{value:effect.sources},assets:{value:Object.freeze([...new Set([...(effect.assets??[]),...assets])])}});return operation;
}
/** Bring any compatible existing factory into a plain-function composition.
 * Full factory filter types/options remain inferred, without GPU setup/cleanup. */
export function withEffects<F>(factory:ImageEffectFactory<F>,recipe:(image:GpuPixelImage,filters:F,frame:ImageFrame)=>GpuPixelImage|Promise<GpuPixelImage>):ImageEffect {
  if(typeof factory!=='function'||typeof recipe!=='function')authoringError('withEffects','expected an existing factory and an async recipe');
  return (image,frame)=>frame.process(factory,image,async(source,filters)=>recipe(source,filters,frame));
}
