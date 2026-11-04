import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {EngineError} from '../../src/core/errors.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import {typographyKitIntegrity} from './typography-kit-identity.ts';

export type TypographyKit='font'|'itemizer'|'paths';
const dataRoot=fileURLToPath(new URL('../../modules/pro-animation/typography-kits/',import.meta.url));
const lockFile=new URL('../../modules/pro-animation/typography-kit-lock.json',import.meta.url);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const fail=(message:string):never=>{throw new EngineError('E_TYPOGRAPHY_KIT_INTEGRITY',message);};
const code=(bytes:Uint8Array)=>import('data:text/javascript;base64,'+Buffer.from(bytes).toString('base64'));
/** Fixed SDK factories only. Verify/capture every file before executing the
 * bundled factory or glue; data URLs execute those exact verified bytes.
 * This is a trusted SDK loader, not a sandbox for arbitrary executable Kits. */
export async function typographyKitFactories(allowWasm:boolean,signal?:AbortSignal){
 if(allowWasm!==true)throw new EngineError('E_PACKAGE_PERMISSION','Typography preparation requires explicit allowWasm:true');
 if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Typography initialization cancelled');
 const lockBytes=await readFile(lockFile);if(hash(lockBytes)!==typographyKitIntegrity)fail('Typography Kit lock differs from the fixed SDK identity');
 const lock=JSON.parse(lockBytes.toString('utf8'));if(lock.schemaVersion!==1||lock.id!=='frameweave.typography-kits'||lock.version!=='1.0.0')fail('Unsupported typography Kit lock');
 const factories=new Map<TypographyKit,(control:{signal?:AbortSignal})=>Promise<Record<string,any>>>();
 for(const id of ['font','itemizer','paths'] as const){
  const entry=lock.kits[id];if(!entry||!entry.files||!entry.modules)fail('Missing fixed typography Kit '+id);
  const root=resolve(dataRoot,id);if(await realpath(root)!==root)fail('Typography Kit root cannot be a link');
  const files=new Map<string,Uint8Array>();
  for(const [name,expected]of Object.entries(entry.files)){
   signal?.throwIfAborted();const path=resolve(root,name),rel=relative(root,path);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await lstat(path)).isSymbolicLink()||await realpath(path)!==path)fail('Typography Kit path escapes its fixed SDK root');
   const bytes=await readFile(path);if(typeof expected!=='string'||hash(bytes)!==expected)fail('Typography Kit bytes changed: '+id+'/'+name);files.set(name,Uint8Array.from(bytes));
  }
  if(!files.has(entry.api)||hash(files.get('dist/generated/module_bg.wasm')!)!==entry.wasm)fail('Typography factory/WASM identity mismatch');
  const namespace=await code(files.get(entry.api)!);if(typeof namespace.createEngineApi!=='function')fail('Missing typography Kit factory');
  const load:ModuleLoader=async request=>{
   if(request.dependency)fail('Typography Kits declare no cross-package dependencies');
   const module=entry.modules[request.module],bytes=module&&files.get(module.path.replace(/^\.\//,''));
   if(!module||module.format!==request.format||!bytes)fail('Undeclared typography Kit module '+request.module);
   if(request.format==='javascript'){if(request.module!=='binding')fail('Only the sealed Kit binding is executable');return code(bytes) as any;}
   if(request.format!=='resource')fail('Typography clients load only sealed binding/profile/resource bytes');return Uint8Array.from(bytes) as any;
  };
  factories.set(id,control=>namespace.createEngineApi(load,{worker:false,signal:control.signal}));
 }
 return factories;
}
