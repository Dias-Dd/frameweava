import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {frameContext} from '../src/core/time.ts';
import {fromHalf,toHalf} from '../src/media/surface.ts';
import {motionDisplays,motionGeometry} from '../modules/pro-animation/validation/motion-control-scene/motions.ts';
test('26 motion controls -> native triangle buffers -> genuine subframe blur -> Glow -> Layer',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-motion-control/stage');await mkdir(directory,{recursive:true});
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
 const records:object[]=[];for(const entry of ['project.tsx','half.tsx']){
  const start=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/motion-control-scene',entry)),buildMs=performance.now()-start;
  const renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{let frozen:string|undefined;const frameHashes=new Map<number,string>();for(const frame of [18,0,47,18]){
   const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   const vertices=await renderer.exportNativeBuffer(ticket,'motion/vertices');assert.ok(vertices.values instanceof Float32Array);
   const context=frameContext(build.manifest,build.manifest.stages[0],frame),geometry=motionGeometry(motionDisplays(),context,600,400),expected=Float32Array.from(geometry.groups.flatMap(a=>Array.from(a)));assert.equal(geometry.poses.length,26);
   // Integration oracle: CPU authored geometry is already qualified by independent math tests;
   // this checks its actual controlled GPU transfer, not a second algorithm reference.
   assert.deepEqual(vertices.values,expected);
   const result=await renderer.exportNativeBuffer(ticket,'motion/pixels');assert.ok(result.values instanceof Float32Array);const p=result.values;assert.equal(p.length,600*400*4);assert.ok(p.every(Number.isFinite));assert.ok(p.some((v,i)=>i%4!==3&&v<0));assert.ok(p.some((v,i)=>i%4!==3&&v>1));assert.ok(p.every((v,i)=>i%4!==3||v>=0&&v<=1));
   if(entry==='half.tsx')assert.ok(p.every(v=>Object.is(v,fromHalf(toHalf(v)))));
   const bytes=new Uint8Array(p.buffer,p.byteOffset,p.byteLength),hash=createHash('sha256').update(bytes).digest('hex');frameHashes.set(frame,hash);
   if(frame===18){if(frozen)assert.equal(hash,frozen);frozen=hash;await writeFile(join(directory,entry+'.f32'),bytes);await writeFile(join(directory,entry+'.poses.json'),JSON.stringify(geometry.poses,null,2));}
   records.push({entry,frame,hash,wallMs:performance.now()-begin,geometryTransfer:'exact F32',controlFunctions:26});
  }
  assert.notEqual(frameHashes.get(0),frameHashes.get(47));const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);assert.equal(stats.persistentState.buffers,0);records.push({entry,buildMs,stats});
  }finally{await renderer.close();}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,records,source:'26 real pure CPU math functions, original native mesh raster and current native time domain; no pixel CPU callback/second simulation runner'},null,2));
});
