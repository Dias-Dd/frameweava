import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDispatcher} from '../modules/spidermonkey-host/bootstrap.ts';
import {defineNativeStage,linear709} from '../modules/native-gpu/authoring.ts';
import {NativeGraphDecoder,type NativeGraphPacket} from '../modules/native-gpu/graph-template.ts';
import {nativeMetadataBytes} from '../modules/native-gpu/capacity.ts';

function dispatcher(){
 const factory=defineNativeStage(async({gpu,width,height})=>{
  let calls=0;
  const first=await gpu.compile({abiVersion:1,id:'test/template/source',version:'1.0.0',inputCount:0,parameterWords:1,
   code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),0.,0.,1.);}'});
  const branch=await gpu.compile({abiVersion:1,id:'test/template/branch',version:'1.0.0',inputCount:1,parameterWords:0,
   code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p))*2.;}'});
  return {async renderAt(c){
   const image=await gpu.run(first,[],{parameters:Float32Array.of(++calls),output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709}});
   return c.frame%2?gpu.run(branch,[image]):image;
  }};
 });
 return nativeDispatcher(factory,()=>{});
}
const context=(frame:number)=>({frame,globalFrame:frame,time:frame/24,globalTime:frame/24,dt:1/24,
 progress:frame/10,fps:{num:24,den:1},durationInFrames:11,seed:7});
const render=(d:ReturnType<typeof dispatcher>,frame:number)=>d('native.render',{context:context(frame),inputs:{values:{},images:{}},props:{}}) as Promise<NativeGraphPacket>;
const init=(d:ReturnType<typeof dispatcher>,graphTemplateBudget:number)=>d('native.init',{width:4,height:2,seed:7,resources:{},graphTemplateBudget});

test('recorded branches share transport templates while every call runs JS',async()=>{
 const enabled=dispatcher(),plain=dispatcher(),decoder=new NativeGraphDecoder(100_000);
 await init(enabled,100_000);await init(plain,0);
 try{
  const received:NativeGraphPacket[]=[];
  for(const frame of [0,1,0,1,4,5]){
   const wire=await render(enabled,frame),expanded=decoder.expand(wire);
   assert.deepEqual(expanded.packet,await render(plain,frame));
   if(expanded.metadataBytes!==undefined)assert.equal(expanded.metadataBytes,nativeMetadataBytes(expanded.packet));
   received.push(wire);
  }
  assert.equal(received[0].graphTemplate?.id,1);
  assert.equal(received[1].graphTemplate?.id,2);
  assert.equal(received[2].graphTemplate?.id,1);
  assert.equal(received[2].passes,undefined);
  assert.notDeepEqual(received[0].parameters,received[2].parameters);
  assert.equal(decoder.stats().hits,4);
  assert.throws(()=>new NativeGraphDecoder(100_000).expand(received[2]),{code:'E_NATIVE_GRAPH_TEMPLATE'});
 }finally{await enabled('dispose',{});await plain('dispose',{});}
});

test('recorded graphs exceeding the cache budget stay on the full packet path',async()=>{
 const d=dispatcher();
 await init(d,1);
 try{
  for(let i=0;i<2;i++){
   const wire=await render(d,0);
   assert.equal(wire.graphTemplate,undefined);
   assert.equal(wire.passes?.length,1);
  }
 }finally{await d('dispose',{});}
});
