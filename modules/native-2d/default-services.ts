// SPDX-License-Identifier: Apache-2.0
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {NativePluginInit} from '../../src/plugins/sdk.ts';
import * as graphics from '../graphics-contracts/index.ts';
import {coordinates2D} from '../graphics-contracts/validate.ts';
import {createPathOperationsFromKernel,type PathOpsKernel} from '../pro-animation/src/path-operations.ts';
import {createTextItemizerFromKernel,type TextKernel} from '../pro-animation/src/text-itemizer.ts';
import {createFontExecutionFontFromKernel,type FontExecutionKernel} from '../pro-animation/src/font-execution/kernel.ts';
import type {InspectedFont} from '../pro-animation/src/typography/fonts.ts';
import {layoutParagraph} from '../pro-animation/src/text-layout/layout.ts';
import {createParagraphIndex} from '../pro-animation/src/text-layout/queries.ts';
import {prepareParagraphMeshes} from '../pro-animation/src/text-layout/native.ts';
import {typographyServices2D,type ParagraphProvider2D} from './typography-services.ts';
import type {Services2D} from './types.ts';import {error2D} from './model.ts';

export interface DefaultServices2DOptions {width:number;height:number;signal?:AbortSignal;maxCacheBytes?:number;tolerance?:number}
/** Existing R1 ModuleLoader admits all bytes/glue. No WASM permission, Worker,
 * host, decoder or resource registry is created here. */
