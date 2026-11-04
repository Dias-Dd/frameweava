import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createAnalysisService} from '../src/analysis-tools/index.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo,ffmpegPath} from '../src/encoding/ffmpeg.ts';
const input=JSON.parse(await readFile(resolve('outputs/dx1b/cli-optimized/metrics.json'),'utf8')),parent=resolve('outputs/dx1b/e2e');await mkdir(parent,{recursive:true});const project=await mkdtemp(join(parent,'project-'));
await cp(join(input.project,'.frameweave/analysis-tools/artifacts'),join(project,'.frameweave/analysis-tools/artifacts'),{recursive:true});
const service=await createAnalysisService({projectRoot:project}),pngHashes:string[]=[],raw=(b:Buffer)=>sharp(b).ensureAlpha().raw().toBuffer();const start=performance.now();let inspected:any;
try{inspected=await service.inspect(input.id);assert.equal(inspected.summary.sampleCount,64);for(let i=0;i<64;i++){const result=await service.preview(input.id,i/8,`frames/frame-${i}.png`);assert.equal(result.backend.id,'node-sharp-svg');pngHashes.push(result.output.reference.sha256);}}finally{await service.close();}
const node64Ms=performance.now()-start;
const entry=join(project,'project.tsx'),stages=resolve('prototypes/analysis-job-mvp/web-stages.ts');
await writeFile(entry,`import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {videoFramesStage} from ${JSON.stringify(stages)};export {videoFramesStage};export default Composition({width:640,height:480,fps:8,durationInFrames:64,children:[${Array.from({length:64},(_,i)=>`Resource({id:'frame${i}',kind:'image',src:'./frames/frame-${i}.png'})`).join(',')},Stage({id:'video',factory:videoFramesStage,outputs:{surface:'surface',frameIndex:'number'},props:{sampleRate:8,frameCount:64}}),Layer({source:ref('video')})]});`);
const build=await buildProject(entry),renderer=await Renderer.create(build,{cache:false}),seen=new Map<number,Buffer>();
try{
 for(const f of [0,32,63,8,32,0]){const r=await renderer.renderFrame(f);assert.deepEqual(r.diagnostics,[]);const bytes=await raw(r.png);assert.deepEqual(bytes,await raw(await readFile(join(project,`frames/frame-${f}.png`))));if(seen.has(f))assert.deepEqual(bytes,seen.get(f));else seen.set(f,bytes);}
 const encoder=await VideoEncoder.create(join(project,'Analysis-DX.mp4'),{num:8,den:1},640,480);try{for(let f=0;f<64;f++)await encoder.write((await renderer.renderFrame(f)).png);await encoder.finish();}catch(e){await encoder.abort();throw e;}
}finally{await renderer.close();}
const video=await probeVideo(join(project,'Analysis-DX.mp4'));assert.equal(video.decodable,true);assert.equal(video.frames,64);assert.equal(video.fps,8);
await promisify(execFile)(ffmpegPath(),['-hide_banner','-loglevel','error','-ss','4','-i',join(project,'Analysis-DX.mp4'),'-frames:v','1',join(project,'decoded-middle.png')],{windowsHide:true});assert.equal((await sharp(await readFile(join(project,'decoded-middle.png'))).metadata()).width,640);
const report={passed:true,project,artifactId:input.id,summary:inspected.summary,node64Ms,pngHashes,entry,video,seekOrder:[0,32,63,8,32,0],rgbaTolerance:0,media:join(project,'Analysis-DX.mp4')};await writeFile(join(project,'acceptance.json'),JSON.stringify(report,null,2));await writeFile(join(parent,'latest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
