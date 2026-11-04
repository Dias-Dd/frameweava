import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {NativeVideoDecoder} from '../modules/native-gpu/video-decoder.ts';
import type {NativeVideoResource} from '../modules/native-gpu/resources.ts';
import {linear709} from '../src/media/surface.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';

const exec=promisify(execFile),width=64,height=32;
const request:NativeVideoResource={version:1,id:'movie',decode:'video',decoder:'cpu',position:{frame:0},boundary:'error',interpretation:{...linear709,transfer:'rec709',reference:'display'},metadataPolicy:'validate',output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709},cacheBytes:width*height*16};
let fixture:Promise<string>|undefined;
function movie(){return fixture??=(async()=>{
 const root=resolve('artifacts/native-video-decoder');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'stop-')),raw=join(dir,'source.rgba'),path=join(dir,'source.mp4'),bytes=Buffer.alloc(width*height*4*60);
 for(let f=0;f<60;f++)for(let p=0;p<width*height;p++){const i=(f*width*height+p)*4;bytes[i]=20+f*3;bytes[i+1]=80;bytes[i+2]=180-f*2;bytes[i+3]=255;}
 await writeFile(raw,bytes);await exec(ffmpegPath(),['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate','60','-i',raw,'-c:v','libx264','-crf','0','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',path],{windowsHide:true,timeout:10000});return path;
})();}
// Inspect only the private lifecycle boundary, to deterministically deliver one
// buffered pipe callback after stop has detached its child. No mock decoder.
type Lifecycle={child?:ChildProcessWithoutNullStreams;childClosed?:Promise<void>;bytes:number;queue:Buffer[];generation:number;open(index:number):Promise<void>;stop():Promise<void>};
const lifecycle=(d:NativeVideoDecoder)=>d as unknown as Lifecycle;

test('retired decoder data cannot re-pause stdout or enter the replacement generation',{timeout:15000},async()=>{
 const decoder=await NativeVideoDecoder.create(await movie(),request),state=lifecycle(decoder);await decoder.frame({frame:0});
 const child=state.child!,resume=child.stdout.resume;let injected=false,lateBytes=-1,latePaused=true;
 const before=state.bytes;
 child.stdout.resume=function(){const result=resume.call(this);if(!injected){injected=true;this.emit('data',Buffer.alloc(width*height*12*2));lateBytes=state.bytes-before;latePaused=this.isPaused();}return result;};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const stopping=state.stop();
  // Keep a bounded recovery path for the pre-fix deadlock and preserve failure.
  await Promise.race([stopping,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('retired FFmpeg stdout did not close')),1000);})]);
  assert.equal(injected,true);assert.equal(lateBytes,0,'retired pipe callback must not queue data');assert.equal(latePaused,false,'retired pipe callback must not apply backpressure');
  assert.equal((await decoder.frame({frame:1})).length,width*height*4);assert.notEqual(state.child,child);assert.ok(state.child);
 }finally{clearTimeout(timer);child.stdout.removeAllListeners('data');resume.call(child.stdout);child.kill();await decoder.close();}
});

test('close joins pending reads, is repeatable, and prevents an in-flight seek from reopening',{timeout:15000},async()=>{
 const decoder=await NativeVideoDecoder.create(await movie(),request),state=lifecycle(decoder);await decoder.frame({frame:0});
 let finishStop!:()=>void;const gate=new Promise<void>(resolve=>{finishStop=resolve;});state.childClosed=Promise.all([state.childClosed,gate]).then(()=>{});
 const pending=decoder.frame({frame:59});const rejected=assert.rejects(pending,{code:'E_NATIVE_VIDEO_CLOSED'});
 await Promise.resolve();const a=decoder.close(),b=decoder.close();finishStop();assert.strictEqual(a,b,'all close callers must join the same cleanup');await Promise.all([a,b,rejected]);assert.equal(state.child,undefined);assert.equal(state.bytes,0);assert.equal(state.queue.length,0);
 await assert.rejects(decoder.frame({frame:0}),{code:'E_NATIVE_VIDEO_CLOSED'});await decoder.close();
});

