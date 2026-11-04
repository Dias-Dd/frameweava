import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {linear2020,pq2020,type ProfessionalSurface} from '../src/media/surface.ts';
import {ProfessionalVideoEncoder} from '../src/media/encoding.ts';
import {readProfessionalSettings} from '../src/media/service.ts';

const parent=join(engineRoot,'artifacts/professional-media');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'performance-')),rows:any[]=[];
await writeFile(join(parent,'performance-latest.json'),JSON.stringify({directory},null,2));
const save=()=>writeFile(join(directory,'results.json'),JSON.stringify({node:process.version,platform:process.platform,notes:['GPU rows reuse the existing RGBA8 effect chain, not a claimed HDR GPU path','Only timestamp query durations are GPU execution times; fences and Canvas readback are host wall spans','Cold means new Renderer/Stage; warm means reused instance, not cleared OS caches','Other system/Agent load is uncontrolled; no realtime throughput promise'],rows},null,2));
for(const [width,height]of [[1920,1080],[3840,2160]]){
 for(const preview of [true,false]){
  const entry=join(directory,`gpu-${width}-${preview}.ts`);await writeFile(entry,`import {Composition,Stage} from '@frameweave/engine';export default Composition({width:${width},height:${height},fps:24,durationInFrames:4,background:'#000000',children:Stage({id:'gpu',entry:${JSON.stringify(join(engineRoot,'examples/professional-media/gpu-benchmark.ts'))},outputs:{stats:'json'}})});`);
  let renderer:Renderer|undefined;const phases:any[]=[];try{
   renderer=await Renderer.create(await buildProject(entry),{preview,timeoutMs:120000,onProfile:e=>phases.push(e)});
   for(const frame of [0,1,2]){const start=performance.now(),result=await renderer.evaluateFrame(frame),stats=result.stageOutputs.gpu.stats;rows.push({kind:'gpu-rgba8',width,height,requestedGpuPolicy:preview?'auto':'swiftshader',sample:frame===0?'cold':'warm',frame,evaluateWallMs:performance.now()-start,stats});await save();console.log(`GPU ${width} ${preview?'auto':'swiftshader'} frame ${frame}`);}
   const closed=await renderer.evaluateFrame(3),stats=(closed.stageOutputs.gpu.stats as any).disposed;if(stats.liveTextures||stats.liveBuffers||stats.liveQuerySets)throw Error('GPU-owned resource remains after dispose');rows.push({kind:'gpu-cleanup',width,height,preview,stats});
  }catch(e){rows.push({kind:'gpu-failure',width,height,preview,code:(e as any).code,message:String(e)});}finally{await renderer?.close();await save();}
 }
 const entry=join(directory,`float-${width}.tsx`);await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={${width}} height={${height}} fps={24} durationInFrames={2} background="transparent"><Stage id="a" entry=${JSON.stringify(join(engineRoot,'examples/professional-media/stages.ts'))} exportName="source" outputs={{surface:'surface'}}/><Stage id="b" entry=${JSON.stringify(join(engineRoot,'examples/professional-media/stages.ts'))} exportName="exposure" inputs={{image:ref('a')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}}/><Layer id="out" source={ref('b')}/></Composition>;`);
 let renderer:Renderer|undefined;const phases:any[]=[];try{
  renderer=await Renderer.create(await buildProject(entry),{media:{workingColor:linear2020},timeoutMs:120000,onProfile:e=>phases.push(e)});let firstHash='';
  for(const [index,frame]of [0,0].entries()){
   const start=performance.now(),result=await renderer.renderMediaFrame(frame),hash=createHash('sha256').update(result.surface.storage.data).digest('hex');if(index&&hash!==firstHash)throw Error('Float repeat differs');firstHash=hash;
   rows.push({kind:'professional-cpu',width,height,sample:index?'repeat':'cold',frame,wallMs:performance.now()-start,cacheHits:result.cacheHits,format:result.surface.format,transport:result.surface.storage.location,decodedBytes:result.surface.rowStride*result.surface.height,base64Characters:result.surface.storage.data.length,sha256:hash,phases:phases.splice(0)});await save();console.log(`FLOAT ${width} ${index?'repeat':'cold'}`);
   if(index===0){const settings=await readProfessionalSettings(join(engineRoot,'examples/professional-media/settings.json')),encodeStart=performance.now(),encoder=await ProfessionalVideoEncoder.create(join(directory,`hdr-${width}.mp4`),{preset:'hdr10',width,height,fps:{num:24,den:1},outputColor:pq2020,alpha:{mode:'flatten',matte:[0,0,0]},conversion:{kind:'colorimetric',clip:true},hdr10:settings.video!.hdr10});
    const prepared=performance.now();try{await encoder.write(result.surface);const written=performance.now();await encoder.finish();rows.push({kind:'professional-encode',width,height,preflightMs:prepared-encodeStart,prepareTransformPackAndPipeMs:written-prepared,encoderFinalDrainMs:performance.now()-written,backend:'ffmpeg-software-libx265',frames:1});}catch(e){await encoder.abort();throw e;}await save();}
  }
 }catch(e){rows.push({kind:'professional-failure',width,height,code:(e as any).code,message:String(e)});}finally{await renderer?.close();await save();}
}
console.log(JSON.stringify({directory,rows:rows.length,failures:rows.filter(r=>String(r.kind).includes('failure')).length}));
if(rows.some(r=>String(r.kind).includes('failure')))process.exitCode=1;
