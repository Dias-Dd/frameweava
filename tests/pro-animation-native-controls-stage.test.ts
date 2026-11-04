import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {placedGradient,gaussian,A,B} from '../modules/pro-animation/validation/native-controls-reference.ts';

test('declared PNG/HDR Resources → extended native controls → Layer; public binary inspection and random frames',{timeout:120000},async()=>{
 const out=resolve('.frameweave/pa3-native-controls');await mkdir(out,{recursive:true});
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_PYTHON??=resolve('.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
 const proof=[];
 const preciseBuild=await buildProject(resolve('modules/pro-animation/validation/native-controls-scene/gaussian-proof.tsx'));
 const precise=await Renderer.create(preciseBuild,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/pa3-native-controls/diagnostics-mesh-v1/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 try{
  const blurred=gaussian(placedGradient('stretch'),1),mean=gaussian(blurred,8),reactor=blurred.map((v,i)=>Math.min(Math.abs(v-mean[i])*4,1));let maximum=0;
  for(const frame of [3,0,3]){const ticket=await precise.submitNativeFrame(frame);await ticket.completed;const {values}=await precise.exportNativeBuffer(ticket,'precision/reference');
   for(let i=0;i<640;i++){const q=Math.max(0,Math.min(1,(Math.fround(.371)*(1+Math.fround(.05))-reactor[i])/Math.fround(.05))),coverage=q*q*(3-2*q);for(let c=0;c<4;c++)maximum=Math.max(maximum,Math.abs(values[i*4+c]-(A[c]*(1-coverage)+B[c]*coverage)));}
  }
  assert.ok(maximum<=4e-5,JSON.stringify({installedPackage:'native-image-effects@0.3.0',maximum,budget:4e-5}));proof.push({exactFormerFailureFixture:'installed managed processPa, native owner current baseline',maxError:maximum,budget:4e-5});
 }finally{await precise.close();}
 for(const [entry,format]of [['project.tsx','rgba32float'],['half.tsx','rgba16float']] as const){
  const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/native-controls-scene',entry));
  const compileMs=performance.now()-started,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/pa3-native-controls/diagnostics-mesh-v1/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{let repeated:Float32Array|undefined;for(const frame of [7,0,15,7]){
   const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   const exported=await renderer.exportNativeBuffer(ticket,'controls/controls.pixels');assert.ok(exported.values instanceof Float32Array);const pixels=exported.values;
   const metadata=exported.info.metadata;assert.ok(metadata&&typeof metadata==='object'&&!Array.isArray(metadata));
   assert.equal(pixels.length,640*180*4);assert.equal(metadata.format,format);assert.ok(pixels.every(Number.isFinite));
   // The declared first source is SDR; the second Resource is actual linear HDR.
   // HDR is required when that source contributes, not fabricated at completion 0.
   if(frame!==0){assert.ok(pixels.some((v,i)=>i%4!==3&&v<0),'negative RGB');assert.ok(pixels.some((v,i)=>i%4!==3&&v>1),'HDR');}
   assert.ok(pixels.every((v,i)=>i%4!==3||v>=0&&v<=1));
   if(frame===7){if(repeated)assert.deepEqual(pixels,repeated);repeated=pixels;}
   if(frame===7)await writeFile(join(out,'frame7-'+format+'.f32'),new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength));
   proof.push({entry,format,frame,wallMs:performance.now()-begin,inspection:'explicit public completed-ticket buffer export; no authored readback'});
  }
  const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);
  proof.push({entry,format,compileMs,stats});
  }finally{await renderer.close();await renderer.close();}
 }
 await writeFile(join(out,'stage.json'),JSON.stringify({schemaVersion:1,proof},null,2));
});
