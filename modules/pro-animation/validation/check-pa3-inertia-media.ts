/** Checkpoint L2. Existing Renderer/owner/PME/encoders only; not a new runtime. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {writeExr,readExr,ocioInfo} from '../../../src/media/ocio.ts';
import {ProfessionalVideoEncoder} from '../../../src/media/encoding.ts';
import {VideoEncoder,ffmpegPath,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import {mediaPreview} from '../../../src/media/node.ts';
import {pixelsFromSurface,surfaceFromPixels,acescg,srgb,pq2020,type ProfessionalSurface} from '../../../src/media/surface.ts';
import {transformPixels} from '../../../src/media/color.ts';

const base=resolve('.frameweave/pa3-inertia'),proof=JSON.parse(await readFile(join(base,'inertia-scene-proof.json'),'utf8')),entry=resolve(proof.entry),rel=relative(base,entry);
if(rel.startsWith('..')||isAbsolute(rel))throw Error('Only this worktree PA3 projects are accepted');
const dir=await mkdtemp(join(base,'media-')),info=await ocioInfo();
const policy={workingColor:acescg,transport:'buffer-v1' as const,preview:{color:srgb,clip:true,ocio:{source:'ACEScg',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)'}}};
const startBuild=performance.now(),build=await buildProject(entry),buildMs=performance.now()-startBuild,startRenderer=performance.now(),renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false,media:policy}),initializationMs=performance.now()-startRenderer;
const frames:ProfessionalSurface[]=[],renderMs:number[]=[],stats:any[]=[];let middle:ProfessionalSurface|undefined;
try{
 for(let f=0;f<12;f++){
  const start=performance.now(),out=await renderer.renderMediaFrame(f);renderMs.push(performance.now()-start);frames.push(out.surface);
  const row=out.stageOutputs.inertia.stats as any;assert.equal(row.gpu,true);assert.equal(row.owner.backend,'webgpu');assert.equal(row.float.liveBuffers,0);assert.equal(row.float.buffersCreated,row.float.buffersDestroyed);stats.push(row);
  if(f===5)middle=out.stageOutputs.inertia.surface as ProfessionalSurface;
 }
 for(const f of [11,0,5,3,11,5])assert.deepEqual(pixelsFromSurface((await renderer.renderMediaFrame(f)).surface),pixelsFromSurface(frames[f]));
 build.manifest.stages[0].props.cleanup=true;const cleanup=(await renderer.renderMediaFrame(5)).stageOutputs.inertia.stats as any;assert.equal(cleanup.owner.liveTextures,0);assert.equal(cleanup.owner.liveBuffers,0);assert.equal(cleanup.owner.status,'disposed');stats.push({cleanup});
}finally{await renderer.close();}
const exr=[];
for(const [id,s]of [['composition',frames[5]],['source',middle!]] as [string,ProfessionalSurface][]){
 for(const format of ['rgba16float','rgba32float'] as const){
  const file=join(dir,id+'-'+format+'.exr');await writeExr(s,file,format);const decoded=await readExr(file),expected=pixelsFromSurface(surfaceFromPixels(s.width,s.height,pixelsFromSurface(s),{format,color:s.color,alpha:s.alpha}));assert.deepEqual(pixelsFromSurface(decoded.surface),expected);exr.push({id,format,file,maxQuantizedReferenceError:0,metadata:decoded.metadata});
 }
}
for(const f of [0,5,11]){const png=await mediaPreview(frames[f],policy),meta=await sharp(png).metadata();assert.equal(meta.width,640);assert.equal(meta.height,240);await writeFile(join(dir,'frame-'+f+'.png'),png);}
const sdr=await VideoEncoder.create(join(dir,'preview.mp4'),{num:12,den:1},640,240);
try{for(const frame of frames)await sdr.write(await mediaPreview(frame,policy));await sdr.finish();}catch(e){await sdr.abort();throw e;}
const hdr=await ProfessionalVideoEncoder.create(join(dir,'hdr10.mp4'),{preset:'hdr10',width:640,height:240,fps:{num:12,den:1},outputColor:{...pq2020,peakNits:4000},conversion:{kind:'colorimetric',clip:true},alpha:{mode:'flatten',matte:[0,0,0]},hdr10:{masteringDisplay:{red:[.708,.292],green:[.170,.797],blue:[.131,.046],white:[.3127,.329],minNits:.005,maxNits:4000},maxCLL:4000,maxFALL:1000}});
let hdrReport;try{for(const frame of frames)await hdr.write(frame);hdrReport=await hdr.finish();}catch(e){await hdr.abort();throw e;}
const exec=promisify(execFile),n=640*240;
const decodedSdr=(await exec(ffmpegPath(),['-hide_banner','-loglevel','error','-i',join(dir,'preview.mp4'),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{encoding:'buffer',maxBuffer:16*1024*1024,windowsHide:true})).stdout;assert.equal(decodedSdr.byteLength,n*4*12);
const sdrErrors=[];for(const f of [0,5,11]){
 const expected=await sharp(join(dir,'frame-'+f+'.png')).ensureAlpha().raw().toBuffer();let sum=0;for(let i=0;i<n;i++)for(let c=0;c<3;c++)sum+=(decodedSdr[f*n*4+i*4+c]-expected[i*4+c])**2;const rmse=Math.sqrt(sum/(n*3));assert.ok(rmse<=12,'Predeclared H264/chroma budget 12/255');sdrErrors.push({frame:f,rmse8bit:rmse});
 await sharp(decodedSdr.subarray(f*n*4,(f+1)*n*4),{raw:{width:640,height:240,channels:4}}).png().toFile(join(dir,'decoded-'+f+'.png'));
}assert.notDeepEqual(decodedSdr.subarray(0,n*4),decodedSdr.subarray(n*4*11));
const raw=(await exec(ffmpegPath(),['-hide_banner','-loglevel','error','-i',join(dir,'hdr10.mp4'),'-f','rawvideo','-pix_fmt','gbrpf32le','pipe:1'],{encoding:'buffer',maxBuffer:32*1024*1024,windowsHide:true})).stdout;assert.equal(raw.byteLength,n*3*4*12);
const decodedHdr=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),pqErrors=[];
for(let f=0;f<12;f++){
 const s=frames[f],p=pixelsFromSurface(s);for(let i=0;i<p.length;i+=4){if(s.alpha!=='premultiplied')for(let c=0;c<3;c++)p[i+c]*=p[i+3];p[i+3]=1;}
 const expected=transformPixels(p,s.color,{...pq2020,peakNits:4000},'opaque',true).pixels;let sum=0,max=0;for(let i=0;i<n;i++)for(let c=0;c<3;c++){const d=Math.abs(decodedHdr[f*n*3+[2,0,1][c]*n+i]-expected[i*4+c]);sum+=d;max=Math.max(max,d);}const mean=sum/(n*3);assert.ok(mean<=.03,'Predeclared mean PQ budget .03');pqErrors.push({frame:f,mean,max});
}
const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_frames','-read_intervals','%+#1','-of','json',join(dir,'hdr10.mp4')],{windowsHide:true})).stdout),stream=probe.streams[0];assert.equal(stream.profile,'Main 10');assert.equal(stream.pix_fmt,'yuv420p10le');assert.equal(stream.color_primaries,'bt2020');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.color_space,'bt2020nc');assert.ok(probe.frames[0].side_data_list.some((v:any)=>v.side_data_type==='Mastering display metadata'));await writeFile(join(dir,'ffprobe.json'),JSON.stringify(probe,null,2));
const hashes:Record<string,string>={};for(const f of ['preview.mp4','hdr10.mp4','frame-0.png','frame-5.png','frame-11.png',...exr.map(e=>e.file.split(/[\\/]/).at(-1)!)])hashes[f]=createHash('sha256').update(await readFile(join(dir,f))).digest('hex');
const report={entry,dir,buildMs,initializationMs,renderMs,frames:12,randomOrder:[11,0,5,3,11,5],randomF32MaxError:0,stats,exr,preview:{ocio:info,view:policy.preview,sdrErrors,rmseBudget:12,probe:await probeVideo(join(dir,'preview.mp4'))},hdr:{report:hdrReport,stream,decodedFrames:12,pqErrors,meanCodeBudget:.03},hashes,limits:['Actual immutable scalar inertia/analytic boundary handoff plus existing Core Spring, no Worker/WASM or new runner. Existing A8 coverage with float ink; only Glow is GPU-required, auto backend.','Explicit display view/clipping/black flatten are delivery operations, not signed-float intermediates.','640x240 fixture, no 4K/GPU timing or peak device memory claim.','Package manifest/exports/versions/locks and L3 integration are Main-owned and unchanged.']};
await writeFile(join(base,'inertia-media-proof.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dir,buildMs,initializationMs,renderMs,exr:exr.length,decodedSdrFrames:12,decodedHdrFrames:12,maxMeanPQ:Math.max(...pqErrors.map(e=>e.mean)),maxSdrRmse:Math.max(...sdrErrors.map(e=>e.rmse8bit))}));
