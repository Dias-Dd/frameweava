import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,surfaceFromPixels,decodeBytes,encodeBytes,linear2020,srgb,pq2020,type ProfessionalSurface} from '../src/media/surface.ts';
import {transformPixels} from '../src/media/color.ts';
import {mediaPreview} from '../src/media/node.ts';
import {writeExr,ocioInfo} from '../src/media/ocio.ts';
import {ProfessionalVideoEncoder} from '../src/media/encoding.ts';
import {hashValue} from '../src/render/cache.ts';
import {readProfessionalSettings} from '../src/media/service.ts';

const label=process.argv[2]??'baseline',parent=join(engineRoot,'artifacts/pme-perf');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,label+'-')),rows:any[]=[],phases:any[]=[],exec=promisify(execFile);
const revision=(await exec('git',['rev-parse','HEAD'],{cwd:engineRoot,windowsHide:true})).stdout.trim();
const policy={workingColor:linear2020,...label.startsWith('optimized')?{transport:'buffer-v1' as const}:{},preview:{color:srgb,clip:true,ocio:{source:'Linear Rec.2020',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)'}}};
const memory=()=>({rss:process.memoryUsage().rss,arrayBuffers:process.memoryUsage().arrayBuffers,nodePeakRss:process.resourceUsage().maxRSS>0?process.resourceUsage().maxRSS*1024:null,scope:'Node only; browser/GPU peak unknown'});
const save=()=>writeFile(join(directory,'results.json'),JSON.stringify({schemaVersion:1,label,revision,node:process.version,platform:process.platform,browserPolicy:'SwiftShader accurate unless explicitly stated',policy,rows,notes:['Cold means fresh Renderer, OS/driver caches not cleared','Host microbenchmarks are separate spans, not added to frame wall time','GPU query is not end-user latency; process memory excludes Chromium/GPU','Other Agent/system load uncontrolled']},null,2));
await writeFile(join(parent,label+'-latest.json'),JSON.stringify({directory,revision},null,2));
async function span<T>(kind:string,width:number,run:()=>T|Promise<T>){const start=performance.now(),result=await run();rows.push({kind,width,wallMs:performance.now()-start,...['compile','renderer-init'].includes(kind)?{phases:phases.splice(0)}:{},memory:memory()});await save();return result;}
for(const [width,height] of [[1920,1080],[3840,2160]]){
 const entry=join(directory,`scene-${width}.tsx`);await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={${width}} height={${height}} fps={24} durationInFrames={3} background="transparent"><Stage id="a" entry=${JSON.stringify(join(engineRoot,'examples/professional-media/stages.ts'))} exportName="source" outputs={{surface:'surface'}}/><Stage id="b" entry=${JSON.stringify(join(engineRoot,'examples/professional-media/stages.ts'))} exportName="exposure" inputs={{image:ref('a')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}}/><Layer id="out" source={ref('b')}/></Composition>;`);
 const build=await span('compile',width,()=>buildProject(entry,{onProfile:e=>phases.push(e)}));
 const renderer=await span('renderer-init',width,()=>Renderer.create(build,{media:policy,timeoutMs:120000,onProfile:e=>phases.push(e)}));let retained!:ProfessionalSurface;
 try{
  for(const [index,frame]of [0,0,1].entries()){
   const start=performance.now(),result=await renderer.renderMediaFrame(frame),frameWallMs=performance.now()-start,p=pixelsFromSurface(result.surface);retained=result.surface;
   const digest=createHash('sha256').update(new Uint8Array(p.buffer)).digest('hex');await writeFile(join(directory,`reference-${width}-${frame}.f32`),new Uint8Array(p.buffer));
   rows.push({kind:'frame',width,height,sample:index===0?'cold':index===1?'repeat':'new-frame',frame,frameWallMs,wallIncludingReferenceReadAndWriteMs:performance.now()-start,cacheHits:result.cacheHits,compositeCacheHit:result.compositeCacheHit,format:result.surface.format,sha256:digest,phases:phases.splice(0),memory:memory()});await save();console.log(`${label} ${width} ${index}`);
  }
  const bytes=await span('micro-base64-decode',width,()=>decodeBytes((retained.storage as any).data));
  await span('micro-base64-encode',width,()=>encodeBytes(bytes));
  await span('micro-structuredClone',width,()=>structuredClone(retained));
  await span('micro-json-key',width,()=>hashValue(retained));
  const p=await span('micro-unpack',width,()=>pixelsFromSurface(retained));
  await span('micro-pack-float32',width,()=>surfaceFromPixels(width,height,p,{format:'rgba32float',color:retained.color,alpha:retained.alpha}));
  const source=(await renderer.renderMediaFrame(0,'b')).surface,src=pixelsFromSurface(source);
  await span('micro-color',width,()=>transformPixels(src,source.color,linear2020,source.alpha));
  await span('preview-ocio-png',width,async()=>{const png=await mediaPreview(retained,policy);await writeFile(join(directory,`preview-${width}.png`),png);});
  await span('exr',width,()=>writeExr(retained,join(directory,`frame-${width}.exr`)));
  const settings=await readProfessionalSettings(join(engineRoot,'examples/professional-media/settings.json'));
  await span('hdr-encode-total',width,async()=>{const encoder=await ProfessionalVideoEncoder.create(join(directory,`hdr-${width}.mp4`),{preset:'hdr10',width,height,fps:{num:24,den:1},outputColor:pq2020,conversion:{kind:'colorimetric',clip:true},alpha:{mode:'flatten',matte:[0,0,0]},hdr10:settings.video!.hdr10});try{await encoder.write(retained);await encoder.finish();}finally{await encoder.abort();}});
 }finally{await renderer.close();}
}
await writeFile(join(directory,'ocio.json'),JSON.stringify(await ocioInfo(),null,2));await save();console.log(JSON.stringify({ok:true,directory,revision}));
