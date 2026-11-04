import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {buildProject} from '../../../src/compiler/build.ts';import {Renderer} from '../../../src/render/renderer.ts';import {nativeExecutable} from '../../native-gpu/executable.ts';import {cases} from './neural-cases.ts';
const out=resolve(process.env.FRAMEWEAVE_AUTHORING_RUN!),rows:object[]=[],save=(name:string,value:unknown)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');let renderer:Renderer|undefined;
try{
 const start=performance.now(),build=await buildProject(resolve('modules/native-effects/authoring/examples/neural-numeric.tsx')),compileMs=performance.now()-start,opened=performance.now();
 renderer=await Renderer.create(build,{cache:false,timeoutMs:120000,nativeGpu:{executable:await nativeExecutable(),dynamic:'interactive',slots:1,maxBytes:4*1024**3}});const initMs=performance.now()-opened,seen=new Map<number,string>();
 const aborted=new AbortController();aborted.abort();await assert.rejects(()=>renderer!.submitNativeFrame(0,{signal:aborted.signal}));
 for(const frame of [0,1,2,3,100,101,102,103,3,0]){
  await save('active.json',{frame,name:cases[frame%100].name});const started=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const submitToCompletedMs=performance.now()-started;
  const a=await renderer.exportNativeBuffer(ticket,'neural/actual'),b=await renderer.exportNativeBuffer(ticket,'neural/direct');assert.ok(a.values instanceof Float32Array);assert.ok(b.values instanceof Float32Array);assert.ok(a.values.every(Number.isFinite));assert.deepEqual(a.values,b.values);
  const sha256=createHash('sha256').update(a.values).digest('hex');if(seen.has(frame))assert.equal(sha256,seen.get(frame));seen.set(frame,sha256);
  rows.push({frame,name:cases[frame%100].name,format:frame>=100?'rgba16float':'rgba32float',exactRgba:true,sha256,submitToCompletedMs,exportIncludedWallMs:performance.now()-started});await save('progress.json',rows);
 }
 const stats=await renderer.nativeStats();await save('stats.json',stats);assert.equal(stats.devicesCreated,1);assert.equal(stats.capabilities.hardwareVerified,true);assert.equal(stats.inference.runtimeVerified,true);assert.equal(stats.inference.models.length,2,'exactly one encoder/decoder pair for all operations and frames');assert.equal(stats.inference.cpuPixelReadbacks,0);assert.equal(stats.inference.cpuPixelUploads,0);
 for(const model of stats.inference.models){assert.equal(model.runtimeVerified,true);assert.equal(model.executionProfile.cpuFallback,false);assert.ok(Object.keys(model.executionProfile.providers).every(x=>x==='DmlExecutionProvider'));}
 await renderer.close();await renderer.close();await renderer.nativeExited();await save('result.json',{ok:true,compileMs,initMs,rows,allClosed:true,abortedBeforeSubmit:true,scope:'Convenience/original equality; no new neural algorithm or cross-vendor qualification. Numeric buffer exports are deliberate diagnostics.'});
}catch(error){await save('result.json',{ok:false,rows,error:String(error)});throw error;}finally{await renderer?.close();await renderer?.nativeExited();}
