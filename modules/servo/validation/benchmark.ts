// Frozen chain.tsx workload. Latencies include JS recording, module DOM/layout,
// native submissions, interop fences, GPU execution and completion notification.
// They exclude final encoding/readback and physical window presentation.
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {cpus,release,totalmem} from 'node:os';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
if(!process.env.FRAMEWEAVE_SERVO_RUNTIME)throw Error('Explicit frozen Servo bundle required');
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
const project=resolve('modules/servo/examples/chain.tsx'),native=resolve('.frameweave/native-target/release/frameweave-native-gpu.exe');
function deviceState(){try{return execFileSync('nvidia-smi',['--query-gpu=name,driver_version,pstate,temperature.gpu,clocks.gr,clocks.mem,power.draw,power.limit,memory.used,utilization.gpu','--format=csv'],{encoding:'utf8',windowsHide:true}).trim();}catch{return 'unavailable';}}
const environment={osRelease:release(),cpu:cpus()[0]?.model,logicalProcessors:cpus().length,hostMemoryBytes:totalmem(),deviceBefore:deviceState(),powerMode:'unknown',otherGPUWork:'not exclusively reserved; concurrent external load not controlled'};
const started=performance.now(),build=await buildProject(project),compileMs=performance.now()-started;
const samples=[];
function summary(values:number[]){const a=[...values].sort((a,b)=>a-b);return {n:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.ceil(a.length*.95)-1],minMs:a[0],maxMs:a.at(-1),meanMs:a.reduce((n,v)=>n+v,0)/a.length};}
for(const [width,height] of [[1920,1080],[3840,2160]]){
 const start=performance.now(),renderer=await Renderer.create(build,{width,height,nativeGpu:{executable:native,dynamic:'interactive',slots:1}}),initializeMs=performance.now()-start;
 try{
  const once=async(frame:number)=>{const start=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;return performance.now()-start;};
  const firstFrameMs=await once(0),newFrames=[];
  for(let frame=1;frame<24;frame++)newFrames.push({frame,ms:await once(frame)});
  const repeats=[];for(let i=0;i<5;i++)repeats.push({frame:23,ms:await once(23)});
  const random=[];for(const frame of [17,3,11,0])random.push({frame,ms:await once(frame)});
  const stats=await renderer.nativeStats();samples.push({width,height,initializeMs,firstFrameMs,newFrames,newFrame:summary(newFrames.map(v=>v.ms)),repeats,random,stats});
  console.log(JSON.stringify({width,height,initializeMs,firstFrameMs,newFrame:summary(newFrames.map(v=>v.ms)),noPixelTransfer:stats.pixelTransferBytes===0}));
 }finally{await renderer.close();}
}
const report={version:1,workload:'servo-chain-v1/source+Servo DOM text+existing F32 blur(sigma1)+Servo static SVG+existing compositor',projectSha256:createHash('sha256').update(readFileSync(project)).digest('hex'),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain','--','modules/servo','modules/native-gpu'],{encoding:'utf8'}),platform:process.platform,node:process.version,environment:{...environment,deviceAfter:deviceState(),cacheState:'New Renderer and native process at each size; OS file cache warm from functional verification; no cold-machine claim'},nativeReceipt:JSON.parse(readFileSync(resolve('.frameweave/native-target/release/native-build.json'),'utf8')),servoReceipt:JSON.parse(readFileSync(resolve(process.env.FRAMEWEAVE_SERVO_RUNTIME,'servo-runtime.json'),'utf8')),compileMs,samples,memory:{physicalPeakBytes:null,note:'Not measured. Working/shared allocations in stats exclude Servo/driver internal caches.'},limitations:['Only Windows RTX 5070 Laptop tested; power/thermal mode uncontrolled and recorded as unknown','Native owner is optimized release; Servo is the explicitly recorded development build','No before/after speedup or 10ms claim; fresh-frame wall latency is not GPU-only query time','No physical preview scanout or encoder included']};
await writeFile(resolve('artifacts/servo-module/performance.json'),JSON.stringify(report,null,2)+'\n');
