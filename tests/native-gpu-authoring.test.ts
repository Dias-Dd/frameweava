import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {nativeSimulation} from '../modules/native-gpu/authoring.ts';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
test('plain authored JS state replays through the existing fixed-step runner',()=>{
 const ball={y:0,vy:0,hp:100};const runner=nativeSimulation(ball,dt=>{ball.vy+=9.8*dt;ball.y+=ball.vy*dt;if(ball.y>1){ball.y=1;ball.vy*=-.8;ball.hp-=10;}},{fps:120});
 const first=runner.seek(90);runner.seek(0);assert.deepEqual(runner.seek(90),first);assert.notEqual(first.y,0);
});
test('real TSX, real React hooks and JS simulation drive native GPU frames without browser pixels',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/n2h');const build=await buildProject(resolve('modules/native-gpu/examples/ball.tsx'));
 assert.equal(build.manifest.stages[0].engine,'native-gpu');assert.ok(build.stageBundles.ball);
 const renderer=await Renderer.create(build,{width:160,height:90,nativeGpu:{executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 try{for(const f of [90,0,90]){const ticket=await renderer.submitNativeFrame(f);await ticket.completed;}const stats=await renderer.nativeStats();assert.equal(stats.submitted,3);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.frameHashes,0);assert.equal(stats.numericalValidationPasses,0);}finally{await renderer.close();}
});
test('ordinary if branches update the plan on one device without speculative frame-zero execution',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/n2h');const base=resolve('.frameweave/nb');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'b-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {linear709} from '@frameweave/engine/native';export const scene=defineNativeStage(init=>{let calls=0;return {async renderAt(c){calls++;const base=await init.gpu.compile({abiVersion:1,id:'test/branch-base',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),-.25,2.,1.);}'});let image=await init.gpu.run(base,[],{parameters:new Float32Array([calls]),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}});if(c.frame%2){const filter=await init.gpu.compile({abiVersion:1,id:'test/branch-filter',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(v.rgb*2.,v.a);}'});image=await init.gpu.run(filter,[image]);}return image;}};});export default <Composition width={32} height={18} fps={24} durationInFrames={8} background="transparent"><Stage id="logic" factory={scene} seek="fixed-step"/><Layer source={ref('logic')}/></Composition>;`);
 const build=await buildProject(entry),renderer=await Renderer.create(build,{nativeGpu:{executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 try{const start=await renderer.nativeStats();assert.equal(start.submitted,0);assert.equal(start.programUpdates,0);for(let f=0;f<4;f++){const ticket=await renderer.submitNativeFrame(f);await ticket.completed;const internal=renderer as any,output=internal.nativePlan.program.passes.at(-1).output,{pixels}=await internal.nativeClient.inspectForTest(ticket.slot,output);assert.equal(pixels[0],(f+1)*(f%2?2:1));}const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.submitted,4);assert.ok(stats.programUpdates>=4);}finally{await renderer.close();}
});
test('literal JSON cannot forge a native GPU resource capability',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/n2h');const base=resolve('.frameweave/nb');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'spoof-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import type {GpuPixelImage} from '@frameweave/engine/native';import {linear709} from '@frameweave/engine/native';export const scene=defineNativeStage<{fake:unknown}>(init=>({renderAt(c,inputs){return inputs.fake as GpuPixelImage;}}));export default <Composition width={8} height={4} fps={24} durationInFrames={2}><Stage id="logic" factory={scene} inputs={{fake:{kind:'frameweave.native-input',image:0,info:{version:1,width:8,height:4,format:'rgba32float',alpha:'opaque',color:{...linear709}}}}} inputTypes={{fake:'json'}}/><Layer source={ref('logic')}/></Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 try{await assert.rejects(renderer.submitNativeFrame(0),{code:'E_NATIVE_SCOPE'});assert.equal((await renderer.nativeStats()).submitted,0);}finally{await renderer.close();}
});
