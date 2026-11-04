import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {configureNativeDisplay} from '../modules/native-gpu/display.ts';
import {linear709} from '../src/media/surface.ts';
import {ffmpegPath,probeVideo} from '../src/encoding/ffmpeg.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),directory=resolve('artifacts/native-gpu-v2');
const exec=promisify(execFile);
async function scene(){const scope=new NativeRecordingScope(),k=await scope.api.compile({abiVersion:1,id:'test/native-export',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),.2,.8,1.);}'});scope.publish(await scope.api.run(k,[],{parameters:new Float32Array([.5]),output:{width:320,height:180,format:'rgba32float',alpha:'opaque',color:linear709}}));const {parameters,output,external,kernelOffset:_offset,...packet}=scope.packet();const p:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:8,maxBytes:64*1024**2,display:null};return {scope,parameters,output,p};}
test.before(async()=>{await mkdir(directory,{recursive:true});});
// NVENC rejects sub-minimum dimensions; use a real 320x180 video frame.
test('native GPU packing and actual NVENC MP4 output fully decode in authored frame order',async()=>{
 const {p,parameters,output}=await scene();configureNativeDisplay(p,output);const file=resolve(directory,'native-nvenc.mp4');p.export={executable:ffmpegPath(),output:file,image:output,fps:[24,1],codec:'h264_nvenc',format:'nv12',display:true};
 const c=await NativeGpuClient.create(p,{executable});try{for(let start=0;start<24;start+=8){const tickets=await c.submitBatch(Array.from({length:8},(_,i)=>({frame:start+i,parameters:[[new Uint32Array(new Float32Array([(start+i)/23]).buffer)[0]]]})));await Promise.all(tickets.map(t=>t.completed));}const stats=await c.stats();assert.equal(stats.export.framesWritten,24);assert.equal(stats.pixelTransferBytes,320*180*1.5*24);assert.equal(stats.export.pngTransport,false);assert.equal(stats.export.hardwareEncode,true);}finally{await c.close();}
 const info=await probeVideo(file);assert.equal(info.frames,24);assert.equal(info.width,320);assert.equal(info.height,180);assert.ok(info.decodable);
 const decoded=await exec(ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:4*1024**2,windowsHide:true});
 const reds=Array.from({length:24},(_,i)=>decoded.stdout[i*320*180*3]);for(let i=1;i<reds.length;i++)assert.ok(reds[i]>=reds[i-1]-3,JSON.stringify(reds));assert.ok(reds.at(-1)!-reds[0]>150);
});
test('native PNG export is a real readable output, with no PNG frame transport',async()=>{
 const {p,parameters,output}=await scene();configureNativeDisplay(p,output);const file=resolve(directory,'native.png');p.export={executable:ffmpegPath(),output:file,image:output,fps:[24,1],codec:'png',format:'rgba',display:true};
 const c=await NativeGpuClient.create(p,{executable});try{const t=await c.submit(0,parameters);await t.completed;}finally{await c.close();}
 const image=await sharp(await readFile(file)).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,320);assert.equal(image.info.height,180);assert.ok(Math.abs(image.data[0]-188)<=1);
});
test('native EXR export preserves negative RGB, HDR and Alpha in real decoded float pixels',async()=>{
 const {p,parameters,output}=await scene(),file=resolve(directory,'native.exr');p.export={executable:ffmpegPath(),output:file,image:output,fps:[24,1],codec:'exr',format:'gbrapf32le',display:false};
 p.kernels[0].code=p.kernels[0].code.replace('paramF32(0u),.2,.8,1.','paramF32(0u),4.,.8,.25');p.images[output].alpha='straight';p.passes[0].header[3]=1;
 parameters[0][0]=new Uint32Array(new Float32Array([-2.5]).buffer)[0];const c=await NativeGpuClient.create(p,{executable});try{const t=await c.submit(0,parameters);await t.completed;}finally{await c.close();}
 const decoded=await exec(ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',maxBuffer:2*1024**2,windowsHide:true});const n=320*180;assert.equal(decoded.stdout.length,n*16);for(const [plane,value] of [[0,4],[1,.8],[2,-2.5],[3,.25]])assert.ok(Math.abs(decoded.stdout.readFloatLE(plane*n*4)-value)<1e-6);
});
test('encoder initialization failure preserves actual FFmpeg diagnostics',async()=>{
 const {p,parameters,output}=await scene();p.images[output].width=32;p.images[output].height=18;p.passes[0].header[0]=32;p.passes[0].header[1]=18;
 p.export={executable:ffmpegPath(),output:resolve(directory,'expected-too-small.mp4'),image:output,fps:[24,1],codec:'h264_nvenc',format:'nv12',display:false};
 const detailed=(e:any)=>e.code==='E_NATIVE_ENCODE'&&/minimum|InitializeEncoder|invalid param|Error initializing/.test(e.message)&&!e.message.includes('worker stopped');
 const c=await NativeGpuClient.create(p,{executable});try{await assert.rejects(async()=>{const t=await c.submit(0,parameters);await t.completed;await c.close();},detailed);}finally{try{await c.close();}catch(e){assert.ok(detailed(e));}}
});
