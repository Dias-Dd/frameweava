import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {FontExecutionKernel} from '../../modules/pro-animation/src/font-execution/kernel.ts';
export const fontExecutionKit=resolve('.frameweave/pa4-font/kit');
export async function directFontExecutionFactory(options:{signal:AbortSignal}):Promise<FontExecutionKernel>{
 const build=JSON.parse(await readFile(join(fontExecutionKit,'dist/build.json'),'utf8')),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 for(const file of ['lib.rs','original-shaper.rs','original-font-metadata.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/font-execution/src/'+file)),'Build exact reviewed source first');
 assert.equal(sha(await readFile('modules/pro-animation/rust/font-execution/src/original-shaper.rs')),sha(await readFile('modules/pro-animation/rust/shaping/src/lib.rs')),'Original shaper was not modified');
 const record=await reviewedKitArtifacts(fontExecutionKit,resolve('modules/pro-animation/rust/font-execution')),load:ModuleLoader=async request=>{const entry=record.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(fontExecutionKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.build.outputs[record.modules[request.module].path]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(fontExecutionKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
