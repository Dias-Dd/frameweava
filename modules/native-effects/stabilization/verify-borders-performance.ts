import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {nativeExecutable} from '../../native-gpu/executable.ts';
const out=resolve(process.env.FRAMEWEAVE_BORDER_RUN!),rows:object[]=[],save=(n:string,v:unknown)=>writeFile(join(out,n),JSON.stringify(v,null,2)+'\n');
const native=await nativeExecutable(),power=(await promisify(execFile)('powercfg',['/getactivescheme'],{windowsHide:true,encoding:'utf8'})).stdout.trim();
try{
 for(const size of ['1080','4k']){
  const start=performance.now(),build=await buildProject(resolve('modules/native-effects/examples/stabilization-borders-'+size+'.tsx')),compileMs=performance.now()-start,begin=performance.now(),r=await Renderer.create(build,{cache:false,nativeGpu:{executable:native,dynamic:'interactive',slots:1,maxBytes:6*1024**3},timeoutMs:60000}),initMs=performance.now()-begin,times:number[]=[];
  try{
   const frames=[0,1,1,0];for(const frame of frames){const now=performance.now();await(await r.submitNativeFrame(frame)).completed;times.push(performance.now()-now);}
   const stats=await r.nativeStats();assert.equal(stats.capabilities.hardwareVerified,true);assert.equal(stats.devicesCreated,1);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.imageReadbacks,0);assert.equal(stats.bufferExports.readbacks,0);
   const warm=times.slice(1).sort((a,b)=>a-b);rows.push({entry:'modules/native-effects/examples/stabilization-borders-'+size+'.tsx',width:build.manifest.composition.width,height:build.manifest.composition.height,compileMs,initMs,frames,rawMs:times,coldMs:times[0],warm:{samples:3,medianMs:warm[1],p95Ms:warm[2],minMs:warm[0],maxMs:warm[2]},stats});await save('progress.json',rows);
  }finally{await r.close();await r.nativeExited();}
 }
 await save('result.json',{ok:true,power,rows,timing:'Actual complete four-plate analysis/path + nine-strength all-observation framing search + unscaled crop + preserve-scale global/mesh + temporal border synthesis to ticket.completed. No diagnostic readback, cache false, repeat executes again. No unlike-workload speedup claim. Four samples per resolution are preliminary observations, not a stable throughput distribution.'});
 console.log(JSON.stringify({ok:true,rows:rows.length}));
}catch(error){await save('result.json',{ok:false,rows,error:String(error)});throw error;}
