import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {SmartMorphKernel} from '../../modules/pro-animation/src/smart-path/kernel.ts';
export const smartMorphKit=resolve('.frameweave/pa3-smart-morph/kit-reviewed-v1');
export async function directSmartMorphFactory(options:{signal:AbortSignal}):Promise<SmartMorphKernel>{
 const build=JSON.parse(await readFile(join(smartMorphKit,'dist/build.json'),'utf8')),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 for(const file of ['lib.rs','upstream-interp.rs','upstream-interp.original.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/smart-morph/src/'+file)),'Build exact reviewed source first');
 assert.equal(sha(await readFile('modules/pro-animation/rust/smart-morph/src/upstream-interp.original.rs')),'07d929d3cbe2d62982de5b1043a386020e859e1be97dd457cd8c1fdda146f362','Exact reviewed upstream bytes');
 const record=await reviewedKitArtifacts(smartMorphKit,resolve('modules/pro-animation/rust/smart-morph')),load:ModuleLoader=async request=>{const entry=record.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(smartMorphKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.build.outputs[entry.path]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(smartMorphKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
