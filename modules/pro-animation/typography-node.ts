import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {EngineError} from '../../src/core/errors.ts';
import * as graphics from '../graphics-contracts/index.ts';
import type {Coordinates2D,ResourceReference} from '../graphics-contracts/types.ts';
import {coordinates2D} from '../graphics-contracts/validate.ts';
import {typographyKitFactories} from './typography-kit-loader.ts';
import {createFontExecutionFontFromKernel,type FontExecutionKernel} from './src/font-execution/kernel.ts';
import type {InspectedFont} from './src/typography/fonts.ts';
import {createTextItemizerFromKernel,type TextKernel,type TextItem} from './src/text-itemizer.ts';
import {createPathOperationsFromKernel,type PathOpsKernel} from './src/path-operations.ts';
import {layoutParagraph,type ParagraphOptions} from './src/text-layout/layout.ts';
import {createParagraphIndex} from './src/text-layout/queries.ts';
import {prepareParagraphMeshes,type PreparedParagraphMeshes} from './src/text-layout/native.ts';

type FontInstance={id:string;faceIndex?:number;variations?:Readonly<Record<string,number>>};
export type TypographyFont=FontInstance&(
 | {path:string;sha256?:string;bytes?:never;source?:never;font?:never}
 | {bytes:Uint8Array;source:ResourceReference;path?:never;sha256?:never;font?:never}
 | {font:InspectedFont;path?:never;bytes?:never;source?:never;sha256?:never}
);
export interface TypographyOptions {allowWasm:true;coordinates:Coordinates2D;fonts:readonly TypographyFont[];signal?:AbortSignal}
export type TypographyParagraphOptions=Omit<ParagraphOptions,'font'|'fontForRun'|'itemizer'>&{
 font?:string;fontForRun?:(item:TextItem)=>string;tolerance?:number;gridSize?:number;
};
const error=(code:string,message:string):never=>{throw new EngineError(code,message);};
const cancelled=(signal?:AbortSignal)=>{if(signal?.aborted)error('E_RENDER_CANCELLED','Typography preparation cancelled');};
/** Explicit Node preparation over the existing owned font/itemizer/path
 * clients. No GPU, OS font discovery, network or new font algorithms. */