test('real decoder subprocesses return a completion record after repeated seeks and dispose',{timeout:30000},async()=>{
 const path=await movie(),dir=join(path,'..'),script=join(dir,'decode.ts');
 await writeFile(script,`import {NativeVideoDecoder} from ${JSON.stringify(pathToFileURL(resolve('modules/native-gpu/video-decoder.ts')).href)};
 const decoder=await NativeVideoDecoder.create(${JSON.stringify(path)},${JSON.stringify(request)});
 const results=[];try{for(const frame of [0,45,1,59,0,30,2]){const pixels=await decoder.frame({frame});results.push({frame,red:pixels[0]});}}finally{await decoder.close();await decoder.close();}
 console.log(JSON.stringify({ok:true,results}));`);
 for(let i=0;i<3;i++){const run=await exec(process.execPath,['--import','tsx',script],{windowsHide:true,timeout:8000,maxBuffer:1024*1024}),result=JSON.parse(run.stdout);assert.equal(result.ok,true);assert.deepEqual(result.results.map((v:{frame:number})=>v.frame),[0,45,1,59,0,30,2]);assert.notEqual(result.results[0].red,result.results[1].red);assert.equal(result.results[0].red,result.results[4].red);}
});

test('cancellation drains the retired pipe and rejects the waiting frame',{timeout:15000},async()=>{
 const decoder=await NativeVideoDecoder.create(await movie(),request),state=lifecycle(decoder);await state.open(0);
 const controller=new AbortController(),child=state.child!,resume=child.stdout.resume;let aborted=false;
 child.stdout.resume=function(){const result=resume.call(this);if(!aborted){aborted=true;controller.abort();}return result;};
 try{await assert.rejects(decoder.frame({frame:1},controller.signal),{code:'E_RENDER_CANCELLED'});assert.equal(aborted,true);}
 finally{await decoder.close();}assert.equal(state.child,undefined);assert.equal(state.bytes,0);
});

test('public storyboard CLI emits complete JSON and includes the final video frame',{timeout:90000},async()=>{
 const path=await movie(),dir=join(path,'..'),entry=join(dir,'project.tsx'),frames=[0,30,59],outputs:string[]=[];
 await writeFile(entry,`import {Composition,Resource,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage,type NativeVideoResource} from '@frameweave/engine/native';
 const request:NativeVideoResource=${JSON.stringify(request)};
 export const video=defineNativeStage(init=>({renderAt(c){return init.gpu.importResource({...request,position:{frame:c.frame}});}}));
 export default <Composition width={64} height={32} fps={60} durationInFrames={60} background="transparent"><Resource id="movie" src="./source.mp4" kind="media"/><Stage id="video" factory={video}/><Layer source={ref('video')}/></Composition>;`);
 for(let i=0;i<2;i++){
  const output=join(dir,`storyboard-${i}.png`),run=await exec(process.execPath,['--import','tsx',resolve('src/cli.ts'),'storyboard',entry,'--native',process.env.FRAMEWEAVE_NATIVE_GPU??resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),'--frames',frames.join(','),'--width','64','--output',output,'--json'],{windowsHide:true,timeout:40000,maxBuffer:1024*1024}),result=JSON.parse(run.stdout);
  assert.equal(result.ok,true);assert.deepEqual(result.frames,frames);const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,width*3);assert.equal(info.height,height);
  const first=(16*info.width+32)*4,last=(16*info.width+160)*4;assert.ok(data[last]>data[first]+50,'last tile must contain the later source frame');assert.equal(data[last+3],255);outputs.push(output);
 }
 console.log(JSON.stringify({case:'decoder-close-storyboard',directory:dir,frames,outputs}));
});
