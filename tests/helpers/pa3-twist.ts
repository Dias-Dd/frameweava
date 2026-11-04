import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readPackage} from '../../src/packages/manifest.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {TwistKernel} from '../../modules/pro-animation/src/path-twist.ts';
export const twistKit=resolve('.frameweave/pa3-twist/kit-reviewed-v1');
export async function directTwistFactory(options:{signal:AbortSignal}):Promise<TwistKernel>{
 const build=JSON.parse(await readFile(join(twistKit,'dist/build.json'),'utf8')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 for(const file of ['lib.rs','geometry.rs','algorithm.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/twist/src/'+file)),'Build current reviewed Twist source first');
 const record=await readPackage(twistKit),load:ModuleLoader=async request=>{const entry=record.manifest.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(twistKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.moduleIntegrity[request.module]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(twistKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
