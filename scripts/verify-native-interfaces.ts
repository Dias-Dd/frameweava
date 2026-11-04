import assert from 'node:assert/strict';
import {buildProject,Renderer,exportedPositions} from '../src/node.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {resolve} from 'node:path';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';

const out=resolve('artifacts/main-native-interfaces');await mkdir(out,{recursive:true});
const home=await mkdtemp(resolve('.frameweave/main-interface-'));process.env.FRAMEWEAVE_HOME=home;
const build=await buildProject(resolve('modules/native-gpu/examples/interfaces-v1.tsx'));
const renderer=await Renderer.create(build,{nativeGpu:{executable:await nativeExecutable(),dynamic:'interactive'}});
const values=[];
try{
 for(const frame of [0,3,0]){
  const ticket=await renderer.submitNativeFrame(frame);
  values.push(exportedPositions(await renderer.exportNativeBuffer(ticket,'mesh/positions')));
 }
 assert.deepEqual(values[0],[[-.59375,-.625,.5],[.40625,-.625,.5],[-.09375,.625,.5]]);
 assert.deepEqual(values[0],values[2]);assert.notDeepEqual(values[0],values[1]);
 const stats=await renderer.nativeStats();assert.equal(stats.slots,1);assert.equal(stats.persistentState.buffers,1);
 assert.equal(stats.bufferExports.readbacks,3);assert.equal(stats.imageReadbacks,0);
 const stale=await renderer.submitNativeFrame(1);await stale.completed;
 const newer=await renderer.submitNativeFrame(2);await newer.completed;
 await assert.rejects(renderer.exportNativeBuffer(stale,'mesh/positions'));
 await assert.rejects(renderer.exportNativeBuffer({...newer},'mesh/positions'),(e:any)=>e.code==='E_NATIVE_DATA_TICKET');
 const abort=new AbortController();abort.abort();
 await assert.rejects(renderer.exportNativeBuffer(newer,'mesh/positions',{signal:abort.signal}),(e:any)=>e.code==='E_RENDER_CANCELLED');
 assert.equal((await renderer.exportNativeBuffer(newer,'mesh/positions')).values.length,9);
 await writeFile(resolve(out,'result.json'),JSON.stringify({source:process.env.FRAMEWEAVE_TEST_COMMIT,passed:true,frames:[0,3,0],positions:values,stats,staleAndForeignRejected:true,cancelledExportRejected:true},null,2)+'\n');
}finally{await renderer.close();await renderer.close();}
await assert.rejects(renderer.exportNativeBuffer({} as any,'mesh/positions'),(e:any)=>e.code==='E_RENDERER_CLOSED');
console.log('PASS public Renderer resource / readonly image statistics / ordered state / explicit buffer export');
