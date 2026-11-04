import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {frameContext} from '../src/core/time.ts';
import {fromHalf,toHalf} from '../src/media/surface.ts';
import {shutterTimeSamples} from '../modules/pro-animation/src/native-time/plans.ts';
import {inkAt} from '../modules/pro-animation/src/stroke-animation/profiles.ts';
import {prepared} from '../modules/pro-animation/validation/native-stroke-scene/prepared.ts';
import {strokeOptions} from '../modules/pro-animation/validation/native-stroke-scene/animation.ts';
test('kurbo/variable width/Clipper2/Earcut -> native gradient/mesh -> actual shutter/Glow/Layer',{timeout:120000},async()=>{
 const seamOnly=process.env.FRAMEWEAVE_STROKE_SEAM_ONLY==='1',directory=resolve('.frameweave/pa3-native-stroke',seamOnly?'stage-seam':'stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');const proof:object[]=[];
 for(const entry of ['project.tsx','half.tsx']){const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/native-stroke-scene',entry)),buildMs=performance.now()-started,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});try{let repeated:string|undefined;
  for(const frame of seamOnly&&entry==='half.tsx'?[18]:[18,0,47,18]){const start=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const c=frameContext(build.manifest,build.manifest.stages[0],frame),sample=shutterTimeSamples({count:8,angleDegrees:180},c).at(0);let maxPaletteError=0;
   for(const [i,item]of prepared.entries()){const actual=await renderer.exportNativeBuffer(ticket,'stroke/geometry-'+i),palette=await renderer.exportNativeBuffer(ticket,'stroke/palette-'+i);assert.ok(actual.values instanceof Float32Array);assert.deepEqual(actual.values,new Float32Array(item.mesh.positions));assert.ok(palette.values instanceof Float32Array);assert.equal(palette.values.length,1024*4);const options=strokeOptions(i,sample.context),stops=options.ink!(sample.context);for(let j=0;j<1024;j++){const expected=inkAt(stops,j/(item.mesh.closed?1024:1023)).map(v=>v*.9);for(let k=0;k<4;k++)maxPaletteError=Math.max(maxPaletteError,Math.abs(palette.values[j*4+k]-expected[k]));}}
   assert.ok(maxPaletteError<=4e-5,JSON.stringify({maxPaletteError}));const result=await renderer.exportNativeBuffer(ticket,'stroke/pixels');assert.ok(result.values instanceof Float32Array);const values=result.values;assert.equal(values.length,600*360*4);assert.ok(values.every(Number.isFinite));assert.ok(values.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(values.some((v,i)=>i%4!==3&&v<0));assert.ok(values.some((v,i)=>i%4!==3&&v>1));if(entry==='half.tsx')assert.ok(values.every(v=>Object.is(v,fromHalf(toHalf(v)))));const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===18){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(directory,entry+'.f32'),bytes);}proof.push({entry,frame,hash,maxPaletteError,wallMs:performance.now()-start});
  }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
 }finally{await renderer.close();}}
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,scope:'F64 reference for GPU PM palette + exact explicit F32 geometry lowering. Completed-ticket exports only; no production-effect pixel readbacks.'},null,2));
});
