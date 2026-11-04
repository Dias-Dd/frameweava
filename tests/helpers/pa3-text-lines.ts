import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {TextKernel} from '../../modules/pro-animation/src/text-itemizer.ts';
export const textLinesKit=resolve('.frameweave/pa3-text-lines/kit-reviewed-v1');
export async function directTextLinesFactory(options:{signal:AbortSignal}):Promise<TextKernel>{
 const build=JSON.parse(await readFile(join(textLinesKit,'dist/build.json'),'utf8')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 for(const file of ['lib.rs','analysis.rs','original-analysis.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/text-lines/src/'+file)),'Build current reviewed text source first');
 const record=await reviewedKitArtifacts(textLinesKit,resolve('modules/pro-animation/rust/text-lines')),load:ModuleLoader=async request=>{const entry=record.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(textLinesKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.build.outputs[record.modules[request.module].path]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(textLinesKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
