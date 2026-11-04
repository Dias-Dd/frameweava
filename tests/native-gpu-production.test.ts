import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {compileNativePlan} from '../modules/native-gpu/program.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {Renderer} from '../src/render/renderer.ts';
test('production binary has no readback command and Renderer hot path has no per-frame validation or pixel transport',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/nh');
 const build=await buildProject(resolve('modules/native-gpu/examples/two-stage.tsx'));
 const executable=resolve('.frameweave/native-target/release/frameweave-native-gpu.exe');
 const renderer=await Renderer.create(build,{width:320,height:180,nativeGpu:{executable}});
 try{
  const tickets=await Promise.all([0,9,3,9].map(frame=>renderer.submitNativeFrame(frame)));
  await Promise.all(tickets.map(t=>t.completed));
  const stats=await renderer.nativeStats();assert.equal(stats.diagnosticsEnabled,false);
  for(const key of ['imageReadbacks','pixelTransferBytes','frameHashes','numericalValidationPasses','blockingGpuWaits','diagnosticReadbacks'])assert.equal(stats[key],0);
  assert.equal(Object.hasOwn(stats,'webBridge'),false);assert.equal(stats.compatibility,undefined);
  assert.equal(stats.completed,4);assert.equal('browserStarted' in renderer.status(),false);
  console.log(JSON.stringify({version:1,scope:'production two Stage functional test, not throughput benchmark',stats}));
 }finally{await renderer.close();}
 const plan=compileNativePlan(build.manifest,{width:16,height:9});
 const client=await NativeGpuClient.create(plan.program,{executable});
 try{await assert.rejects(client.inspectForTest(0,0),{code:'E_NATIVE_PROTOCOL'});assert.equal(client.connected(),false);}finally{await client.close();}
});
