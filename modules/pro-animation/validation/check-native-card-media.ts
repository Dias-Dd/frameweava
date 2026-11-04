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
const directory=resolve('.frameweave/pa3-native-cards'),out=join(directory,'media');await mkdir(out,{recursive:true});
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=resolve('.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
const exec=promisify(execFile),started=performance.now(),records=[];
for(const entry of ['cards.tsx','cards-half.tsx']){
 const project=resolve('modules/pro-animation/validation/native-controls-scene',entry),build=await buildProject(project),reference=await readFile(join(directory,entry+'.f32'));
 for(const extension of entry==='cards.tsx'?['png','exr','mp4']:['exr']){
  const output=join(out,entry.replace('.tsx','.')+extension),movie=extension==='mp4',begin=performance.now();
  const rendered=await renderNativeProject(project,{build,native:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/native-admission-7d6ea4c/release/frameweave-native-gpu.exe'),output,start:movie?0:11,end:movie?24:12,encoder:'libx264',initialConcurrency:1,maxConcurrency:1});
  assert.equal(rendered.stats.devicesCreated,1);assert.equal(rendered.stats.webBridge.enabled,false);assert.equal(rendered.stats.diagnosticReadbacks,0);
  const bytes=await readFile(output),record:any={entry,extension,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),wallMs:performance.now()-begin,stats:rendered.stats};
  if(extension==='png'){const data=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(data.info.width,480);assert.equal(data.info.height,270);assert.equal(data.info.channels,4);assert.ok(data.data.some((v,i)=>i%4===3&&v===0));assert.ok(data.data.some((v,i)=>i%4===3&&v>0&&v<255));}
  else if(extension==='exr'){
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:3*1024**2});const count=480*270;assert.equal(stdout.length,count*16);let error=0,low=Infinity,high=-Infinity;
   for(let i=0;i<count;i++)for(let c=0;c<4;c++){const actual=stdout.readFloatLE(([2,0,1,3][c]*count+i)*4),expected=Math.fround(reference.readFloatLE((i*4+c)*4)*.92);assert.ok(Number.isFinite(actual));error=Math.max(error,Math.abs(actual-expected));if(c<3){low=Math.min(low,actual);high=Math.max(high,actual);}else assert.ok(actual>=0&&actual<=1);}
   assert.ok(error<=4e-5,JSON.stringify({entry,error}));assert.ok(low<0);assert.ok(high>1);Object.assign(record,{error,low,high,reference:'Actual published GPU result plus existing F32 Layer opacity .92'});
  }else{
   const info=await probeVideo(output);assert.ok(info.decodable);assert.equal(info.frames,24);assert.equal(info.width,480);assert.equal(info.height,270);const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:12*1024**2}),size=480*270*3;assert.equal(stdout.length,size*24);assert.notDeepEqual(stdout.subarray(0,size),stdout.subarray(size*23,size*24));
   for(const frame of [0,11,23])await sharp(stdout.subarray(size*frame,size*(frame+1)),{raw:{width:480,height:270,channels:3}}).png().toFile(join(out,'decoded-'+frame+'.png'));record.video=info;
  }
  records.push(record);
 }
}
const proof={version:1,seconds:(performance.now()-started)/1000,records,scope:'New creative chain only. Exact PM emission unit failure is tracked independently; this composed Glow scene does not certify that case.'};await writeFile(join(out,'media.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({ok:true,seconds:proof.seconds,records:records.map(r=>({entry:r.entry,extension:r.extension,bytes:r.bytes,error:r.error}))}));
