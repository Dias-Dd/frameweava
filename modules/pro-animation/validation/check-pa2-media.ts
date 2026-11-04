/** Offline acceptance tool, not a package runtime or a second renderer. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {writeExr,readExr,ocioInfo} from '../../../src/media/ocio.ts';
import {ProfessionalVideoEncoder} from '../../../src/media/encoding.ts';
import {mediaPreview} from '../../../src/media/node.ts';
import {pixelsFromSurface,surfaceFromPixels,acescg,srgb,pq2020,type ProfessionalSurface} from '../../../src/media/surface.ts';
import {transformPixels} from '../../../src/media/color.ts';
import {VideoEncoder,probeVideo,ffmpegPath} from '../../../src/encoding/ffmpeg.ts';

const base=resolve('.frameweave/pa2'),proof=JSON.parse(await readFile(join(base,'combined-proof.json'),'utf8'));
const entry=resolve(proof.entry),rel=relative(base,entry);
if(rel.startsWith('..')||isAbsolute(rel))throw Error('Only this worktree PA-2 project is accepted');
await mkdir(base,{recursive:true});
const dir=await mkdtemp(join(base,'media-')),info=await ocioInfo();
const policy={workingColor:acescg,transport:'buffer-v1' as const,preview:{color:srgb,clip:true,ocio:{source:'ACEScg',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)'}}};
const init=performance.now(),renderer=await Renderer.create(await buildProject(entry),{cache:false,media:policy});
const initializationMs=performance.now()-init,frames:ProfessionalSurface[]=[],panes:Record<string,ProfessionalSurface>={},renderMs:number[]=[],diagnostics:unknown[]=[];
try{
 for(let frame=0;frame<9;frame++){
  const start=performance.now(),out=await renderer.renderMediaFrame(frame);renderMs.push(performance.now()-start);
  frames.push(out.surface);diagnostics.push(...out.diagnostics);
  if(frame===4)for(const id of ['path','text','field','particles'])panes[id]=out.stageOutputs[id].surface as ProfessionalSurface;
 }
 // No sequence replay: source float results must be exact even after later frames.
 for(const frame of [8,2,4,0,8,4])assert.deepEqual(pixelsFromSurface((await renderer.renderMediaFrame(frame)).surface),pixelsFromSurface(frames[frame]));
}finally{await renderer.close();}
function stats(s:ProfessionalSurface){
 const p=pixelsFromSurface(s);let minRgb=Infinity,maxRgb=-Infinity,transparent=0,fractionalAlpha=0;
 for(let i=0;i<p.length;i+=4){for(let c=0;c<3;c++){assert.ok(Number.isFinite(p[i+c]));minRgb=Math.min(minRgb,p[i+c]);maxRgb=Math.max(maxRgb,p[i+c]);}assert.ok(p[i+3]>=0&&p[i+3]<=1);transparent+=+(p[i+3]===0);fractionalAlpha+=+(p[i+3]>0&&p[i+3]<1);}
 return {width:s.width,height:s.height,format:s.format,color:s.color,alpha:s.alpha,minRgb,maxRgb,transparent,fractionalAlpha};
}
const numeric=Object.fromEntries(Object.entries(panes).map(([id,s])=>[id,stats(s)]));
for(const s of Object.values(numeric)){assert.ok(s.minRgb<0);assert.ok(s.maxRgb>1);assert.ok(s.transparent>0);assert.ok(s.fractionalAlpha>0);}
const exr=[];
for(const [id,s]of [['composition',frames[4]],...Object.entries(panes)] as [string,ProfessionalSurface][]){
 for(const format of ['rgba16float','rgba32float'] as const){
  const file=join(dir,`${id}-${format}.exr`),start=performance.now();await writeExr(s,file,format);
  const decoded=await readExr(file),expected=pixelsFromSurface(surfaceFromPixels(s.width,s.height,pixelsFromSurface(s),{format,color:s.color,alpha:s.alpha})),actual=pixelsFromSurface(decoded.surface);
  assert.deepEqual(actual,expected);exr.push({id,format,file,maxQuantizedReferenceError:0,ms:performance.now()-start,metadata:decoded.metadata});
 }
}
const previewMs=[];
for(const frame of [0,4,8]){
 const start=performance.now(),png=await mediaPreview(frames[frame],policy);previewMs.push({frame,ms:performance.now()-start});
 const decoded=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,320);assert.equal(decoded.info.height,192);
 await writeFile(join(dir,`frame-${frame}.png`),png);
}
for(const [id,s]of Object.entries(panes))await writeFile(join(dir,`${id}-middle.png`),await mediaPreview(s,policy));

// HDR mastering limits are explicit authored metadata, not measured programme peaks.
const hdr=await ProfessionalVideoEncoder.create(join(dir,'hdr10.mp4'),{preset:'hdr10',width:320,height:192,fps:{num:12,den:1},outputColor:{...pq2020,peakNits:4000},conversion:{kind:'colorimetric',clip:true},alpha:{mode:'flatten',matte:[0,0,0]},hdr10:{masteringDisplay:{red:[.708,.292],green:[.170,.797],blue:[.131,.046],white:[.3127,.329],minNits:.005,maxNits:4000},maxCLL:4000,maxFALL:1000}});
let hdrReport;try{for(const s of frames)await hdr.write(s);hdrReport=await hdr.finish();}catch(e){await hdr.abort();throw e;}
const sdr=await VideoEncoder.create(join(dir,'preview.mp4'),{num:12,den:1},320,192);
try{for(const s of frames)await sdr.write(await mediaPreview(s,policy));await sdr.finish();}catch(e){await sdr.abort();throw e;}
const exec=promisify(execFile),n=320*192;
const decodedHdr=(await exec(ffmpegPath(),['-hide_banner','-loglevel','error','-i',join(dir,'hdr10.mp4'),'-f','rawvideo','-pix_fmt','gbrpf32le','pipe:1'],{encoding:'buffer',maxBuffer:16*1024*1024,windowsHide:true})).stdout;
assert.equal(decodedHdr.byteLength,n*3*4*9);
const codes=new Float32Array(decodedHdr.buffer.slice(decodedHdr.byteOffset,decodedHdr.byteOffset+decodedHdr.byteLength)),pqErrors=[];
for(let f=0;f<9;f++){
 const s=frames[f],p=pixelsFromSurface(s);
 for(let i=0;i<p.length;i+=4){if(s.alpha!=='premultiplied')for(let c=0;c<3;c++)p[i+c]*=p[i+3];p[i+3]=1;}
 const expected=transformPixels(p,s.color,{...pq2020,peakNits:4000},'opaque',true).pixels;let sum=0,max=0;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const d=Math.abs(codes[f*n*3+[2,0,1][c]*n+i]-expected[i*4+c]);sum+=d;max=Math.max(max,d);}
 const mean=sum/(n*3);assert.ok(mean<=.03,`PQ lossy/chroma mean ${mean} exceeds predeclared .03`);pqErrors.push({frame:f,meanAbsolutePQCodeError:mean,maxAbsolutePQCodeError:max});
}
const decodedSdr=(await exec(ffmpegPath(),['-hide_banner','-loglevel','error','-i',join(dir,'preview.mp4'),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{encoding:'buffer',maxBuffer:8*1024*1024,windowsHide:true})).stdout;
assert.equal(decodedSdr.byteLength,n*4*9);
assert.notDeepEqual(decodedSdr.subarray(0,n*4),decodedSdr.subarray(n*4*8));
const sdrErrors=[];
for(const f of [0,4,8]){
 const expected=await sharp(join(dir,`frame-${f}.png`)).ensureAlpha().raw().toBuffer();let sum=0,max=0;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const d=Math.abs(decodedSdr[f*n*4+i*4+c]-expected[i*4+c]);sum+=d*d;max=Math.max(max,d);}
 const rmse=Math.sqrt(sum/(n*3));assert.ok(rmse<=12,`SDR H264/chroma RMSE ${rmse} exceeds predeclared 12/255`);sdrErrors.push({frame:f,rmse8bit:rmse,max8bit:max});
 await sharp(decodedSdr.subarray(f*n*4,(f+1)*n*4),{raw:{width:320,height:192,channels:4}}).png().toFile(join(dir,`decoded-${f}.png`));
}
const probe=JSON.parse((await exec(process.env.FRAMEWEAVE_PA_FFPROBE??'ffprobe',['-v','error','-show_streams','-show_frames','-read_intervals','%+#1','-of','json',join(dir,'hdr10.mp4')],{windowsHide:true})).stdout),stream=probe.streams[0];
assert.equal(stream.profile,'Main 10');assert.equal(stream.pix_fmt,'yuv420p10le');assert.equal(stream.color_primaries,'bt2020');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.color_space,'bt2020nc');assert.ok(probe.frames[0].side_data_list.some((s:any)=>s.side_data_type==='Mastering display metadata'));
await writeFile(join(dir,'ffprobe.json'),JSON.stringify(probe,null,2));
const files=['frame-0.png','frame-4.png','frame-8.png','preview.mp4','hdr10.mp4',...exr.map(e=>e.file.split(/[\\/]/).at(-1)!)],hashes={};
for(const f of files)(hashes as Record<string,string>)[f]=createHash('sha256').update(await readFile(join(dir,f))).digest('hex');
const report={dir,entry,packageVersion:'0.5.1',backend:'CPU float32 + existing Web Canvas coverage; existing Layer compositor',initializationMs,renderMs,randomOrder:[8,2,4,0,8,4],randomFrameMaxError:0,numeric,exr,preview:{ocio:info,view:policy.preview,previewMs},hdr:{report:hdrReport,stream,decodedFrames:9,pqErrors,meanErrorBudget:.03},sdr:{probe:await probeVideo(join(dir,'preview.mp4')),decodedFrames:9,errors:sdrErrors,rmseBudget:12},hashes,diagnostics,limitations:['Small authored 320x192 CPU scenes; no GPU/4K throughput claim.','A8 text/path coverage and finite-grid particle coverage; float HDR ink remains independent.','Delivery only: explicit black flatten, PQ negative/range clipping and lossy 4:2:0; EXR stays signed linear.','Timing excludes PNG/EXR/video encoding and cache is disabled; new process is not a cold operating-system cache.']};
await writeFile(join(base,'media-proof.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({dir,exrFiles:exr.length,decodedFrames:{sdr:9,hdr:9},maxMeanPQ:Math.max(...pqErrors.map(e=>e.meanAbsolutePQCodeError)),maxSdrRmse:Math.max(...sdrErrors.map(e=>e.rmse8bit)),renderMs}));
