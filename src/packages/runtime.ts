import {EngineError} from '../core/errors.ts';
import type {ModuleFormat,Capability} from './manifest.ts';
import {nativeScopeEvidence} from '../../modules/native-gpu/provenance.ts';

export interface RuntimeModule {format:ModuleFormat;resourceId?:string;integrity:string}
export interface RuntimePackage {
  /** Present only for an actually used hardware-required binding. */
  gpu?:'required';
  gpuApi?:'webgpu'|'webgl2'|'native-wgpu';
  integrity:string;source:{kind:'local';authority:string};capabilities:Capability[];
  modules:Record<string,RuntimeModule>;dependencies:Record<string,string>;
}
export interface LoadedModules {
  javascript:Record<string,unknown>;
  wasm:WebAssembly.Instance;
  wgsl:string;
  resource:Uint8Array;
}
export interface ModuleRequest<K extends ModuleFormat=ModuleFormat> {module:string;format:K;dependency?:string}
export type ModuleLoader=<K extends ModuleFormat>(request:ModuleRequest<K>)=>Promise<LoadedModules[K]>;
export type JavascriptLoaders=Record<string,()=>Promise<Record<string,unknown>>>;

/** Stage-local caches. WASM instances/memory and JS namespaces never cross a Stage boundary. */
export function packageModuleLoader(owner:string|undefined,packages:Record<string,RuntimePackage>,javascript:JavascriptLoaders,resources:Record<string,string>,options:{nativeGpu?:unknown;readModuleBytes?:(request:{version:1;packageRef:string;module:string;resourceId:string;format:Exclude<ModuleFormat,'javascript'>;expectedIntegrity:string})=>Promise<Uint8Array>}={}):ModuleLoader {
  const cache=new Map<string,Promise<LoadedModules[ModuleFormat]>>();
  return <K extends ModuleFormat>(request:ModuleRequest<K>):Promise<LoadedModules[K]>=>{
    const failed=(message:string,code='E_PACKAGE_MODULE')=>Promise.reject(new EngineError(code,message));
    if(!owner||!packages[owner])return failed('This effect has no declared package modules');
    const ref=request.dependency?packages[owner].dependencies[request.dependency]:owner;
    if(!ref||!packages[ref])return failed(`Undeclared package dependency ${request.dependency}`);
    const pack=packages[ref],module=pack.modules[request.module];
    if(!module||module.format!==request.format)return failed(`${ref}/${request.module}: missing module or incompatible requested format`);
    if(pack.capabilities.includes('webgpu')&&(typeof navigator==='undefined'||!('gpu' in navigator)))return failed(`${ref} requires WebGPU support`,'E_PACKAGE_CAPABILITY');
    if(pack.capabilities.includes('native-gpu')&&!nativeScopeEvidence(options.nativeGpu))return failed(`${ref} requires a hardware-admitted native GPU scope`,'E_PACKAGE_CAPABILITY');
    const key=`${ref}/${request.module}`;
    if(!cache.has(key))cache.set(key,(async()=>{
      if(module.format==='javascript'){
        const load=javascript[key];if(!load)throw new EngineError('E_PACKAGE_MODULE',`Missing JS loader ${key}`);
        return load();
      }
      const url=module.resourceId&&resources[module.resourceId];if(!url)throw new EngineError('E_PACKAGE_MODULE',`Missing resource for ${key}`);
      const bytes=options.readModuleBytes?Uint8Array.from(await options.readModuleBytes({version:1,packageRef:ref,module:request.module,resourceId:module.resourceId!,format:module.format,expectedIntegrity:module.integrity})).buffer:await (async()=>{const response=await fetch(url);if(!response.ok)throw new EngineError('E_PACKAGE_MODULE',`${key} load failed (${response.status})`);return response.arrayBuffer();})();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(`sha256-${hash}`!==module.integrity)throw new EngineError('E_PACKAGE_INTEGRITY',`${key} bytes disagree with the locked module`);
      if(module.format==='wasm'){
        if(typeof WebAssembly==='undefined')throw new EngineError('E_PACKAGE_PERMISSION','WASM requires explicit host authorization');
        if(!pack.capabilities.includes('wasm'))throw new EngineError('E_PACKAGE_CAPABILITY',`${ref} does not declare wasm`);
        const compiled=await WebAssembly.compile(bytes);
        if(WebAssembly.Module.imports(compiled).length)throw new EngineError('E_PACKAGE_PERMISSION',`${key} requires host/WASI imports; core-v1 R1 provides an empty import object`);
        return WebAssembly.instantiate(compiled,{});
      }
      if(module.format==='wgsl')return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return new Uint8Array(bytes);
    })());
    return cache.get(key)! as Promise<LoadedModules[K]>;
  };
}
