import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import type {FrameContext} from '../src/core/types.ts';
import {linear709,fromHalf,toHalf} from '../src/media/surface.ts';
import {createNativeTimeEffects,type NativeTimeSource,type TemporalReduction} from '../modules/pro-animation/src/native-time/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {nativeBootstrapProgram} from '../modules/native-gpu/bootstrap-program.ts';
import {temporalReference,type Pixel} from '../modules/pro-animation/validation/native-time-reference.ts';
import {shutterSamples} from '../modules/pro-animation/src/shutter-sampling.ts';
const ctx:FrameContext={frame:12,globalFrame:12,time:.5,globalTime:.5,dt:1/24,fps:{num:24,den:1},durationInFrames:25,progress:.5,seed:37};
const generator={abiVersion:1 as const,id:'validation/time/constant',version:'1.0.0',inputCount:0,parameterWords:4,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),paramF32(1u),paramF32(2u),paramF32(3u));}'};
const pixels:Pixel[]=[[-.25,4,.125,.5],[1.5,-.5,2,.25],[.75,1,-.25,.75]];
const f32=(v:Pixel)=>Array.from(v,Math.fround) as unknown as Pixel;
test('native temporal chain uses resident compensated scratch, real F16/F32 and actual sampled sources',{timeout:60000},async t=>{
 const directory=resolve('.frameweave/pa3-native-time/gpu');await mkdir(directory,{recursive:true});
 const boot=nativeBootstrapProgram(1,1,false,256*1024**2),client=await NativeGpuClient.create(boot,{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-debug/frameweave-native-gpu.exe')});let scope:NativeRecordingScope|undefined;
 try{
  const stats=await client.stats();scope=new NativeRecordingScope({version:1,backend:'native-wgpu',hardwareVerified:true,owner:boot.session,capabilities:stats.capabilities});const g=scope.api,kernel=await g.compile(generator),cases:{name:string;index:number;expected:number[];format:string}[]=[],proof:object[]=[],calls:number[]=[];
  const source=(lookup:(time:number)=>Pixel,alpha:'premultiplied'|'straight'|'opaque'='premultiplied'):NativeTimeSource=>async sample=>{calls.push(sample.time);return g.run(kernel,[],{parameters:Float32Array.from(lookup(sample.time)),output:{width:4,height:2,color:linear709,format:'rgba32float',alpha}});};
  for(const format of ['rgba32float','rgba16float'] as const){
   const fx=createNativeTimeEffects({gpu:g,width:4,height:2,format});
   const record=async(name:string,result:Promise<any>,expected:number[])=>{const image=await result;scope!.publish(image);cases.push({name:name+'/'+format,index:g.stats().activeImages-1,format,expected:format==='rgba16float'?expected.map(v=>fromHalf(toHalf(v))):expected});};
   const indexed=source(time=>pixels[Math.round(time*4)]);
   await record('exact',fx.retime(indexed,{time:.25},ctx),Array.from(pixels[1]));
   await record('frame-mix',fx.frameBlend(indexed,{time:.125,fps:4},ctx),temporalReference([{pixel:pixels[0],weight:.5},{pixel:pixels[1],weight:.5}],'weighted-mean'));
   for(const mode of ['add','blend','maximum','minimum','screen','in-front','in-back'] as const){const weights=[.8,.4,.2];await record('echo-'+mode,fx.echo(indexed,{time:.5,echoes:2,interval:-.25,intensity:.8,decay:.5,mode},ctx),temporalReference([...pixels].reverse().map((pixel,i)=>({pixel,weight:weights[i]})),mode));}
   await record('trail-mean',fx.trails(indexed,{time:.5,duration:.5,count:3,falloff:'linear',mode:'weighted-mean'},ctx),temporalReference([{pixel:pixels[2],weight:1},{pixel:pixels[1],weight:.5},{pixel:pixels[0],weight:0}],'weighted-mean'));
   const linear=(time:number):Pixel=>f32([time-.75,2+2*time,.125,.5]),actualTimes=Array.from(shutterSamples({count:6,angleDegrees:360},ctx),s=>s.time);
   await record('shutter',fx.shutterBlur(source(linear),{count:6,angleDegrees:360},ctx),temporalReference(actualTimes.map(time=>({pixel:linear(time),weight:1/6})),'weighted-mean'));
   await record('wide-window',fx.wideTime(source(linear),{time:.5,before:.25,after:.5,count:3,weight:'triangle'},ctx),temporalReference([.375,.625,.875].map((time,i)=>({pixel:linear(time),weight:[1/3,1,1/3][i]})),'weighted-mean'));
   await record('posterize',fx.posterize(indexed,{time:.371,rate:4},ctx),Array.from(pixels[1]));
   await record('strobe-zero',fx.strobe(indexed,{period:1,onDuration:.25},ctx),[0,0,0,0]);
   await record('strobe-hold',fx.strobe(indexed,{period:1,onDuration:.25,off:'hold'},ctx),Array.from(pixels[1]));
   await record('cross-time',fx.timeCrossfade(indexed,indexed,{fromTime:0,toTime:.5,progress:.371},ctx),temporalReference([{pixel:pixels[0],weight:1-.371},{pixel:pixels[2],weight:.371}],'weighted-mean'));
   const opaque=source(time=>time===0?[-.25,4,.125,1]:[1.5,-.5,2,1],'opaque');
   await record('time-difference',fx.timeDifference(opaque,opaque,{targetTime:0},ctx),[1.75,4.5,1.875,1]);
   await record('time-subtract',fx.timeDifference(opaque,opaque,{targetTime:0,mode:'subtract'},ctx),[1.75,-4.5,1.875,1]);
   const emission:Pixel=[-.25,4,.5,0];await record('PM-zero-alpha-emission',fx.retime(source(()=>emission),{},ctx),Array.from(emission));
   await record('straight-hidden',fx.retime(source(()=>[65000,-65000,1,0],'straight'),{},ctx),[0,0,0,0]);
   const cancellation=[f32([1e20,-1e20,8,1]),[1,3,4,1],f32([-1e20,1e20,0,1])] as Pixel[];
   await record('catastrophic-cancellation',fx.wideTime(source(time=>cancellation[Math.round(time)]),{time:1,before:1.5,after:1.5,count:3},ctx),[1/3,1,4,1]);
   await record('transparent-range',fx.frameBlend(indexed,{time:-.125,fps:4,range:{start:0,end:.5,boundary:'transparent'}},ctx),Array.from(pixels[0],v=>v*.5));
   assert.equal(fx.stats().historyImages,0);
  }
  const packet=scope.packet(),{parameters,output:_output,external,kernelOffset,...program}=packet;
  await client.reconfigure({...program,version:2,session:boot.session,slots:1,maxBytes:256*1024**2,display:null});
  const frozen=new Map<string,number[]>();for(const frame of [3,0,3]){const ticket=await client.submit(frame,parameters);await ticket.completed;
   for(const row of cases)await t.test(row.name+' frame '+frame,async()=>{const result=await client.inspectForTest(ticket.slot,row.index);let error=0;for(let i=0;i<result.pixels.length;i++){assert.ok(Number.isFinite(result.pixels[i]));error=Math.max(error,Math.abs(result.pixels[i]-row.expected[i%4]));}const budget=row.format==='rgba16float'?0:4e-5;assert.ok(error<=budget,JSON.stringify({name:row.name,error,budget,actual:result.pixels.slice(0,4),expected:row.expected}));if(frozen.has(row.name))assert.deepEqual(result.pixels,frozen.get(row.name));else frozen.set(row.name,result.pixels);proof.push({name:row.name,frame,error,budget});});
  }
  await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,calls,recording:g.stats(),owner:await client.stats()},null,2));
 }finally{await client.close();await scope?.api.dispose();}
});
