import type {FrameContext} from '../../src/core/types.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {EngineError} from '../../src/core/errors.ts';

/** Optional private native-module extension v1; neither P4 ABI nor CPU Surface.
 * Implementations are engine-selected. Authors cannot supply DLLs or handles. */
export interface NativeModuleSource {
 version:1;id:'frameweave.servo';moduleVersion:'0.1.0';profile:'sdr-srgb8';
 execution:'trusted-local';width:number;height:number;input:boolean;
 html:string;javascript?:string;timeoutMs?:number;seed?:number;
}
export interface NativeModule {readonly info:Readonly<NativeModuleSource>}
export interface NativeModuleRunOptions {context:FrameContext;parameters?:Record<string,unknown>;signal?:AbortSignal}
export interface NativeModuleScope {
 createModule(source:NativeModuleSource):Promise<NativeModule>;
 runModule(module:NativeModule,inputs:readonly GpuPixelImage[],options:NativeModuleRunOptions):Promise<GpuPixelImage>;
 releaseModule(module:NativeModule):Promise<void>;
}
export const MODULE_PARAMETER_WORDS=1024;
const fail=(message:string):never=>{throw new EngineError('E_NATIVE_MODULE',message);};
export function nativeModuleSource(source:NativeModuleSource):NativeModuleSource{
 if(!source||Object.keys(source).some(k=>!['version','id','moduleVersion','profile','execution','width','height','input','html','javascript','timeoutMs','seed'].includes(k))||
  source.version!==1||source.id!=='frameweave.servo'||source.moduleVersion!=='0.1.0'||source.profile!=='sdr-srgb8'||source.execution!=='trusted-local'||
  !Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||!Number.isSafeInteger(source.width*source.height*16)||
  typeof source.input!=='boolean'||typeof source.html!=='string'||
  source.javascript!==undefined&&typeof source.javascript!=='string'||
  source.timeoutMs!==undefined&&(!Number.isInteger(source.timeoutMs)||source.timeoutMs<1||!Number.isSafeInteger(source.timeoutMs))||source.seed!==undefined&&(!Number.isInteger(source.seed)||source.seed<0||source.seed>0xffffffff))fail('Expected a bounded, explicitly trusted Servo v1 SDR8 module');
 return Object.freeze({...source});
}
/** Bounded control bytes only. Pixel memory/imports never enter this packet. */
export function nativeModuleParameters(options:NativeModuleRunOptions):number[]{
 const context=options.context;
 if(!context||!Number.isFinite(context.time)||!Number.isFinite(context.frame)||!Number.isSafeInteger(context.globalFrame)||context.globalFrame<0)fail('Finite explicit FrameContext required');
 const value={context,parameters:options.parameters??{}};
 const pending:{value:unknown;exit?:boolean}[]=[{value}],ancestors=new Set<object>();
 while(pending.length){const {value:v,exit}=pending.pop()!;
  if(exit){ancestors.delete(v as object);continue;}
  if(v===null||typeof v==='string'||typeof v==='boolean')continue;
  if(typeof v==='number'){if(!Number.isFinite(v))fail('Module control numbers must be finite');continue;}
  if(!v||typeof v!=='object')return fail('Module control data must be JSON values');if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)return fail('Module control data must be plain JSON values');
  if(ancestors.has(v))fail('Module control data must be acyclic');ancestors.add(v);pending.push({value:v,exit:true});
  for(const item of Object.values(v))pending.push({value:item});
 }
 const bytes=new TextEncoder().encode(JSON.stringify(value));
 if(bytes.length>0xffffffff)fail('Module control length exceeds its u32 wire field');
 const words=new Uint32Array(Math.max(MODULE_PARAMETER_WORDS,1+Math.ceil(bytes.length/4)));words[0]=bytes.length;
 for(let i=0;i<bytes.length;i++)words[1+(i>>2)]|=bytes[i]<<((i&3)*8);
 return Array.from(words);
}
