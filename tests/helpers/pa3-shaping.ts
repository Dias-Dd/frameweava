import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
export const shapingKit=resolve('.frameweave/pa3-shaping/kit');
/** Remove only an exact explicit L-to-start before Z; identical implicit closing edge. */
export function canonicalOutline(raw:ArrayLike<number>):number[]{
 const rows:number[][]=[];for(let i=0;i<raw.length;){const size=({1:3,2:3,3:5,4:7,5:1} as Record<number,number>)[raw[i]];assert.ok(size&&i+size<=raw.length);rows.push(Array.from({length:size},(_,k)=>raw[i+k]));i+=size;}
 let start:number[]|undefined;return rows.flatMap((row,i)=>{if(row[0]===1)start=row.slice(1);if(row[0]===2&&rows[i+1]?.[0]===5&&start&&row[1]===start[0]&&row[2]===start[1])return [];return row;});
}
/** Real official direct client with verified bytes, not a mock shaper. R1/Worker/Stage tests are separate. */
export async function directShapingFactory(options:{signal?:AbortSignal}={}){
 const build=JSON.parse(await readFile(join(shapingKit,'dist/build.json'),'utf8'));
 const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 assert.equal(build.inputs['rust/src/lib.rs'],sha(await readFile('modules/pro-animation/rust/shaping/src/lib.rs')),'Build reviewed shaping sources first');
 const record=await reviewedKitArtifacts(shapingKit,resolve('modules/pro-animation/rust/shaping')),load:ModuleLoader=async request=>{
  const module=record.modules[request.module];assert.equal(module?.format,request.format);const file=resolve(shapingKit,module.path),bytes=await readFile(file);assert.equal(sha(bytes),record.build.outputs[record.modules[request.module].path]);
  if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;
 };
 const {createEngineApi}=await import(pathToFileURL(join(shapingKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}
