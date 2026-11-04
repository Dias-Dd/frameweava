import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {renderNativeProject} from '../../native-gpu/service.ts';
import {ffmpegPath,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import {transitionNames} from '../src/native-transitions/index.ts';

const out=resolve('.frameweave/pa3-native-controls/media'),scene=resolve('modules/pro-animation/validation/native-controls-scene');await mkdir(out,{recursive:true});
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=resolve('.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
const exec=promisify(execFile),begin=performance.now(),results=[];
const native=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
for(const [entry,format]of [['project.tsx','rgba32float'],['half.tsx','rgba16float']] as const){
 // Separate sealed builds; never mutate a Resource manifest after its seal.
 const project=join(scene,entry),build=await buildProject(project);
 for(const extension of format==='rgba32float'?['png','exr','mp4']:['exr']){
  const movie=extension==='mp4',output=join(out,format+'.'+extension),renderStart=performance.now();
  const result=await renderNativeProject(project,{build,native,output,start:movie?0:7,end:movie?16:8,encoder:'libx264',initialConcurrency:1,maxConcurrency:1});
  assert.equal(result.stats.devicesCreated,1);assert.equal(result.stats.webBridge.enabled,false);assert.equal(result.stats.diagnosticReadbacks,0);
  const bytes=await readFile(output),record:any={entry,format,extension,wallMs:performance.now()-renderStart,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,stats:result.stats};
  if(extension==='png'){
   const decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,640);assert.equal(decoded.info.height,180);assert.equal(decoded.info.channels,4);assert.ok(decoded.data.some((v,i)=>i%4===3&&v>0&&v<255));
   const labels=transitionNames.map((n,i)=>`<text x="${i%8*80+2}" y="${Math.floor(i/8)*45+9}" fill="white" font-size="6">${n}</text>`).join('');
   await sharp(bytes).flatten({background:'#171b20'}).composite([{input:Buffer.from(`<svg width="640" height="180">${labels}</svg>`)}]).png().toFile(join(out,'labelled.png'));
  }else if(extension==='exr'){
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:3*1024**2});
   const reference=await readFile(resolve('.frameweave/pa3-native-controls','frame7-'+format+'.f32')),count=640*180;assert.equal(stdout.length,count*16);let low=Infinity,high=-Infinity,error=0;
   for(let i=0;i<count;i++)for(let c=0;c<4;c++){const actual=stdout.readFloatLE(([2,0,1,3][c]*count+i)*4),raw=reference.readFloatLE((i*4+c)*4);assert.ok(Number.isFinite(actual));const expected=Math.fround(raw*.92);error=Math.max(error,Math.abs(actual-expected));if(c<3){low=Math.min(low,actual);high=Math.max(high,actual);}else assert.ok(actual>=0&&actual<=1);}
   assert.ok(low<0);assert.ok(high>1);assert.ok(error<=4e-5,JSON.stringify({format,error}));Object.assign(record,{low,high,maxErrorAgainstPublishedSurfaceAndLayer:error,reference:'Explicit completed-ticket Stage buffer (F16 or F32 as authored); existing compositor publishes F32 with compensated Layer opacity .92'});
  }else{
   const info=await probeVideo(output);assert.ok(info.decodable);assert.equal(info.frames,16);assert.equal(info.width,640);assert.equal(info.height,180);
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:8*1024**2}),size=640*180*3;assert.equal(stdout.length,size*16);assert.notDeepEqual(stdout.subarray(0,size),stdout.subarray(size*15,size*16));
   await sharp(stdout.subarray(size*7,size*8),{raw:{width:640,height:180,channels:3}}).png().toFile(join(out,'decoded-frame7.png'));record.video=info;
  }
  results.push(record);
 }
}
const proof={schemaVersion:1,seconds:(performance.now()-begin)/1000,backend:'native-wgpu',results,limitations:['Source checkpoint with explicit frozen shared Gaussian fixture; formal R1/L3 wiring remains Main-owned','No proprietary AE pixel oracle or complete 3D Card Wipe claim','PNG/MP4 have explicit SDR display output; EXR keeps signed scene-linear HDR']};await writeFile(join(out,'media.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({ok:true,seconds:proof.seconds,files:results.map(r=>({format:r.format,extension:r.extension,bytes:r.bytes,error:r.maxErrorAgainstPublishedSurfaceAndLayer}))}));
