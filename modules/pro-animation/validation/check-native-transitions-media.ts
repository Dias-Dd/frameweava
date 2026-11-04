import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {renderNativeProject} from '../../native-gpu/service.ts';
import {ffmpegPath,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import {transitionNames} from '../src/native-transitions/index.ts';

const directory=resolve('.frameweave/pa3-native-transitions/media'),project=resolve('modules/pro-animation/validation/native-transition-scene/project.tsx');
await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
const exec=promisify(execFile),start=performance.now(),build=await buildProject(project),compileMs=performance.now()-start,results=[];
const native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
for(const [format,extension] of [['rgba32float','png'],['rgba16float','exr'],['rgba32float','exr'],['rgba32float','mp4']] as const){
 build.manifest.stages[0].props.format=format;
 const output=join(directory,`${format}.${extension}`),movie=extension==='mp4';
 const result=await renderNativeProject(project,{build,compileMs:0,native,width:640,height:180,start:movie?0:11,end:movie?24:12,output,encoder:'libx264',maxConcurrency:2});
 assert.equal(result.stats.devicesCreated,1);assert.equal(result.stats.webBridge.enabled,false);
 assert.equal(result.stats.imageReadbacks,result.frames); // Explicit final-output readbacks, never an effect/preview transport.
 assert.equal(result.stats.diagnosticReadbacks,0);assert.equal(result.stats.export.framesWritten,result.frames);
 results.push(result);
 if(extension==='png'){
  const decoded=await sharp(output).raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,640);assert.equal(decoded.info.height,180);assert.equal(decoded.info.channels,4);
  assert.ok(decoded.data.some((v,i)=>i%4===3&&v>0&&v<255));
  // Separate labelled contact sheet, made only from the actual decoded output.
  const names=transitionNames.map((n,i)=>`<text x="${i%8*80+2}" y="${Math.floor(i/8)*45+10}" fill="white" font-size="6">${n}</text>`).join('');
  await sharp(output).flatten({background:'#121820'}).composite([{input:Buffer.from(`<svg width="640" height="180">${names}</svg>`)}]).png().toFile(join(directory,'labelled.png'));
 }else if(extension==='exr'){
  const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',maxBuffer:4*1024**2,windowsHide:true});
  const count=640*180;assert.equal(stdout.length,count*16);let low=Infinity,high=-Infinity,alphaLow=1,alphaHigh=0;
  for(let i=0;i<count*4;i++){const v=stdout.readFloatLE(i*4);assert.ok(Number.isFinite(v));if(i<count*3){low=Math.min(low,v);high=Math.max(high,v);}else{alphaLow=Math.min(alphaLow,v);alphaHigh=Math.max(alphaHigh,v);}}
  assert.ok(low<0);assert.ok(high>1);assert.ok(alphaLow>=0&&alphaHigh<1);results.push({format,decodedExr:{low,high,alphaLow,alphaHigh},note:'Raw scene-linear source pixels, not the SDR display transform'});
 }else {
  const info=await probeVideo(output);assert.equal(info.frames,24);assert.equal(info.width,640);assert.equal(info.height,180);assert.ok(info.decodable);
  const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:12*1024**2,windowsHide:true});assert.equal(stdout.length,640*180*3*24);
  const bytes=640*180*3;assert.notDeepEqual(stdout.subarray(0,bytes),stdout.subarray(23*bytes,24*bytes));
  await sharp(stdout.subarray(11*bytes,12*bytes),{raw:{width:640,height:180,channels:3}}).png().toFile(join(directory,'decoded-frame11.png'));results.push({decodedVideo:info});
 }
}
const proof={schemaVersion:1,backend:'native-wgpu',effectNames:transitionNames,compileMs,totalMs:performance.now()-start,results,limits:['L3 formal R1 wiring/export left to Main','No AE pixel/parameter parity claim','Native diagnostic source/reference checks are separate','PNG/MP4 use explicit SDR output; EXR retains linear HDR/negative RGB']};
await writeFile(join(directory,'media.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({ok:true,totalMs:proof.totalMs,outputs:directory}));
