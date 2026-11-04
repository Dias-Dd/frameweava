import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {fromHalf,toHalf} from '../src/media/surface.ts';

test('new 3D cards: real image/HDR resources, camera/light/jitter, Glow, Layer and random frames',{timeout:150000},async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=resolve('.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
 const out=resolve('.frameweave/pa3-native-cards');await mkdir(out,{recursive:true});const proof=[],cameraHashes=new Map<string,string>();
 for(const entry of ['cards.tsx','cards-half.tsx','cards-pins.tsx','cards-composition.tsx']){
  const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/native-controls-scene',entry)),renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/native-admission-7d6ea4c/debug/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{const hashes=new Map<number,string>();for(const frame of entry==='cards.tsx'||entry==='cards-half.tsx'?[11,0,23,11]:[11]){
   const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const exported=await renderer.exportNativeBuffer(ticket,'cards/result');assert.ok(exported.values instanceof Float32Array);const values=exported.values;
   assert.equal(values.length,480*270*4);assert.ok(values.every(Number.isFinite));assert.ok(values.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(values.some((v,i)=>i%4===3&&v===0));
   if(frame===23){assert.ok(values.some((v,i)=>i%4!==3&&v<0));assert.ok(values.some((v,i)=>i%4!==3&&v>1));}
   if(entry==='cards-half.tsx')assert.ok(values.every(v=>Object.is(v,fromHalf(toHalf(v)))),'actual F16 logical result');
   const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),sha256=createHash('sha256').update(bytes).digest('hex');if(hashes.has(frame))assert.equal(sha256,hashes.get(frame));hashes.set(frame,sha256);
   if(frame===11){await writeFile(join(out,entry+'.f32'),bytes);cameraHashes.set(entry,sha256);}proof.push({entry,frame,sha256,wallMs:performance.now()-begin});
  }
  if(hashes.size>1)assert.notEqual(hashes.get(0),hashes.get(23));const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,wallMs:performance.now()-started,stats});
  }finally{await renderer.close();}
 }
 assert.equal(new Set(['cards.tsx','cards-pins.tsx','cards-composition.tsx'].map(k=>cameraHashes.get(k))).size,3);
 await writeFile(join(out,'stage.json'),JSON.stringify({version:1,proof,scope:'New mesh profiles only. Pixel math is native GPU; JS/Scalar control uses the existing isolation and FrameContext. Separate PM emission unit remains a known failing core case until fixed.'},null,2));
});
