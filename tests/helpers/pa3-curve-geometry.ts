import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readPackage} from '../../src/packages/manifest.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {CurveGeometryKernel} from '../../modules/pro-animation/src/curve-geometry/session.ts';
export const geometryKit=resolve('.frameweave/pa3-curve-geometry/kit-reviewed-v1');
export async function directCurveGeometryFactory(options:{signal:AbortSignal}):Promise<CurveGeometryKernel>{
 const build=JSON.parse(await readFile(join(geometryKit,'dist/build.json'),'utf8')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 for(const file of ['lib.rs','curve-base.rs','original-curve.rs'])assert.equal(build.inputs['rust/src/'+file],sha(await readFile('modules/pro-animation/rust/curve-geometry/src/'+file)),'Build current reviewed geometry sources first');
 const record=await readPackage(geometryKit),load:ModuleLoader=async request=>{
  const module=record.manifest.modules[request.module];assert.equal(module?.format,request.format);const file=resolve(geometryKit,module.path),bytes=await readFile(file);assert.equal(sha(bytes),record.moduleIntegrity[request.module]);
  if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;
 };
 const {createEngineApi}=await import(pathToFileURL(join(geometryKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
