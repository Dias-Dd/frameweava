import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {NativeBufferExporter} from '../modules/native-gpu/data-export.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {cameraRays,thinLensCameraRays} from '../modules/native-gpu/scene-shaders.ts';
import {pathCameraParameters,pathShutterContexts} from '../modules/native-gpu/path-camera.ts';
import {linear709} from '../src/media/surface.ts';import type {FrameContext} from '../src/core/types.ts';
const context:FrameContext={frame:48,globalFrame:48,time:2,globalTime:2,dt:1/24,progress:48/287,fps:{num:24,den:1},durationInFrames:288,seed:19};
test('physical lens validates units and shutter preserves the authoritative affine time map',()=>{
 const frame:any={view:{matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},projectionMatrix:{elements:[1,0,0,0,0,1]}},camera:{projection:'perspective',near:.1,far:100}};
 assert.equal(pathCameraParameters(frame,32,32,context,{apertureRadius:.2,focusDistance:10}).words[25],10);
 for(const lens of [{apertureRadius:-1,focusDistance:10},{apertureRadius:1,focusDistance:0},{apertureRadius:Infinity,focusDistance:10}])assert.throws(()=>pathCameraParameters(frame,32,32,context,lens),{code:'E_NATIVE_PATH_LENS'});
 const poses=pathShutterContexts(context,128,{angleDegrees:180,timeSamples:8});assert.equal(poses.length,8);
 for(let i=0;i<8;i++){const f=((i+.5)/8-.5)*.5;assert.ok(Math.abs(poses[i].time-(2+f/24))<1e-14);assert.equal(poses[i].globalFrame,48+f);}
 const reversed={...context,dt:-1/12};const r=pathShutterContexts(reversed,8,{angleDegrees:720,timeSamples:4});assert.ok(r[0].time<context.time&&r[0].globalFrame>context.globalFrame);
 assert.equal(pathShutterContexts(context,8,{angleDegrees:0,timeSamples:4})[0],context);
 for(const v of [{angleDegrees:-1,timeSamples:4},{angleDegrees:180,timeSamples:3}])assert.throws(()=>pathShutterContexts(context,8,v),{code:'E_NATIVE_PATH_SHUTTER'});
 assert.throws(()=>pathShutterContexts({...context,dt:0},8,{angleDegrees:180,timeSamples:4}),{code:'E_NATIVE_PATH_SHUTTER'});
});
test('real GPU lens rays share their pinhole focal plane; zero radius and primary guides preserve pinhole rays',async()=>{
 const scope=new NativeRecordingScope(),g=scope.api;scope.sealInitialization();scope.beginFrame();
 const w=32,h=24,groups=[w,h,1] as const,bindings=[{type:'f32',access:'read_write'},{type:'f32',access:'read_write'}] as const;
 const plain=await g.compileCompute({abiVersion:1,id:'test/lens/pinhole',version:'1.0.0',bindings:[...bindings],parameterWords:24,workgroupSize:[8,8,1],code:cameraRays});
 const lens=await g.compileCompute({abiVersion:1,id:'test/lens/physical',version:'1.0.0',bindings:[...bindings],parameterWords:28,workgroupSize:[8,8,1],code:thinLensCameraRays});
 for(const [name,radius,seed,thin] of [['pinhole',0,42,false],['zero',0,42,true],['lens',.7,42,true],['guide',.7,0,true],['center',0,0,false]] as const){
  const words=new Float32Array(thin?28:24);words.set([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);words.set([.8,.6,.25,100],16);new Uint32Array(words.buffer).set([1,w,h,seed],20);if(thin)words.set([radius,10],24);
  const a=await g.createBuffer({type:'f32',length:w*h*3}),b=await g.createBuffer({type:'f32',length:w*h*3});
  await g.dispatch(thin?lens:plain,[a,b],{workItems:groups,parameters:words});await g.publishBuffer(name+'-o',a,{version:1});await g.publishBuffer(name+'-d',b,{version:1});
 }
 const blank=await g.compile({abiVersion:2,id:'test/lens/output',version:'1.0.0',inputCount:0,dataInputs:[],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,1.);}'});
 scope.publish(await g.run(blank,[],{output:{width:1,height:1,format:'rgba32float',color:linear709,alpha:'opaque'}}));
 const {parameters,output,external,kernelOffset,moduleOffset,...packet}=scope.packet();
 const program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,display:null};
 const exporter=await NativeBufferExporter.create();exporter.configure(program);const client=await NativeGpuClient.create(program,{executable:await nativeExecutable()});
 try{const ticket=await client.submit(0,parameters);await ticket.completed;const values:Record<string,Float32Array>={};
  for(const name of ['pinhole','zero','lens','guide','center'])for(const axis of ['o','d']){const v=await exporter.read(client,ticket,name+'-'+axis);assert.ok(v.values instanceof Float32Array);values[name+'-'+axis]=v.values;}
  assert.deepEqual(values['zero-o'],values['pinhole-o']);assert.deepEqual(values['zero-d'],values['pinhole-d']);assert.deepEqual(values['guide-o'],values['center-o']);assert.deepEqual(values['guide-d'],values['center-d']);
  let focusError=0,radiusMax=0,different=0;
  for(let i=0;i<w*h;i++){const p=i*3;const A=values['lens-o'].subarray(p,p+3),D=values['lens-d'].subarray(p,p+3),B=values['pinhole-o'].subarray(p,p+3),E=values['pinhole-d'].subarray(p,p+3);
   const t=(-10-A[2])/D[2],u=(-10-B[2])/E[2];for(let k=0;k<3;k++)focusError=Math.max(focusError,Math.abs(A[k]+D[k]*t-(B[k]+E[k]*u)));
   const pupilX=A[0]-D[0]*(-.25/D[2]),pupilY=A[1]-D[1]*(-.25/D[2]);radiusMax=Math.max(radiusMax,Math.hypot(pupilX,pupilY));if(Math.hypot(A[0]-B[0],A[1]-B[1])>.01)different++;
   assert.ok(Math.abs(A[2]+.25)<2e-6);assert.ok(Math.abs(Math.hypot(...D)-1)<2e-6);
  }
  assert.ok(focusError<1e-5,String(focusError));assert.ok(radiusMax<=.70001&&radiusMax>.65);assert.ok(different>w*h*.95);console.log(JSON.stringify({profile:'physical-thin-lens',rays:w*h,focusError,radiusMax,different}));
 }finally{await client.close();await exporter.close();await g.dispose();}
});
import {createNativePathTracer} from '../modules/native-gpu/path-tracer.ts';
import type {NativeStageInit} from '../modules/native-gpu/authoring.ts';
test('hardware shutter integrates moving scene poses and keeps AOV guides at nominal frame time',async()=>{
 for(const blurred of [false,true]){
  const scope=new NativeRecordingScope(),g=scope.api,sampled:number[]=[];
  const path=await createNativePathTracer({gpu:g,width:1,height:1,seed:1,resources:{}} as NativeStageInit,{
   geometries:{quad:{restPositions:[[-.1,-1,0],[.1,-1,0],[.1,1,0],[-.1,1,0]],indices:[0,1,2,0,2,3]}},
   materials:{lamp:{kind:'emissive',radiance:[8,4,2]}},nodes:[{id:'lamp',geometry:'quad',material:'lamp'}],
   environment:{lower:[0,0,0],upper:[0,0,0]},sun:{direction:[0,1,0],radiance:[0,0,0]},
   sample(c){sampled.push(c.time);return {camera:{projection:'orthographic',position:[0,0,4],target:[0,0,0],near:.1,far:10,viewHeight:.00001},
    transforms:{lamp:[1,0,0,24*(c.time-1),0,1,0,0,0,0,1,0]}};},
  },{samples:8,maxBounces:0,aovs:true,shutter:blurred?{angleDegrees:360,timeSamples:8}:undefined});
  scope.sealInitialization();scope.beginFrame();const image=await path.renderAt({...context,time:1,frame:24,globalFrame:24,globalTime:1},{},{});
  scope.publish(image);await g.publishBuffer('beauty',await g.imageToBuffer!(image,{version:1}),{version:1});
  const {parameters,output,external,kernelOffset,moduleOffset,...packet}=scope.packet();
  const program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,rayQuery:true,display:null};
  const exporter=await NativeBufferExporter.create();exporter.configure(program);const client=await NativeGpuClient.create(program,{executable:await nativeExecutable()});
  try{const ticket=await client.submit(0,parameters);await ticket.completed;const actual=(await exporter.read(client,ticket,'beauty')).values;
   assert.deepEqual(Array.from(actual),blurred?[2,1,.5,1]:[8,4,2,1]);
   const guide=(await exporter.read(client,ticket,'path-guide')).values;assert.equal(guide[7],1);assert.ok(Math.abs(guide[3]-3.9)<1e-6);
   assert.equal(sampled.length,blurred?9:1);console.log(JSON.stringify({profile:'shutter-hardware',blurred,actual:Array.from(actual),scenePoses:sampled.length}));
  }finally{await client.close();await exporter.close();await path.dispose?.();await g.dispose();}
 }
});