export function createDefault2DServices(scope:Pick<NativePluginInit,'loadModule'|'moduleResources'>,options:DefaultServices2DOptions){
 let owned:ReturnType<typeof ownedDefaultServices2D>|undefined,closed=false;
 const acquire=()=>{if(closed)error2D('E_NATIVE_2D_CLOSED','Default services are disposed');return owned??=ownedDefaultServices2D(scope,options);};
 const services:Services2D={pathOperations:{async *booleanPathsStream(...args){yield* acquire().services.pathOperations!.booleanPathsStream(...args);},async *strokePathsStream(...args){yield* acquire().services.pathOperations!.strokePathsStream(...args);}},text:{prepare:(...args)=>acquire().services.text!.prepare(...args)}};
 return {services,inspect:()=>owned?.inspect()??{closed,lazy:true,loadedKits:[],fonts:[],geometry:{preparations:0,hits:0,cacheEntries:0}},dispose(){closed=true;return owned?.dispose()??Promise.resolve();}};
}
function ownedDefaultServices2D(scope:Pick<NativePluginInit,'loadModule'|'moduleResources'>,options:DefaultServices2DOptions){
 const controller=new AbortController(),abort=()=>controller.abort(),signal=controller.signal;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
 const owned:{dispose():unknown}[]=[],initializing:Promise<unknown>[]=[],pendingInitialization=new Set<Promise<unknown>>(),fonts=new Map<string,InspectedFont>(),loaded=new Set<string>();let closed=false,closing:Promise<void>|undefined,defaultLanguage:string|undefined,defaultScript:string|undefined;
 const coordinates=coordinates2D({spaceId:'native-2d',unit:'px',origin:'top-left',x:'right',y:'down',width:options.width,height:options.height});
 const active=()=>{if(closed)error2D('E_NATIVE_2D_CLOSED','Default assets are disposed');if(signal.aborted)error2D('E_RENDER_CANCELLED','Default assets cancelled');};
 async function kernel(id:'font'|'paths'|'itemizer'){
  active();if(typeof WebAssembly==='undefined')error2D('E_PACKAGE_PERMISSION','Default font/path assets require explicit --allow-wasm');
  const prefix='typography'+id[0].toUpperCase()+id.slice(1);
  if(!scope.moduleResources?.[prefix+'Bytes'])error2D('E_NATIVE_2D_SERVICE','Install reviewed native-2d runtime assets or supply explicit borrowed services');
  const api=await scope.loadModule({module:prefix+'Api',format:'javascript'});if(typeof api.createEngineApi!=='function')error2D('E_NATIVE_2D_SERVICE','Missing reviewed PA Kit factory');
  const load:ModuleLoader=async request=>{if(request.dependency)error2D('E_PACKAGE_MODULE','Default Kit has no cross-package module access');return scope.loadModule({...request,module:prefix+request.module[0].toUpperCase()+request.module.slice(1)}) as any;};
  const result=await (api.createEngineApi as Function)(load,{worker:false,signal});if(closed||signal.aborted){await result.dispose();active();}loaded.add(id);return result;
 }
 let paths:Promise<Awaited<ReturnType<typeof createPathOperationsFromKernel>>>|undefined,itemizer:Promise<Awaited<ReturnType<typeof createTextItemizerFromKernel>>>|undefined,fontReady:Promise<void>|undefined;
 function track<T>(promise:Promise<T>){initializing.push(promise);pendingInitialization.add(promise);void promise.then(()=>pendingInitialization.delete(promise),()=>pendingInitialization.delete(promise));return promise;}
 const getPaths=()=>paths??=track((async()=>{const raw=await kernel('paths') as PathOpsKernel;try{const p=await createPathOperationsFromKernel(graphics,raw);owned.push(p);return p;}catch(e){await raw.dispose();throw e;}})());
 const getItemizer=()=>itemizer??=track((async()=>{const raw=await kernel('itemizer') as TextKernel;try{const p=await createTextItemizerFromKernel(graphics,raw,{signal});owned.push(p);return p;}catch(e){await raw.dispose();throw e;}})());
 const getFonts=()=>fontReady??=track((async()=>{
  const encoded=await scope.loadModule({module:'defaultFontConfig',format:'resource'}),config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));
  if(config.schemaVersion!==1||config.defaultFont!=='default'||!Array.isArray(config.fonts)||!config.fonts.length)error2D('E_NATIVE_2D_SERVICE','Malformed admitted font config');
  if(config.defaultLanguage!==undefined&&typeof config.defaultLanguage!=='string')error2D('E_NATIVE_2D_SERVICE','Declared font language must be a BCP47 string');defaultLanguage=config.defaultLanguage;
  if(config.defaultScript!==undefined&&(typeof config.defaultScript!=='string'||!/^[A-Za-z]{4}$/.test(config.defaultScript)))error2D('E_NATIVE_2D_SERVICE','Declared font script must use the original four-letter script tag');defaultScript=config.defaultScript;
  for(const spec of config.fonts){active();if(!spec||typeof spec.id!=='string'||fonts.has(spec.id)||typeof spec.module!=='string')error2D('E_NATIVE_2D_SERVICE','Unique font IDs and declared modules required');const descriptor=scope.moduleResources?.[spec.module];if(!descriptor||descriptor.format!=='resource'||!/^sha256-[a-f0-9]{64}$/.test(descriptor.integrity))error2D('E_NATIVE_2D_SERVICE','Font must be an admitted R1 resource module');
   const raw=await kernel('font') as FontExecutionKernel;
   try{const bytes=await scope.loadModule({module:spec.module,format:'resource'}),font=await createFontExecutionFontFromKernel(raw,{bytes,source:{kind:'font',resourceId:descriptor.resourceId,sha256:descriptor.integrity.slice(7),bytes:bytes.byteLength},coordinates,faceIndex:spec.faceIndex,variations:spec.variations,signal});fonts.set(spec.id,font);owned.push(font);}catch(e){await raw.dispose();throw e;}
  }
 })());
 const pathOperations:NonNullable<Services2D['pathOperations']>={async *booleanPathsStream(...args){active();yield* (await getPaths()).booleanPathsStream(...args);},async *strokePathsStream(...args){active();yield* (await getPaths()).strokePathsStream(...args);}};
 const provider:ParagraphProvider2D={async prepareParagraph(text,parameters){active();await getFonts();const itemizer=await getItemizer(),paths=await getPaths(),{font,fontForRun,tolerance,signal:query,...rest}=parameters;const chosen=(id:string)=>{const f=fonts.get(id);if(!f)error2D('E_NATIVE_2D_SERVICE','Unknown admitted font '+id);return f;};
  const language=rest.language&&rest.language!=='und'?rest.language:defaultLanguage??rest.language;let scriptForRun=rest.scriptForRun;
  // Script variants such as BCP47 Hans are not Unicode's Hani script tag.
  // The font preset explicitly declares its policy; resolved runs stay intact.
  if(!scriptForRun&&defaultScript&&language===defaultLanguage){const preferred=defaultScript;scriptForRun=item=>{if(item.script)return item.script;if(!item.scriptCandidates.length||item.scriptCandidates.includes(preferred))return preferred;return error2D('E_NATIVE_2D_SERVICE','Declared font profile cannot resolve this Unicode script item; choose an explicit script');};}
  const paragraph=await layoutParagraph(text,{...rest,language,scriptForRun,font:chosen(font),fontForRun:fontForRun?item=>chosen(fontForRun(item)):undefined,itemizer,signal:query??signal});return prepareParagraphMeshes(createParagraphIndex(paragraph),{pathOperations:paths,tolerance,signal:query??signal});}};
 const adapter=typographyServices2D({typography:provider,pathOperations,defaultFont:'default',tolerance:options.tolerance,maxCacheBytes:options.maxCacheBytes,signal});
 return {services:adapter.services,inspect:()=>({closed,loadedKits:[...loaded],fonts:[...fonts].map(([id,font])=>({id,instance:font.instance})),geometry:adapter.inspect(),execution:'Original PA WASM geometry + existing Native mesh rendering',ownership:'owns Kit/font clients and geometry cache; borrows R1 loader/GPU'}),dispose(){if(closing)return closing;closed=true;if(adapter.inspect().busy||pendingInitialization.size)controller.abort();return closing=(async()=>{await Promise.allSettled(initializing);await adapter.dispose();const result=await Promise.allSettled([...owned].reverse().map(v=>v.dispose()));owned.length=0;fonts.clear();controller.abort();options.signal?.removeEventListener('abort',abort);const failures=result.filter((v):v is PromiseRejectedResult=>v.status==='rejected');if(failures.length)throw new AggregateError(failures.map(v=>v.reason),'Default native-2d asset cleanup failed: '+failures.map(v=>String(v.reason)).join('; '));})();}};
}
