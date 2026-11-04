import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDispatcher} from '../modules/spidermonkey-host/bootstrap.ts';
import {defineNativeStage,linear709} from '../modules/native-gpu/authoring.ts';
import {decodeHostValue,encodeHostValue} from '../modules/spidermonkey-host/codec.ts';
import {PreviewSegments} from '../modules/native-gpu/preview-segments.ts';
import {evaluate,keyframes} from '../src/core/animation.ts';
import {compositionContext,frameContext} from '../src/core/time.ts';
import type {TVG,StageSpec} from '../src/core/types.ts';

test('native checkpoint restores wire data, bounds storage and prohibits GPU mutation in hooks',async()=>{
 let state={count:7,bytes:Uint8Array.of(3,8,21)},refuseGpuMutation=false;
 const dispatcher=nativeDispatcher(defineNativeStage(async({gpu,width,height})=>{
  const kernel=await gpu.compile({abiVersion:1,id:'test/preview-checkpoint',version:'1.0.0',inputCount:0,parameterWords:0,
   code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,1.);}'});
  return {
   checkpoint:{version:1,capture:async()=>{if(refuseGpuMutation)await gpu.dispose();return state;},restore(snapshot){
    state=snapshot as typeof state;
   }},
   renderAt:()=>gpu.run(kernel,[],{output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709}}),
  };
 }),()=>{});
 const ready=await dispatcher('native.init',{width:4,height:2,seed:0,resources:{}}) as {previewCheckpoint?:boolean};
 try{
  assert.equal(ready.previewCheckpoint,true);
  const before=await dispatcher('native.preview.capture',{bytes:1024}) as Uint8Array;
  assert.deepEqual(decodeHostValue(before),state);
  await assert.rejects(dispatcher('native.preview.capture',{bytes:8}),{code:'E_NATIVE_PREVIEW_CHECKPOINT_DATA'});
  await dispatcher('native.preview.restore',encodeHostValue({count:9,bytes:Uint8Array.of(34)}));
  assert.deepEqual(state,{count:9,bytes:Uint8Array.of(34)});
  await dispatcher('native.preview.restore',before);
  assert.deepEqual(state,{count:7,bytes:Uint8Array.of(3,8,21)});
  refuseGpuMutation=true;
  await assert.rejects(dispatcher('native.preview.capture',{bytes:1024}),{code:'E_NATIVE_PREVIEW_CHECKPOINT_DATA'});
  refuseGpuMutation=false;
  assert.deepEqual(await dispatcher('native.preview.capture',{bytes:1024}),before);
 }finally{await dispatcher('dispose',{});}
});

function timeline():TVG {
 const stage=(id:string,start:number):StageSpec=>({id,engine:'native-gpu',inputs:{},outputs:{surface:'surface'},
  props:{parameters:[1]},time:{start,duration:10080,offset:0,rate:{num:1,den:1}},seek:'stateless'});
 return {schemaVersion:'0.1',composition:{id:'timeline',width:640,height:360,fps:{num:24,den:1},durationInFrames:30240,background:'transparent',seed:0},
  stages:[stage('a',0),stage('b',10080),stage('c',20160)],resources:[],effects:[],layers:[
   {id:'a',source:{$ref:'a',port:'surface'},start:0,end:10080},
   {id:'b',source:{$ref:'b',port:'surface'},start:10080,end:20160},
   {id:'c',source:{$ref:'c',port:'surface'},start:20160,end:30240},
  ]};
}

test('declarative region identities keep unedited shots and invalidate timing, layer and Stage edits',()=>{
 const original=timeline(),before=new PreviewSegments(original);
 const a=before.signature(0),b=before.signature(10080),c=before.signature(20160);
 assert.equal(before.signature(10079),a);
 assert.equal(before.signature(20159),b);
 const changed=structuredClone(original);changed.stages[1].props.parameters=[2];
 const after=new PreviewSegments(changed);
 assert.deepEqual(after.retainFrom(before),[{start:0,end:10080,signature:a},{start:20160,end:30240,signature:c}]);
 changed.layers[2].opacity=.5;
 assert.deepEqual(new PreviewSegments(changed).retainFrom(before),[{start:0,end:10080,signature:a}]);
 changed.composition.seed=999;
 assert.deepEqual(new PreviewSegments(changed).retainFrom(before),[]);
});


test('keyframe edits invalidate only dependent intervals with fractional Stage time and Layer time',()=>{
 const original=timeline(),stage=original.stages[1],layer=original.layers[1];
 stage.time.offset=.25;
 stage.time.rate={num:3,den:2};
 const exposure=(value:number)=>keyframes([{frame:0,value:1},{frame:1500,value:2},{frame:3000,value},
  {frame:4500,value:4},{frame:6000,value:5}]);
 stage.props.parameters=[exposure(3)];
 const opacity=(value:number)=>keyframes([{frame:10800,value:1},{frame:12080,value},
  {frame:13200,value:.5},{frame:14000,value:.75}]);
 layer.opacity=opacity(.6);
 const before=new PreviewSegments(original),edited=structuredClone(original);
 edited.stages[1].props.parameters=[exposure(8)];
 const after=new PreviewSegments(edited);
 for(const frame of [10079,10080,10800,10801,11079,11080,12080,13079,13080,13200,14000,16000,20160])before.signature(frame);
 for(const frame of [11079,11080,12080,13079,13080]){
  assert.equal(after.signature(frame)===before.signature(frame),frame<11080||frame>=13080);
 }
 const afterLayer=structuredClone(edited);
 afterLayer.layers[1].opacity=opacity(.25);
 const combined=new PreviewSegments(afterLayer);
 for(const {start,end} of combined.retainFrom(before)){
  for(let frame=Math.max(start,10080);frame<Math.min(end,20160);frame++){
   assert.deepEqual(evaluate(stage.props,frameContext(original,stage,frame)),
    evaluate(afterLayer.stages[1].props,frameContext(afterLayer,afterLayer.stages[1],frame)));
   assert.deepEqual(evaluate(layer,compositionContext(original,frame)),
    evaluate(afterLayer.layers[1],compositionContext(afterLayer,frame)));
  }
 }
 assert.equal(combined.signature(10800),before.signature(10800));
 assert.notEqual(combined.signature(10801),before.signature(10801));
 assert.equal(combined.signature(13200),before.signature(13200));
});
