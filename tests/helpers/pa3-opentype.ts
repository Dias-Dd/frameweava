import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readPackage} from '../../src/packages/manifest.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {OpenTypeKernel} from '../../modules/pro-animation/src/opentype/index.ts';
export const openTypeKit=resolve('.frameweave/pa3-opentype/kit-reviewed-v1');
export async function directOpenTypeFactory(options:{signal:AbortSignal}):Promise<OpenTypeKernel>{
 const build=JSON.parse(await readFile(join(openTypeKit,'dist/build.json'),'utf8')),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 for(const file of ['lib.rs','original-shaper.rs','original-font-metadata.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/opentype/src/'+file)),'Build exact reviewed source first');
 assert.equal(sha(await readFile('modules/pro-animation/rust/opentype/src/original-shaper.rs')),sha(await readFile('modules/pro-animation/rust/shaping/src/lib.rs')),'Original shaper was not modified');
 assert.equal(sha(await readFile('modules/pro-animation/rust/opentype/src/original-font-metadata.rs')),sha(await readFile('modules/pro-animation/rust/font-metadata/src/lib.rs')),'Original metadata adapter was not modified');
 const record=await readPackage(openTypeKit),load:ModuleLoader=async request=>{const entry=record.manifest.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(openTypeKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.moduleIntegrity[request.module]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(openTypeKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