export async function createTypography(options:TypographyOptions){
 if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['allowWasm','coordinates','fonts','signal'].includes(k)))error('E_TYPOGRAPHY_ARGUMENT','Use documented typography options');
 if(options.allowWasm!==true)error('E_PACKAGE_PERMISSION','Typography preparation requires explicit allowWasm:true');
 if(!Array.isArray(options.fonts)||!options.fonts.length)error('E_TYPOGRAPHY_FONT','Declare at least one font; system font discovery is not used');
 const life=options.signal;cancelled(life);
 const coordinates=coordinates2D(structuredClone(options.coordinates)),declared=options.fonts.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v))return error('E_TYPOGRAPHY_FONT','Each declared font must be an object');return {...v,bytes:v.bytes===undefined?undefined:Uint8Array.from(v.bytes),source:structuredClone(v.source),variations:structuredClone(v.variations)};});
 const control=new AbortController(),abort=()=>control.abort();life?.addEventListener('abort',abort,{once:true});
 const owned:{dispose():Promise<unknown>}[]=[],fonts=new Map<string,InspectedFont>(),sources:Record<string,{ownership:'owned'|'borrowed';source:ResourceReference;faceIndex:number;variations:Readonly<Record<string,number>>}>=Object.create(null);
 let itemizer:Awaited<ReturnType<typeof createTextItemizerFromKernel>>,paths:Awaited<ReturnType<typeof createPathOperationsFromKernel>>;
 let closed=false,failed=false,pending:Promise<PreparedParagraphMeshes>|undefined,closing:Promise<void>|undefined,prepared=0,cleanupResults:unknown[]=[];
 async function cleanup(){const results=await Promise.allSettled(owned.map(v=>v.dispose()));cleanupResults=results.map(r=>r.status==='fulfilled'?r.value:{error:String(r.reason)});owned.length=0;life?.removeEventListener('abort',abort);const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Typography cleanup failed');}
 try{
  const factories=await typographyKitFactories(true,control.signal);
  for(const value of declared){
   cancelled(control.signal);if(!value||typeof value.id!=='string'||!value.id||fonts.has(value.id)||Object.keys(value).some(k=>!['id','path','sha256','bytes','source','font','faceIndex','variations'].includes(k)))error('E_TYPOGRAPHY_FONT','Use unique declared font IDs and documented source fields');
   let font:InspectedFont;
   if(value.font){if(value.path!==undefined||value.bytes!==undefined||value.source!==undefined||value.faceIndex!==undefined||value.variations!==undefined||typeof value.font.shapeRun!=='function')error('E_TYPOGRAPHY_FONT','Borrowed fonts retain their existing instance and ownership');font=value.font;}
   else{
    if(value.path!==undefined&&(typeof value.path!=='string'||!value.path||value.bytes!==undefined||value.source!==undefined)||value.path===undefined&&value.sha256!==undefined)error('E_TYPOGRAPHY_FONT','Use one explicit file or byte source per font');
    const bytes=value.path!==undefined?await readFile(resolve(value.path)).catch(e=>{throw new EngineError('E_TYPOGRAPHY_FONT_IO','Cannot read declared font '+value.path,{details:{cause:String(e)}});}):value.bytes instanceof Uint8Array?value.bytes:error('E_TYPOGRAPHY_FONT','Font needs an explicit path or bytes');
    const hash=createHash('sha256').update(bytes).digest('hex');
    if(value.sha256!==undefined&&value.sha256!==hash)error('E_TYPOGRAPHY_FONT_INTEGRITY','Font file does not match its expected SHA256');
    const source:ResourceReference=value.path!==undefined?{kind:'font',resourceId:value.id,sha256:hash,bytes:bytes.byteLength}:structuredClone(value.source!);
    if(source?.kind!=='font'||source.sha256!==hash||source.bytes!==bytes.byteLength)error('E_TYPOGRAPHY_FONT_INTEGRITY','Font bytes and declared Resource identity disagree');
    const kernel=await factories.get('font')!({signal:control.signal}) as unknown as FontExecutionKernel;
    try{font=await createFontExecutionFontFromKernel(kernel,{bytes,source,coordinates,faceIndex:value.faceIndex,variations:value.variations,signal:control.signal});}catch(e){await kernel.dispose();throw e;}
    owned.push(font);
   }
   fonts.set(value.id,font);sources[value.id]={ownership:value.font?'borrowed':'owned',...structuredClone(font.instance)};
  }
  const text=await factories.get('itemizer')!({signal:control.signal}) as unknown as TextKernel;
  try{itemizer=await createTextItemizerFromKernel(graphics,text,{signal:control.signal});}catch(e){await text.dispose();throw e;}owned.push(itemizer);
  const path=await factories.get('paths')!({signal:control.signal}) as unknown as PathOpsKernel;
  try{paths=await createPathOperationsFromKernel(graphics,path);}catch(e){await path.dispose();throw e;}owned.push(paths);cancelled(control.signal);
 }catch(e){try{await cleanup();}catch(cleanupError){throw new AggregateError([e,cleanupError],'Typography initialization and cleanup failed');}throw e;}
 function getFont(id:string):InspectedFont{const font=fonts.get(id);if(!font)return error('E_TYPOGRAPHY_FONT','Unknown declared font '+id);return font;}
 return {
  /** A prepared cue can be retained/reused by the caller. There is no hidden
   * per-frame shaping or unbounded cache of every subtitle in the video. */
  prepareParagraph(text:string,parameters:TypographyParagraphOptions):Promise<PreparedParagraphMeshes>{
   if(closed)return Promise.reject(new EngineError('E_TYPOGRAPHY_CLOSED','Typography provider is closed'));
   if(failed)return Promise.reject(new EngineError('E_TYPOGRAPHY_FAILED','Cancelled typography clients require a fresh provider'));
   if(pending)return Promise.reject(new EngineError('E_TYPOGRAPHY_BUSY','Await the previous paragraph preparation'));
   const task=(async()=>{
    if(!parameters||typeof parameters!=='object')error('E_TYPOGRAPHY_ARGUMENT','Declare paragraph width and options');
    const {font,fontForRun,tolerance,gridSize,signal:querySignal,...layout}=parameters;
    const signal=querySignal?AbortSignal.any([control.signal,querySignal]):control.signal;cancelled(signal);
    const selected=font??(fonts.size===1?[...fonts.keys()][0]:error('E_TYPOGRAPHY_FONT','Choose a font explicitly when several fonts are declared'));
    try{const paragraph=await layoutParagraph(text,{...layout,font:getFont(selected),fontForRun:fontForRun?item=>getFont(fontForRun(item)):undefined,itemizer,signal});const mesh=await prepareParagraphMeshes(createParagraphIndex(paragraph),{pathOperations:paths,tolerance,gridSize,signal});cancelled(signal);prepared++;return mesh;}
    catch(e){if(signal.aborted){failed=true;throw new EngineError('E_RENDER_CANCELLED','Typography preparation cancelled; reopen the provider');}throw e;}
   })();pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
  },
  /** Borrow a declared font for another compatible service. Its owner retains
   * disposal; the borrower must not close it. */
  font(id:string){if(closed)error('E_TYPOGRAPHY_CLOSED','Typography provider is closed');return getFont(id);},
  inspect:()=>({closed,failed,busy:Boolean(pending),prepared,ownedClients:owned.length,cleanup:structuredClone(cleanupResults),fonts:structuredClone(sources),kits:'frameweave.typography-kits@1.0.0',execution:'Node/WASM geometry preparation; no GPU'}),
  dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pending?.catch(()=>{});await cleanup();fonts.clear();})();},
 };
}
export type Typography=Awaited<ReturnType<typeof createTypography>>;
