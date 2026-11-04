import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewedKitArtifacts} from '../../modules/pro-animation/validation/review-kit-artifacts.ts';
import type {ModuleLoader} from '../../src/packages/runtime.ts';
import type {CurveKernel} from '../../modules/pro-animation/src/curve-sampler.ts';
export const curveKit=resolve('.frameweave/pa3-curve/kit-reviewed-v1');
export async function directCurveFactory(options:{signal:AbortSignal}):Promise<CurveKernel>{
 const build=JSON.parse(await readFile(join(curveKit,'dist/build.json'),'utf8')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 assert.equal(build.inputs['rust/src/lib.rs'],sha(await readFile('modules/pro-animation/rust/curve-metrics/src/lib.rs')),'Build current reviewed dash source first');
 const record=await reviewedKitArtifacts(curveKit,resolve('modules/pro-animation/rust/curve-metrics')),load:ModuleLoader=async request=>{
  const module=record.modules[request.module];assert.equal(module?.format,request.format);const file=resolve(curveKit,module.path),bytes=await readFile(file);assert.equal(sha(bytes),record.build.outputs[module.path]);
  if(request.format==='resource')return new Uint8Array(bytes) as any;assert.equal(request.module,'binding');return import(pathToFileURL(file).href) as any;
 };
 const {createEngineApi}=await import(pathToFileURL(join(curveKit,'generated/api.ts')).href);return createEngineApi(load,{worker:false,...options});
}

import type {PathCommand,PathData} from '../../modules/graphics-contracts/types.ts';
export function curvePath(rows:([string,...number[]])[],width=1280,height=240):PathData{let n=0;const p=(x:number,y:number)=>({id:'p.'+n++,x,y});return {schema:'frameweave.path',version:1,id:'baseline',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width,height},fillRule:'nonzero',commands:rows.map(([op,...v]):PathCommand=>op==='Z'?{op:'Z'}:op==='Q'?{op:'Q',control:p(v[0],v[1]),point:p(v[2],v[3])}:op==='C'?{op:'C',control1:p(v[0],v[1]),control2:p(v[2],v[3]),point:p(v[4],v[5])}:{op:op as 'M'|'L',point:p(v[0],v[1])})};}
