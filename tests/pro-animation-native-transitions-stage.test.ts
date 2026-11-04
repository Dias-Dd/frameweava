import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';

test('editable TSX gallery uses one native owner, real Layer, Signal and random/repeated 16F/32F frames',{timeout:120000},async()=>{
 const directory=resolve(process.env.FRAMEWEAVE_TRANSITION_VALIDATION_OUT??'.frameweave/pa3-native-transitions');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
 const start=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/native-transition-scene/project.tsx')),compileMs=performance.now()-start;
 assert.equal(build.manifest.stages[0].engine,'native-gpu');const proof:any[]=[];
 for(const format of ['rgba16float','rgba32float']){
  build.manifest.stages[0].props.format=format;const renderer=await Renderer.create(build,{width:320,height:90,nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??resolve(directory,'diagnostics/frameweave-native-gpu.exe')),dynamic:'interactive'}});
  try{let repeated:number[]|undefined;for(const frame of [11,0,23,11]){
   const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   // Existing explicit development diagnostics; never exposed inside the effect.
   const internal=renderer as any,index=internal.nativePlan.program.passes.at(-1).output;
   const {pixels}=await internal.nativeClient.inspectForTest(ticket.slot,index);
   assert.equal(pixels.length,320*90*4);assert.ok(pixels.every(Number.isFinite));
   assert.ok(pixels.some((v:number,i:number)=>i%4!==3&&v<0));assert.ok(pixels.some((v:number,i:number)=>i%4!==3&&v>1));
   assert.ok(pixels.every((v:number,i:number)=>i%4!==3||v>=0&&v<=.9200001));
   if(frame===11){if(repeated)assert.deepEqual(pixels,repeated);repeated=pixels;}
   proof.push({format,frame,wallMs:performance.now()-begin,includesDiagnosticReadback:true});
  }
  const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.submitted,4);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.numericalValidationPasses,0);assert.equal(stats.webBridge.enabled,false);
  const ac=new AbortController();ac.abort();await assert.rejects(renderer.submitNativeFrame(2,{signal:ac.signal}),{code:'E_RENDER_CANCELLED'});
  proof.push({format,stats,browser:'browserStarted' in renderer.status(),scope:'SpiderMonkey executes authored JS; Rust/wgpu makes all image pixels'});
  }finally{await renderer.close();await renderer.close();}
  await assert.rejects(renderer.submitNativeFrame(1),{code:'E_RENDERER_CLOSED'});
 }
 await writeFile(join(directory,'stage.json'),JSON.stringify({schemaVersion:1,compileMs,proof},null,2));
});
