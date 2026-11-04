import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../../native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../../native-gpu/client.ts';
import {createGpuPixelEffects} from '../../gpu-effects/pixel-effects.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {createServo} from '../index.ts';

if(!process.env.FRAMEWEAVE_SERVO_RUNTIME)throw Error('Explicit FRAMEWEAVE_SERVO_RUNTIME with verified local bundle required');
const out=resolve('artifacts/servo-module');await mkdir(out,{recursive:true});
const scope=new NativeRecordingScope(),gpu=scope.api,width=64,height=32;
const source=await gpu.compile({abiVersion:1,id:'test/servo-input',version:'1.0.0',inputCount:0,parameterWords:0,
 code:'fn pixel(p:vec2u)->vec4f{return vec4f(2.,-.25,.5+f32(p.y)/128.,1.);}'});
const a=await createServo(gpu,{profile:'sdr-srgb8',execution:'trusted-local',width,height,input:true,
 html:`<img style="position:absolute;inset:0;width:100%;height:100%" src="{{frameweave.input}}"><div id="marker" style="position:absolute;left:0;top:0;width:16px;height:100%;background:red"></div>`,
 javascript:`window.frameweaveRender=(c,p)=>{document.getElementById('marker').style.backgroundColor=c.frame%2?'rgb(0,255,0)':'rgb(255,0,0)';}`});
const b=await createServo(gpu,{profile:'sdr-srgb8',execution:'trusted-local',width,height,input:true,
 html:`<img style="position:absolute;inset:0;width:100%;height:100%" src="{{frameweave.input}}"><svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;right:0;top:0" width="8" height="32" viewBox="0 0 8 32"><rect width="8" height="32" fill="blue"/></svg>`});
const effects=createGpuPixelEffects(gpu);scope.sealInitialization();
const context=(frame:number):FrameContext=>({frame,globalFrame:frame,time:frame/60,globalTime:frame/60,dt:1/60,progress:frame/60,fps:{num:60,den:1},durationInFrames:60,seed:1});
let client:NativeGpuClient|undefined,output=-1,original=-1;const snapshots:number[][]=[],times:number[]=[];
try{
 for(const frame of [0,3,0]){
  scope.beginFrame();const input=await gpu.run(source,[],{output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709}});
  const first=await a.render(input,{context:context(frame)});
  const blurred=await effects.blur(first,{radius:1,boundary:'clamp',format:'rgba32float'});
  const second=await b.render(blurred,{context:context(frame)});scope.publish(second);
  const packet=scope.packet();output=packet.output;original=0;
  if(!client){const {external:_external,kernelOffset:_offset,moduleOffset:_mo,parameters:_parameters,output:_output,...rest}=packet;const program:NativeProgram={...rest,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,display:null};client=await NativeGpuClient.create(program,{executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe')});}
  const start=performance.now(),ticket=await client.submit(frame,packet.parameters);await ticket.completed;times.push(performance.now()-start);
  const {pixels}=await client.inspectForTest(ticket.slot,output);snapshots.push(pixels);
  const sample=(x:number,y:number)=>pixels.slice((y*width+x)*4,(y*width+x)*4+4);
  const left=sample(4,16),right=sample(60,16);assert.deepEqual(left,frame%2?[0,1,0,1]:[1,0,0,1]);assert.deepEqual(right,[0,0,1,1]);
 }
 assert.deepEqual(snapshots[0],snapshots[2]);
 const {pixels}=await client!.inspectForTest(0,original);assert.deepEqual(pixels.slice(0,4),[2,-.25,.5,1]);
 const stats=await client!.stats();assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.devicesCreated,1);assert.equal(stats.nativeModules.instances,2);assert.equal(stats.nativeModules.calls,6);
 await writeFile(resolve(out,'native-two-servo.json'),JSON.stringify({version:1,frames:[0,3,0],completeFrameMs:times,repeatedFrameExact:true,sourceHDRAndNegativeUnchanged:true,stats},null,2)+'\n');
 console.log(JSON.stringify({ok:true,frames:[0,3,0],completeFrameMs:times,stats}));
}finally{await client?.close();await a.dispose();await a.dispose();await b.dispose();await gpu.dispose();}
