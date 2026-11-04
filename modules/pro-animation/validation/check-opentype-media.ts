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
const directory=resolve('.frameweave/pa3-opentype'),out=join(directory,'media');await mkdir(out,{recursive:true});
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=resolve('.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
const exec=promisify(execFile),start=performance.now(),records:object[]=[];
for(const entry of ['project.tsx','half.tsx']){
 const project=resolve('modules/pro-animation/validation/opentype-scene',entry),build=await buildProject(project),reference=await readFile(join(directory,'stage',entry+'.f32'));
 for(const extension of entry==='project.tsx'?['png','exr','mp4']:['exr']){
  const output=join(out,entry.replace('.tsx','.')+extension),movie=extension==='mp4',begin=performance.now();
  const result=await renderNativeProject(project,{build,native:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),output,start:movie?0:4,end:movie?8:5,encoder:'libx264',initialConcurrency:1,maxConcurrency:1});
  assert.equal(result.stats.devicesCreated,1);assert.equal(result.stats.webBridge.enabled,false);assert.equal(result.stats.diagnosticReadbacks,0);
  const bytes=await readFile(output),record:Record<string,unknown>={entry,extension,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),wallMs:performance.now()-begin,stats:result.stats};
  if(extension==='png'){
   const image=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,720);assert.equal(image.info.height,400);assert.equal(image.info.channels,4);assert.ok(image.data.some((v,i)=>i%4===3&&v===0));assert.ok(image.data.some((v,i)=>i%4===3&&v>0&&v<255));
  }else if(extension==='exr'){
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:5*1024**2});const count=720*400;assert.equal(stdout.length,count*16);let error=0,low=Infinity,high=-Infinity;
   for(let i=0;i<count;i++)for(let c=0;c<4;c++){const expected=reference.readFloatLE((i*4+c)*4),actual=stdout.readFloatLE(([2,0,1,3][c]*count+i)*4);assert.ok(Number.isFinite(actual));error=Math.max(error,Math.abs(actual-expected));if(c<3){low=Math.min(low,actual);high=Math.max(high,actual);}else assert.ok(actual>=0&&actual<=1);}
   assert.ok(error<=4e-5,JSON.stringify({entry,error}));assert.ok(low<0);assert.ok(high>1);Object.assign(record,{error,low,high,reference:'Actual native Stage GPU pixels through existing Layer; separate geometry/palette references in Stage test'});
  }else{
   const info=await probeVideo(output);assert.ok(info.decodable);assert.equal(info.frames,8);assert.equal(info.width,720);assert.equal(info.height,400);
   const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:40*1024**2}),size=720*400*3;assert.equal(stdout.length,size*8);assert.notDeepEqual(stdout.subarray(0,size),stdout.subarray(7*size,8*size));
   for(const frame of [0,4,7])await sharp(stdout.subarray(frame*size,(frame+1)*size),{raw:{width:720,height:400,channels:3}}).png().toFile(join(out,'decoded-'+frame+'.png'));record.video=info;
  }records.push(record);
 }
}
const proof={version:1,seconds:(performance.now()-start)/1000,records,scope:'Real font OpenType feature/GDEF controls -> Native glyphs/caret markers/Glow/Layer; eight finite animation frames. No CPU pixels, browser or hidden shaping re-execution inside draw. No AE/SDK/package/platform parity claim.'};
await writeFile(join(out,'result.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({ok:true,seconds:proof.seconds,records:records.map(r=>({entry:r.entry,extension:r.extension,bytes:r.bytes,error:r.error}))}));
