import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {appendNativeComposite} from '../modules/native-gpu/composite.ts';
import {configureNativeDisplay} from '../modules/native-gpu/display.ts';
import {compositeMedia} from '../src/media/compositor.ts';
import {surfaceFromPixels,pixelsFromSurface,linear709,acescg,toHalf,fromHalf} from '../src/media/surface.ts';
import type {TVG,LayerSpec} from '../src/core/types.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const leaf=(id:string,source=id,parent?:string):LayerSpec=>({id,parent,start:0,end:2,source:{$ref:source,port:'surface'}});
test('native composition matches CPU reference for HDR, negative RGB, Alpha, blends, transform, small mask and isolated groups',async()=>{
 const colors=[[4,-.5,2,.75],[-.25,-2,3,.5],[0,0,0,.25]],scope=new NativeRecordingScope(),outputs=new Map<string,number>(),surfaces:Record<string,ReturnType<typeof surfaceFromPixels>>={};
 for(const [i,id] of ['a','b','m'].entries()){
  const width=id==='m'?4:8,height=id==='m'?2:4;
  const kernel=await scope.api.compile({abiVersion:1,id:'test/composite-'+id,version:'1.0.0',inputCount:0,parameterWords:4,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),paramF32(1u),paramF32(2u),paramF32(3u));}'});
  scope.publish(await scope.api.run(kernel,[],{parameters:new Float32Array(colors[i]),output:{width,height,format:'rgba32float',alpha:'straight',color:linear709}}));
  const data=Array.from({length:width*height*4},(_,n)=>colors[i][n%4]);surfaces[id+':surface']=surfaceFromPixels(width,height,data,{format:'rgba32float',color:linear709,alpha:'straight'});outputs.set(id+':surface',i);
 }
 const packet=scope.packet(),sets:LayerSpec[][]=['source-over','lighter','multiply','screen'].map(blend=>[leaf('a'),{...leaf('b'),blend:blend as LayerSpec['blend'],opacity:.7}]);
 sets.push([{...leaf('a'),x:.2,y:.3,rotation:5,mask:{$ref:'m',port:'surface'}}],[{id:'group',start:0,end:2,opacity:.5,x:.2},leaf('a','a','group'),leaf('b','b','group')]);
 let client:NativeGpuClient|undefined,sawNegative=false,sawHdr=false;
 try{for(const layers of sets){
  const tvg:TVG={schemaVersion:'0.1',composition:{id:'test',width:8,height:4,fps:{num:24,den:1},durationInFrames:2,background:'transparent',seed:1},effects:[],resources:[],layers,stages:['a','b','m'].map(id=>({id,engine:'native-gpu',inputs:{},outputs:{surface:'surface'},props:{},time:{start:0,duration:2,offset:0,rate:{num:1,den:1}},seek:'stateless',width:id==='m'?4:8,height:id==='m'?2:4}))};
  const p:NativeProgram={version:2,session:client?.program.session??randomBytes(32).toString('hex'),slots:1,maxBytes:1024**2,images:structuredClone(packet.images),kernels:structuredClone(packet.kernels),passes:structuredClone(packet.passes),display:null},parameters=structuredClone(packet.parameters),output=appendNativeComposite(p,parameters,tvg,0,outputs,8,4);
  if(client)await client.reconfigure(p);else client=await NativeGpuClient.create(p,{executable});
  const t=await client.submit(0,parameters);await t.completed;const {pixels}=await client.inspectForTest(t.slot,output);
  const expected=pixelsFromSurface(compositeMedia({width:8,height:4,compositionWidth:8,compositionHeight:4,background:'transparent',workingColor:linear709,frame:0,layers,surfaces,sizes:{'a:surface':{width:8,height:4},'b:surface':{width:8,height:4},'m:surface':{width:4,height:2}}}));
  const error=Math.max(...pixels.map((v,i)=>Math.abs(v-expected[i])));assert.ok(error<3e-6,JSON.stringify({layers,error}));sawNegative ||= pixels.some(v=>v<0);sawHdr ||= pixels.some(v=>v>1);
 }assert.ok(sawNegative);assert.ok(sawHdr);}finally{await client?.close();}
});
test('binary16 native publication preserves ties, subnormals, extended values and overflow semantics without scans',async()=>{
 const values=[1+2**-11,1+3*2**-11,2**-24,-(2**-24),65504,-.125,4,0],scope=new NativeRecordingScope(),k=await scope.api.compile({abiVersion:1,id:'test/native-half',version:'1.0.0',inputCount:0,parameterWords:8,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(p.x),0.,0.,1.);}'});
 scope.publish(await scope.api.run(k,[],{parameters:new Float32Array(values),output:{width:8,height:1,format:'rgba16float',alpha:'opaque',color:linear709}}));const v=scope.packet(),{external,kernelOffset,output,parameters,...resources}=v,p:NativeProgram={...resources,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:1024**2,display:null},c=await NativeGpuClient.create(p,{executable});
 try{const t=await c.submit(0,v.parameters);await t.completed;const {pixels}=await c.inspectForTest(t.slot,v.output);for(let i=0;i<values.length;i++)assert.equal(pixels[4*i],fromHalf(toHalf(values[i])));}finally{await c.close();}
});
test('native final output refuses preview-only ACES2 approximation and honors reference-white in SDR shader',()=>{
 const p:NativeProgram={version:2,session:'a'.repeat(64),slots:1,maxBytes:1024**2,images:[{width:1,height:1,format:'rgba32float',alpha:'straight',color:acescg}],kernels:[],passes:[],display:null};
 assert.throws(()=>configureNativeDisplay(p,0,'delivery'),{code:'E_NATIVE_COLOR_ACCURACY'});p.images[0].color={...linear709,referenceWhiteNits:200};configureNativeDisplay(p,0,'delivery');assert.match(p.display!.shader,/vec3f\(2,0,0\)/);
});
