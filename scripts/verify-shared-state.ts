import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
import {VideoEncoder,probeVideo,ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {openRenderSession} from '../modules/render-session/index.ts';
import {SharedRenderSession} from '../modules/shared-state/node.ts';
import {count} from '../examples/shared-state/cells.ts';

// Explicit opt-in executable, no import-time project evaluation in the service.
const output=resolve(process.argv[2]??'artifacts/v-shared/manual');await mkdir(output,{recursive:true});
const project=resolve('examples/shared-state/project.tsx'),build=await buildProject(project);
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const raw=(b:Buffer)=>sharp(b).ensureAlpha().raw().toBuffer();
const rows:unknown[]=[],images:Buffer[]=[];
for(const preview of [false,true]){
  const session=await SharedRenderSession.fromBuilt(build,{cache:true,preview});
  try{for(const [index,frame]of [100,0,100,100].entries()){
    const f=await session.renderFrame(frame);assert.equal(f.stageOutputs.B.value,index+1);assert.deepEqual(f.diagnostics,[]);
    await writeFile(join(output,`${preview?'preview':'accurate'}-${index+1}-frame-${frame}.png`),f.png);images.push(f.png);
    rows.push({preview,frame,cacheHits:f.cacheHits,shared:f.shared,b:f.stageOutputs.B.value,rgbaSha256:sha(await raw(f.png))});
  }}finally{await session.close();}
}
for(let i=0;i<4;i++)assert.deepEqual(await raw(images[i]),await raw(images[i+4]),'Same history, preview/accurate decoded RGBA');
await sharp({create:{width:640,height:180,channels:4,background:'#102035'}}).composite(images.map((input,index)=>({input,left:(index%4)*160,top:Math.floor(index/4)*90}))).png().toFile(join(output,'storyboard.png'));
const bounds=await SharedRenderSession.fromBuilt(build,{cache:true});const positions=[];
try{for(const frame of [0,55,110,100,0,100]){const f=await bounds.renderFrame(frame);await writeFile(join(output,`boundary-${positions.length}-frame-${frame}.png`),f.png);positions.push({frame,shared:f.shared,rgbaSha256:sha(await raw(f.png))});}}finally{await bounds.close();}

const video=join(output,'Shared-State.mp4'),session=await SharedRenderSession.fromBuilt(build,{cache:true}),encoder=await VideoEncoder.create(video,build.manifest.composition.fps,160,90),source:Buffer[]=[],videoRows=[];
try{
  for(let frame=0;frame<24;frame++){const f=await session.renderFrame(frame);assert.equal(f.stageOutputs.B.value,frame+1);assert.deepEqual(f.diagnostics,[]);source.push(f.png);videoRows.push({frame,value:f.stageOutputs.B.value,version:f.stageOutputs.B.version});await encoder.write(f.png);}
  await encoder.finish();assert.equal((await session.read(count)).version,24);
}catch(e){await encoder.abort();throw e;}finally{await session.close();}
const metadata=await probeVideo(video);assert.deepEqual(metadata,{width:160,height:90,fps:25,duration:.96,frames:24,decodable:true});
const decoded=await promisify(execFile)(ffmpegPath(),['-hide_banner','-loglevel','error','-i',video,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:4*1024*1024,windowsHide:true});
assert.equal(decoded.stdout.length,160*90*3*24);const lossy=[];
for(const index of [0,12,23]){
  const rgb=decoded.stdout.subarray(index*160*90*3,(index+1)*160*90*3),original=await sharp(source[index]).removeAlpha().raw().toBuffer();let total=0,max=0;
  for(let i=0;i<rgb.length;i++){const d=Math.abs(rgb[i]-original[i]);total+=d;max=Math.max(max,d);}
  const center=(38*160+20+((index+1)%14)*8)*3,expected=(index+1)%2?[98,239,202]:[246,189,96];
  assert.ok(expected.every((v,c)=>Math.abs(rgb[center+c]-v)<15),'Decoded moving marker must have the correct visible color');
  await sharp(rgb,{raw:{width:160,height:90,channels:3}}).png().toFile(join(output,`video-decoded-${index}.png`));
  await writeFile(join(output,`video-source-${index}.png`),source[index]);lossy.push({index,mae:total/rgb.length,maxChannelDifference:max,markerRgb:[...rgb.subarray(center,center+3)]});
}

// Existing DX RenderSession remains unchanged. It can run the ordinary-realm
// project, but intentionally cannot host the new coordinator's mutable inputs.
const ordinary=await openRenderSession(resolve('examples/shared-state/semantics.tsx'),{cache:true}),ordinaryReports=[];
try{for(const [index,frame]of [100,0,100].entries()){
  const report=await ordinary.inspect({frames:[frame],output:join(output,`ordinary-dx-${index}`)});assert.equal(report.ok,true);ordinaryReports.push(report);
}assert.equal(ordinaryReports[2].frames[0].cache.stageHits,2);}finally{await ordinary.close();}

const report={kind:'frameweave.v-shared-verification',runtimePin,project,frames:rows,boundaries:positions,previewEqualsAccurate:true,video:{metadata,rows:videoRows,lossyDecodedComparisons:lossy},ordinaryDxSession:ordinaryReports.map(r=>({ok:r.ok,frames:r.frames,session:r.session})),artifacts:{storyboard:'storyboard.png',video:'Shared-State.mp4'},videoSha256:sha(await readFile(video))};
await writeFile(join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,output,metadata,runtimePin,sharedFrameAttempts:8+6+24,ordinaryDxRequests:3,previewEqualsAccurate:true}));
