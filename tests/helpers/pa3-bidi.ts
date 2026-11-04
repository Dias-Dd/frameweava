import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readPackage} from '../../src/packages/manifest.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {TextKernel} from '../../modules/pro-animation/src/text-itemizer.ts';
export const bidiKit=resolve('.frameweave/pa3-bidi/kit-reviewed-v1');
export async function directTextFactory(options:{signal:AbortSignal}):Promise<TextKernel>{
 const build=JSON.parse(await readFile(join(bidiKit,'dist/build.json'),'utf8')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 for(const file of ['lib.rs','analysis.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/text-analysis/src/'+file)),'Build current reviewed text source first');
 const record=await readPackage(bidiKit),load:ModuleLoader=async request=>{const entry=record.manifest.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(bidiKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.moduleIntegrity[request.module]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(bidiKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
