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
const directory=resolve('.frameweave/pa3-native-time'),out=join(directory,'media');await mkdir(out,{recursive:true});
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=resolve('.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
const exec=promisify(execFile),start=performance.now(),records:object[]=[];
for(const entry of ['project.tsx','half.tsx']){
 const project=resolve('modules/pro-animation/validation/native-time-scene',entry),build=await buildProject(project);
 const reference=await Promise.all(['exact','echo','shutter','wide'].map(mode=>readFile(join(directory,'stage',entry+'.'+mode+'.f32'))));
 for(const extension of entry==='project.tsx'?['png','exr','mp4']:['exr']){
  const output=join(out,entry.replace('.tsx','.')+extension),movie=extension==='mp4',begin=performance.now();
  const result=await renderNativeProject(project,{build,native:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),output,start:movie?0:11,end:movie?24:12,encoder:'libx264',initialConcurrency:1,maxConcurrency:1});
  assert.equal(result.stats.devicesCreated,1);assert.equal(result.stats.webBridge.enabled,false);assert.equal(result.stats.diagnosticReadbacks,0);
  const bytes=await readFile(output),record:Record<string,unknown>={entry,extension,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),wallMs:performance.now()-begin,stats:result.stats};
  if(extension==='png'){
   const image=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,640);assert.equal(image.info.height,360);assert.equal(image.info.channels,4);assert.ok(image.data.some((v,i)=>i%4===3&&v===0));assert.ok(image.data.some((v,i)=>i%4===3&&v>0&&v<255));
  }else if(extension==='exr'){
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:5*1024**2});const count=640*360;assert.equal(stdout.length,count*16);let error=0,low=Infinity,high=-Infinity;
   for(let y=0;y<360;y++)for(let x=0;x<640;x++)for(let c=0;c<4;c++){
    const slot=(y>=180?2:0)+(x>=320?1:0),local=((y%180)*320+x%320)*4+c,expected=reference[slot].readFloatLE(local*4),actual=stdout.readFloatLE(([2,0,1,3][c]*count+y*640+x)*4);
    assert.ok(Number.isFinite(actual));error=Math.max(error,Math.abs(actual-expected));if(c<3){low=Math.min(low,actual);high=Math.max(high,actual);}else assert.ok(actual>=0&&actual<=1);
   }
   assert.ok(error<=4e-5,JSON.stringify({entry,error}));assert.ok(low<0);assert.ok(high>1);Object.assign(record,{error,low,high,reference:'Four actual Stage GPU publications laid out by existing Layer compositor; no overlap or reference pixel fallback'});
  }else{
   const info=await probeVideo(output);assert.ok(info.decodable);assert.equal(info.frames,24);assert.equal(info.width,640);assert.equal(info.height,360);
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:20*1024**2}),size=640*360*3;assert.equal(stdout.length,size*24);assert.notDeepEqual(stdout.subarray(0,size),stdout.subarray(23*size,24*size));
   for(const frame of [0,11,23])await sharp(stdout.subarray(frame*size,(frame+1)*size),{raw:{width:640,height:360,channels:3}}).png().toFile(join(out,'decoded-'+frame+'.png'));record.video=info;
  }
  records.push(record);
 }
}
const proof={version:1,seconds:(performance.now()-start)/1000,records,scope:'Explicit procedural sourceAt, native temporal scratch, original PA Glow, existing Stage/Layer and actual PNG/EXR/MP4. No optical flow/AE pixel-parity/portable package certification.'};
await writeFile(join(out,'result.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({ok:true,seconds:proof.seconds,records}));
