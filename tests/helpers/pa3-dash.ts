import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readPackage} from '../../src/packages/manifest.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {DashKernel} from '../../modules/pro-animation/src/path-dashes.ts';
export const dashKit=resolve('.frameweave/pa3-dash/kit-reviewed-v1');
export async function directDashFactory(options:{signal:AbortSignal}):Promise<DashKernel>{
 const build=JSON.parse(await readFile(join(dashKit,'dist/build.json'),'utf8')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 assert.equal(build.inputs['rust/src/lib.rs'],sha(await readFile('modules/pro-animation/rust/dashes/src/lib.rs')),'Build current reviewed dash source first');
 const record=await readPackage(dashKit),load:ModuleLoader=async request=>{
  const module=record.manifest.modules[request.module];assert.equal(module?.format,request.format);const file=resolve(dashKit,module.path),bytes=await readFile(file);assert.equal(sha(bytes),record.moduleIntegrity[request.module]);
  if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;
 };
 const {createEngineApi}=await import(pathToFileURL(join(dashKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
