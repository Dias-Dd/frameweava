import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {buildProject} from '../../src/compiler/build.ts';
import {Renderer} from '../../src/render/renderer.ts';
import {nativeExecutable} from './executable.ts';
const [project='modules/native-gpu/examples/advanced.tsx',out='artifacts/native-gpu-v2/performance.json',width='1920',count='40']=process.argv.slice(2);
const samples=Number(count);if(!Number.isInteger(samples)||samples<20||samples>200)throw Error('Use 20..200 distinct frame samples');
process.env.FRAMEWEAVE_HOME??=resolve('.frameweave/native-benchmark-home');
const version=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim();
const start=performance.now(),build=await buildProject(project),compileMs=performance.now()-start,begin=performance.now(),renderer=await Renderer.create(build,{width:Number(width),nativeGpu:{executable:await nativeExecutable(),dynamic:'interactive'}}),initMs=performance.now()-begin;
const sorted=(v:number[])=>[...v].sort((a,b)=>a-b),summary=(v:number[])=>{const s=sorted(v);return {count:s.length,min:s[0],median:s[Math.floor(s.length/2)],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1)};};
try{
 const firstStart=performance.now(),first=await renderer.submitNativeFrame(0);await first.completed;const firstMs=performance.now()-firstStart,newFrames:number[]=[],repeatFrames:number[]=[];
 for(let f=1;f<=samples;f++){const t=performance.now(),ticket=await renderer.submitNativeFrame(f);await ticket.completed;newFrames.push(performance.now()-t);}
 for(let i=0;i<10;i++){const t=performance.now(),ticket=await renderer.submitNativeFrame(samples);await ticket.completed;repeatFrames.push(performance.now()-t);}
 const stats=await renderer.nativeStats(),result={version:1,sourceCommit:version,sourceDirty:dirty||null,node:process.version,platform:process.platform,arch:process.arch,project:resolve(project),width:Number(width),composition:build.manifest.composition,compileMs,initMs,firstFrameMs:firstMs,newFramesMs:summary(newFrames),sameFrameResubmittedMs:summary(repeatFrames),newFrameSamples:newFrames,sameFrameSamples:repeatFrames,stats,measurement:'Node request through isolated JS recording and native GPU completion. Headless; no scanout, image readback or encoding. Same-frame samples are resubmissions, not a cached frame FPS.',memory:{nodeRssBytes:process.memoryUsage().rss,peakPhysicalGpuBytes:null}};
 await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await renderer.close();}
