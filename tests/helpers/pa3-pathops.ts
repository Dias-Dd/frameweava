import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import * as graphics from '../../modules/graphics-contracts/index.ts';
import {createPathOperations,type PathOpsKernel} from '../../modules/pro-animation/src/path-operations.ts';

export const kit=resolve('.frameweave/pa3-pathops/kit');
/** L0 direct official Kit client, verified component bytes; L1 separately proves real R1/Worker execution. */
export async function directFactory({signal}:{signal:AbortSignal}):Promise<PathOpsKernel>{
 const build=JSON.parse(await readFile(join(kit,'dist/build.json'),'utf8'));
 const actual=createHash('sha256').update(await readFile('modules/pro-animation/rust/pathops/src/lib.rs')).digest('hex');
 assert.equal(actual,build.inputs['rust/src/lib.rs'],'Run the reviewed pathops build; stale WASM is not a valid oracle');
 const record=await reviewedKitArtifacts(kit,resolve('modules/pro-animation/rust/pathops'));
 const load:ModuleLoader=async request=>{
  const module=record.modules[request.module];assert.equal(module?.format,request.format);
  const file=resolve(kit,module.path),bytes=await readFile(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.build.outputs[record.modules[request.module].path]);
  if(request.format==='resource')return new Uint8Array(bytes) as any;
  assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;
 };
 const {createEngineApi}=await import(pathToFileURL(join(kit,'generated/api.ts')).href);
 return createEngineApi(load,{worker:false,signal});
}
export async function operations(){return createPathOperations(graphics,directFactory);}
