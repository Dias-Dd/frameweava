import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {frameContext} from '../src/core/time.ts';
import {evaluate} from '../src/core/animation.ts';
import {fromHalf,toHalf} from '../src/media/surface.ts';
import {prepared,proof} from '../modules/pro-animation/validation/smart-morph-scene/prepared.ts';
import {inkOpacity,inkColor,xShift,morphProgress} from '../modules/pro-animation/validation/smart-morph-scene/animation.ts';
import {morphSources} from '../modules/pro-animation/validation/smart-morph-scene/cases.ts';
import {createSmartMorphEngine,prepareSmartMorph,interpolateSmartMorph} from '../modules/pro-animation/src/smart-path/index.ts';
import {directSmartMorphFactory} from './helpers/pa3-smart-morph.ts';
test('real EffectCraft curved/compound Morph -> Clipper2/Earcut fill -> native16/32 signed HDR -> original Glow/Layer',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-smart-morph/stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
 const records:object[]=[],engine=await createSmartMorphEngine(directSmartMorphFactory),source=morphSources(),curved=await prepareSmartMorph(engine,source.ring,source.star,{contourMap:[0,1],firstVerticesMatch:false,quality:100,addVertices:{mode:'total',value:30}}),rigid=await prepareSmartMorph(engine,source.box,source.turned,{oneToOne:true,addVertices:null,bendingResistance:100});
 try{for(const entry of ['project.tsx','half.tsx']){
  const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/smart-morph-scene',entry)),buildMs=performance.now()-started,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{let repeated:string|undefined;for(const frame of [4,0,7,4]){
   const start=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const c=frameContext(build.manifest,build.manifest.stages[0],frame),geometry=await renderer.exportNativeBuffer(ticket,'morph/geometry'),palette=await renderer.exportNativeBuffer(ticket,'morph/palette');assert.ok(geometry.values instanceof Float32Array);assert.ok(palette.values instanceof Float32Array);
   const a=await interpolateSmartMorph(engine,curved,morphProgress,c),b=await interpolateSmartMorph(engine,rigid,morphProgress,c);assert.deepEqual([a,b],proof.trace[frame].paths,'fresh original WASM time query matches frozen geometry preparation');
   const delta=evaluate(xShift,c),opacity=evaluate(inkOpacity,c),alpha=inkColor[3]*opacity;let maxGeometryError=0,maxPaletteError=0,maxMatrixError=0;const matrix=await renderer.exportNativeBuffer(ticket,'morph/matrix');assert.ok(matrix.values instanceof Float32Array);const expectedMatrix=[2/640,0,0,0,0,-2/400,0,0,0,0,1,0,2*delta/640-1,1,0,1];for(let i=0;i<16;i++)maxMatrixError=Math.max(maxMatrixError,Math.abs(matrix.values[i]-expectedMatrix[i]));assert.ok(maxMatrixError<=4e-8,JSON.stringify({maxMatrixError}));
   assert.equal(geometry.values.length,prepared[frame].positions.length);for(let i=0;i<geometry.values.length;i++){const expected=Math.fround(prepared[frame].positions[i]);maxGeometryError=Math.max(maxGeometryError,Math.abs(geometry.values[i]-expected));}
   const ink=inkColor.map((v,i)=>i<3?v*alpha:alpha);for(let i=0;i<palette.values.length;i++)maxPaletteError=Math.max(maxPaletteError,Math.abs(palette.values[i]-ink[i%4]));assert.ok(maxGeometryError<=4e-5,JSON.stringify({maxGeometryError}));assert.ok(maxPaletteError<=4e-6,JSON.stringify({maxPaletteError}));
   const result=await renderer.exportNativeBuffer(ticket,'morph/pixels');assert.ok(result.values instanceof Float32Array);const values=result.values;assert.equal(values.length,640*400*4);assert.ok(values.every(Number.isFinite));assert.ok(values.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(values.some((v,i)=>i%4!==3&&v<0));assert.ok(values.some((v,i)=>i%4!==3&&v>1));assert.ok(values.some((v,i)=>i%4===3&&v===0));if(entry==='half.tsx')assert.ok(values.every(v=>Object.is(v,fromHalf(toHalf(v)))));
   const hole=values[(135*640+Math.round(150+delta))*4+3],body=values[(135*640+Math.round(455+delta))*4+3];assert.equal(hole,0);assert.ok(body>.3);const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===4){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(directory,entry+'.f32'),bytes);}records.push({entry,frame,hash,maxGeometryError,maxPaletteError,maxMatrixError,hole,body,wallMs:performance.now()-start,preparation:prepared[frame].preparation});
  }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);records.push({entry,buildMs,stats});
  }finally{await renderer.close();}
 }}finally{await engine.dispose();}
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,records,scope:'Original Rust curve and compound correspondence/interpolation explicitly precomputed for8 integer frames; fresh original WASM time-query comparison; native single-owner signed HDR fill/Glow/Layer in F16/F32, random4/0/7/4, existing CPU diagnostic buffer exports after ticket completion. No automatic upstream Stage sampling or native-host WASM integration claim.'},null,2));
});
