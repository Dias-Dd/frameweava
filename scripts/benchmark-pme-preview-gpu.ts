import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {openMediaPreview} from '../src/media/preview-session.ts';
import {linear2020,srgb,pixelsFromSurface} from '../src/media/surface.ts';

const parent=join(engineRoot,'artifacts/pme-perf');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'preview-gpu-')),rows:any[]=[];await writeFile(join(parent,'preview-gpu-latest.json'),JSON.stringify({directory:dir}));
const policy={workingColor:linear2020,transport:'buffer-v1' as const,preview:{color:srgb,clip:true,ocio:{source:'Linear Rec.2020',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)'}}};
const save=()=>writeFile(join(dir,'results.json'),JSON.stringify({version:1,policy,scope:'Real Session PNG preview includes source/trust checks; Stage-local GPU timings include CPU unpack/color, upload, compute, readback, pack. No GPU query FPS claim.',rows},null,2));
const project=JSON.parse(await readFile(join(parent,'baseline-final-latest.json'),'utf8')).directory+'/scene-3840.tsx';
for(const width of [960,1920]){
 const events:any[]=[],preview=openMediaPreview(project,{width,media:policy,onProfile:e=>events.push(e)});
 try{for(const frame of [0,0,1,2]){const t=performance.now(),result=await preview.requestFrame(frame),wallMs=performance.now()-t,info=await sharp(result.png).metadata();assert.equal((result.stageOutputs.a.surface as any).width,width);assert.equal((result.stageOutputs.b.surface as any).width,width);await writeFile(join(dir,`proxy-${width}-${frame}.png`),result.png);rows.push({kind:'preview',width,frame,wallMs,cacheHits:result.cacheHits,actual:[info.width,info.height],stageSizes:Object.fromEntries(Object.entries(result.stageOutputs).map(([k,v])=>[k,[(v.surface as any).width,(v.surface as any).height]])),phases:events.splice(0),session:preview.status()});await save();console.log(`preview ${width} ${frame} ${wallMs}`);}}finally{await preview.close();}
}
for(const [width,height]of [[1920,1080],[3840,2160]]){
 const entry=join(dir,`gpu-${width}.tsx`);await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={${width}} height={${height}} fps={24} durationInFrames={4}><Stage id="s" entry=${JSON.stringify(join(engineRoot,'modules/gpu-effects/validation/professional-benchmark.ts'))} outputs={{surface:'surface',stats:'json'}}/><Layer id="l" source={ref('s')}/></Composition>;`);
 const build=await buildProject(entry),r=await Renderer.create(build,{preview:true,cache:false,media:policy,timeoutMs:120000});let reference!:Float32Array,seen!:Float32Array;
 try{for(const backend of ['cpu','webgpu','webgpu','webgpu']){
  build.manifest.stages[0].props.backend=backend;const t=performance.now(),result=await r.renderMediaFrame(0,'s'),wallMs=performance.now()-t,p=pixelsFromSurface(result.surface),stats=result.stageOutputs.s.stats as any;let maxAbsolute=0,maxRelative=0,alphaMax=0;
  if(backend==='cpu'){reference=p;await writeFile(join(dir,`gpu-reference-${width}.f32`),new Uint8Array(p.buffer));}else{
   assert.equal(stats.backend,'webgpu');for(let i=0;i<p.length;i++){const e=Math.abs(p[i]-reference[i]);maxAbsolute=Math.max(maxAbsolute,e);maxRelative=Math.max(maxRelative,e/Math.max(1,Math.abs(reference[i])));if(i%4===3)alphaMax=Math.max(alphaMax,e);}
   // F32 inverse coordinates/sampling differ from CPU double arithmetic at 4K.
   assert.ok(maxAbsolute<.003&&alphaMax<.001,JSON.stringify({width,maxAbsolute,alphaMax}));if(seen)assert.deepEqual(p,seen);seen=p;await writeFile(join(dir,`gpu-result-${width}.f32`),new Uint8Array(p.buffer));
  }
  rows.push({kind:'stage-local',width,height,backend,wallMs,stats,maxAbsolute,maxRelative,alphaMax,sha256:createHash('sha256').update(new Uint8Array(p.buffer)).digest('hex')});await save();console.log(`GPU ${width} ${backend} ${wallMs}`);
 }}finally{await r.close();}
}
await save();console.log(JSON.stringify({ok:true,directory:dir}));
