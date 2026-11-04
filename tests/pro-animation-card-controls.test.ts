import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeTransitions} from '../modules/pro-animation/src/native-transitions/index.ts';
import {linear709} from '../src/media/surface.ts';
import type {NativeGpuScope} from '../modules/native-gpu/authoring.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
test('new mesh controls fail before recording for invalid camera/material/resources/cancellation',async()=>{
 let recordings=0;const gpu={capabilities:()=>({backend:'native-wgpu',hardwareVerified:true,nativeMesh:{version:1,float32Blendable:true,exactMaxTriangles:256},limits:{maxStorageBufferBindingSize:256*1024**2}}),compile:async()=>{recordings++;throw Error('must not compile');}} as unknown as NativeGpuScope;
 const fx=createNativeTransitions({gpu}),image={info:{width:32,height:20,format:'rgba32float',alpha:'premultiplied',color:linear709}} as GpuPixelImage;
 const controller=new AbortController();controller.abort();const bad=[
  {geometry:'mesh',rows:0},{geometry:'mesh',rows:100,columns:100},{geometry:'mesh',rows:2,cells:[2,2]},
  {geometry:'mesh',flipDirection:'wrong'},{geometry:'mesh',material:{roughness:1}},
  {geometry:'mesh',camera:{system:'composition',projection:[1]}},{geometry:'mesh',lighting:{type:'composition'}},
  {geometry:'mesh',positionJitter:{amount:[1,1,1]}},{geometry:'mesh',rotationJitter:{amount:[NaN,1,1]}},
  {geometry:'mesh',backside:'wrong'},{geometry:'mesh',outputSize:[Infinity,20]},{geometry:'mesh',format:'rgba8'},
  {geometry:'orthographic',camera:{}},{geometry:'mesh',order:'gradient'},{geometry:'mesh',cardScale:-1},
  {geometry:'mesh',signal:controller.signal},
 ];for(const options of bad)await assert.rejects(()=>fx.cardFlipWipe(image,image,{progress:.5,...options} as never),e=>['E_PA_CARD','E_NATIVE_MESH_BUDGET','E_RENDER_CANCELLED'].includes((e as {code:string}).code));assert.equal(recordings,0);
});
