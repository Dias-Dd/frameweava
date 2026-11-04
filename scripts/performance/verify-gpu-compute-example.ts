import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../../src/compiler/build.ts';
import {Renderer} from '../../src/render/renderer.ts';
import {acescg,srgb,pq2020,pixelsFromSurface,type ProfessionalSurface} from '../../src/media/surface.ts';
import {writeExr,readExr} from '../../src/media/ocio.ts';
import {ProfessionalVideoEncoder} from '../../src/media/encoding.ts';
import {ffmpegPath} from '../../src/encoding/ffmpeg.ts';

// Media correctness only. This is NOT a throughput benchmark or an audio test.
const parent=join(engineRoot,'artifacts/gpu-compute');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'example-'));
process.env.FRAMEWEAVE_HOME=join(directory,'user-home');const entry=join(engineRoot,'modules/gpu-effects/examples/compute.tsx'),build=await buildProject(entry,{outputDir:join(directory,'build')}),renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false,media:{workingColor:acescg,transport:'buffer-v1',preview:{color:srgb,clip:true}}});
const report:any={version:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:engineRoot,encoding:'utf8'}).trim(),project:entry,width:640,height:360,fps:{num:64,den:1},frames:[],purpose:'Native example and media correctness; no performance claim',allPassed:false};
let encoder:ProfessionalVideoEncoder|undefined;
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
try{
 const settings=JSON.parse(await readFile(join(engineRoot,'examples/professional-media/settings.json'),'utf8'));
 encoder=await ProfessionalVideoEncoder.create(join(directory,'particles-hdr10.mp4'),{...settings.video,width:640,height:360,fps:{num:64,den:1},outputColor:pq2020});
 for(const frame of [0,1,2,3]){const r=await renderer.evaluateFrame(frame,'particles'),surface=r.stageOutputs.particles.surface as ProfessionalSurface,p=pixelsFromSurface(surface);await encoder.write(surface);report.frames.push({frame,sha256:hash(new Uint8Array(p.buffer,p.byteOffset,p.byteLength)),stats:r.stageOutputs.particles.stats});if(frame===3){const path=join(directory,'particles.exr');await writeExr(surface,path,'rgba32float');const decoded=pixelsFromSurface((await readExr(path)).surface);assert.equal(hash(new Uint8Array(decoded.buffer,decoded.byteOffset,decoded.byteLength)),hash(new Uint8Array(p.buffer,p.byteOffset,p.byteLength)));report.exr={decodedExact:true,width:surface.width,height:surface.height,format:'rgba32float',color:surface.color,alpha:surface.alpha};}}
 const encoded=await encoder.finish();encoder=undefined;assert.equal(encoded.frames,4);const video=join(directory,'particles-hdr10.mp4');const decode=execFileSync(ffmpegPath(),['-v','info','-i',video,'-map','0:v:0','-frames:v','4','-f','framemd5','pipe:1'],{encoding:'utf8',windowsHide:true,maxBuffer:2**20});const decodedFrames=decode.split(/\r?\n/).filter(x=>/^0,/.test(x));assert.equal(decodedFrames.length,4);await writeFile(join(directory,'decoded.framemd5'),decode);report.video={preset:'hdr10',decodedFrames:decodedFrames.length,report:encoded};
 const png=(await renderer.renderFrame(3,'particles')).png;await writeFile(join(directory,'particles.png'),png);const metadata=await sharp(png).metadata();assert.equal(metadata.width,640);assert.equal(metadata.height,360);await sharp(png).raw().toBuffer();report.png={decoded:true,width:metadata.width,height:metadata.height};report.allPassed=true;
}finally{await encoder?.abort();await renderer.close();await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory,allPassed:report.allPassed}));}
