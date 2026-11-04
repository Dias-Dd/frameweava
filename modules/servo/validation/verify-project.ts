import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
if(!process.env.FRAMEWEAVE_SERVO_RUNTIME)throw Error('Explicit reviewed-local Servo runtime required');
const project=resolve('modules/servo/examples/chain.tsx'),build=await buildProject(project);
const renderer=await Renderer.create(build,{nativeGpu:{executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),dynamic:'interactive',slots:1}});
try{
 const results:number[][]=[],times:number[]=[];
 for(const frame of [0,11,0]){
  const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;times.push(performance.now()-begin);
  const internal=renderer as any,output=internal.nativePlan.program.passes.at(-1).output;
  const {pixels}=await internal.nativeClient.inspectForTest(ticket.slot,output);results.push(pixels);
 }
 assert.deepEqual(results[0],results[2]);assert.notDeepEqual(results[0],results[1]);
 const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.nativeModules.instances,2);assert.equal(stats.nativeModules.calls,6);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);
 const result={version:1,project,frames:[0,11,0],repeatedFrameExact:true,newFrameChanged:true,completeRendererMs:times,stats};
 await writeFile(resolve('artifacts/servo-module/real-tsx.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await renderer.close();}
