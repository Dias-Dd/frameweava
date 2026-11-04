import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {FontMetadataKernel} from '../../modules/pro-animation/src/typography/fonts.ts';
export const fontMetadataKit=resolve('.frameweave/pa3-font-metadata/kit-reviewed-v1');
export async function directFontMetadataFactory(options:{signal:AbortSignal}):Promise<FontMetadataKernel>{
 const build=JSON.parse(await readFile(join(fontMetadataKit,'dist/build.json'),'utf8')),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 for(const file of ['lib.rs','original-shaper.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/font-metadata/src/'+file)),'Build exact reviewed source first');
 assert.equal(sha(await readFile('modules/pro-animation/rust/font-metadata/src/original-shaper.rs')),sha(await readFile('modules/pro-animation/rust/shaping/src/lib.rs')),'Original shaper was not modified');
 const record=await reviewedKitArtifacts(fontMetadataKit,resolve('modules/pro-animation/rust/font-metadata')),load:ModuleLoader=async request=>{const entry=record.modules[request.module];assert.equal(entry?.format,request.format);const file=resolve(fontMetadataKit,entry.path),bytes=await readFile(file);assert.equal(sha(bytes),record.build.outputs[record.modules[request.module].path]);if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;};
 const {createEngineApi}=await import(pathToFileURL(join(fontMetadataKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
