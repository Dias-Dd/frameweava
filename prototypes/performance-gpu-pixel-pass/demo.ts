import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject,engineRoot} from '../../src/compiler/build.ts';
import {runtimePin} from '../../src/compiler/runtime-lock.ts';
import {Renderer} from '../../src/render/renderer.ts';
import {readProfessionalSettings} from '../../src/media/service.ts';
import {mediaPreview} from '../../src/media/node.ts';
import {writeExr,readExr} from '../../src/media/ocio.ts';
import {ProfessionalVideoEncoder,inspectMediaFile,decodeVideoFloat} from '../../src/media/encoding.ts';
import {pixelsFromSurface,type ProfessionalSurface} from '../../src/media/surface.ts';
import {probeVideo} from '../../src/encoding/ffmpeg.ts';

const parent=join(engineRoot,'artifacts/gpu-pixel-pass-demo');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'run-'));
process.env.FRAMEWEAVE_HOME=join(directory,'runtime-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=join(engineRoot,'.frameweave/pme-python/Scripts/python.exe');
if(!process.env.FRAMEWEAVE_FFPROBE)process.env.FRAMEWEAVE_FFPROBE=execFileSync(process.platform==='win32'?'where.exe':'which',['ffprobe'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)[0];
const project=join(engineRoot,'examples/gpu-pixel-pass/project.tsx'),settings=await readProfessionalSettings(join(engineRoot,'examples/professional-media/settings.json')),report:any={kind:'public-gpu-pixel-pass-demo/1',directory,runtimePin,width:320,height:180,frames:12,fps:12,performanceClaim:false,rows:[],artifacts:[]};
let renderer:Renderer|undefined,encoder:ProfessionalVideoEncoder|undefined;
try{
  const build=await buildProject(project,{outputDir:join(directory,'build')});renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false,media:{...settings.media,transport:'buffer-v1'}});
  const video=join(directory,'gpu-glow-gaussian-hdr10.mp4');encoder=await ProfessionalVideoEncoder.create(video,{...settings.video!,width:320,height:180,fps:{num:12,den:1}});
  for(let frame=0;frame<12;frame++){
    const result=await renderer.evaluateFrame(frame,'gpu'),s=result.stageOutputs.gpu.surface as ProfessionalSurface,stats=result.stageOutputs.gpu.stats as any;
    assert.equal(stats.origin,'null');assert.equal(stats.backend,'webgpu');assert.ok(stats.gpu);assert.ok(stats.minimum<0&&stats.maximum>1);assert.equal(stats.float.liveBuffers,0);assert.equal(stats.float.liveBytes,0);assert.equal(stats.float.submissions,(frame+1)*2);report.rows.push(stats);
    if([0,6,11].includes(frame)){const file=join(directory,`frame-${String(frame).padStart(2,'0')}.png`),diagnostics:any[]=[];await writeFile(file,await mediaPreview(s,settings.media,d=>diagnostics.push(d)));report.artifacts.push({kind:'png',frame,file,diagnostics});}
    if(frame===6){const file=join(directory,'frame-06.exr');await writeExr(s,file,'rgba32float');const decoded=await readExr(file),p=pixelsFromSurface(decoded.surface),expected=pixelsFromSurface(s);assert.equal(Buffer.compare(Buffer.from(p.buffer),Buffer.from(expected.buffer)),0);assert.ok(p.some((v,i)=>i%4!==3&&v<0)&&p.some((v,i)=>i%4!==3&&v>1));report.artifacts.push({kind:'exr32',frame,file,bytesExact:true});}
    await encoder.write(s);
  }
  await encoder.finish();encoder=undefined;
  report.video=await probeVideo(video);assert.equal(report.video.frames,12);assert.equal(report.video.width,320);assert.equal(report.video.height,180);assert.ok(report.video.decodable);
  const info=await inspectMediaFile(video),stream=info.streams.find((s:any)=>s.codec_type==='video');assert.equal(stream.codec_name,'hevc');assert.equal(stream.profile,'Main 10');assert.equal(stream.pix_fmt,'yuv420p10le');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.color_primaries,'bt2020');assert.equal(stream.color_space,'bt2020nc');report.hdr10Stream=stream;
  const decoded=await decodeVideoFloat(video,{width:320,height:180,color:settings.video!.outputColor});assert.ok(pixelsFromSurface(decoded).every(Number.isFinite));report.artifacts.push({kind:'hdr10',file:video,decoded:true});
  report.cleanup=(await renderer.runStage('gpu',11,{}, {stageProps:{gpu:{release:true}}})).outputs.stats as any;assert.ok(report.cleanup.cleanup);assert.equal(report.cleanup.owner.status,'disposed');assert.equal(report.cleanup.owner.liveTextures,0);assert.equal(report.cleanup.owner.liveBuffers,0);assert.equal(report.cleanup.lastFloat.liveBuffers,0);assert.equal(report.cleanup.lastFloat.liveBytes,0);assert.equal(report.cleanup.lastFloat.submissions,24);assert.equal(report.cleanup.lastFloat.buffersCreated,report.cleanup.lastFloat.buffersDestroyed);
  report.status='passed';
}catch(e){report.status='failed';report.error={code:(e as any).code??null,message:(e as Error).message,stack:(e as Error).stack};process.exitCode=1;}
finally{await encoder?.abort();await renderer?.close();await renderer?.close();report.rendererClosedTwice=true;report.exampleHashes=Object.fromEntries(await Promise.all(['project.tsx','stage.ts'].map(async f=>[f,createHash('sha256').update(await readFile(join(engineRoot,'examples/gpu-pixel-pass',f))).digest('hex')])));await writeFile(join(directory,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,status:report.status,artifacts:report.artifacts,video:report.video??null,gpuSubmissions:report.cleanup?.lastFloat.submissions??null,cleanup:report.cleanup?.owner.status??null,firstRange:report.rows[0]?{min:report.rows[0].minimum,max:report.rows[0].maximum}:null,error:report.error?.message??null}));}
