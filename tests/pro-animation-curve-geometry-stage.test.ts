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
import {prepared,trace} from '../modules/pro-animation/validation/curve-geometry-scene/prepared.ts';
import {inkOpacity,inkColor,xShift,geometryTrace} from '../modules/pro-animation/validation/curve-geometry-scene/animation.ts';
test('real original kurbo projection/geometry -> canonical outline -> native16/32 HDR/Glow/Layer',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-curve-geometry/stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
 const records:object[]=[];for(const entry of ['project.tsx','half.tsx']){
  const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/curve-geometry-scene',entry)),buildMs=performance.now()-started,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{let repeated:string|undefined;for(const frame of [4,0,7,4]){
   const start=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const c=frameContext(build.manifest,build.manifest.stages[0],frame),geometry=await renderer.exportNativeBuffer(ticket,'geometry/geometry'),palette=await renderer.exportNativeBuffer(ticket,'geometry/palette');assert.ok(geometry.values instanceof Float32Array);assert.ok(palette.values instanceof Float32Array);
   const live=geometryTrace(trace[frame],c),buffer=await renderer.exportNativeBuffer(ticket,'geometry/trace');assert.ok(buffer.values instanceof Uint32Array);let json='';for(const code of buffer.values)json+=String.fromCharCode(code);const actual=JSON.parse(json);let maxQueryError=0;for(const key of ['source','evaluated','frozenPoint','sourceExpected'])for(let i=0;i<2;i++)maxQueryError=Math.max(maxQueryError,Math.abs(actual[key][i]-live[key as keyof typeof live][i]));assert.ok(maxQueryError<=1e-9);assert.ok(Math.hypot(live.evaluated[0]-live.frozenPoint[0],live.evaluated[1]-live.frozenPoint[1])<=1e-9);
   const delta=evaluate(xShift,c),opacity=evaluate(inkOpacity,c),alpha=inkColor[3]*opacity;let maxGeometryError=0,maxPaletteError=0,maxMatrixError=0;const matrix=await renderer.exportNativeBuffer(ticket,'geometry/matrix');assert.ok(matrix.values instanceof Float32Array);const expectedMatrix=[2/640,0,0,0,0,-2/400,0,0,0,0,1,0,2*delta/640-1,1,0,1];for(let i=0;i<16;i++)maxMatrixError=Math.max(maxMatrixError,Math.abs(matrix.values[i]-expectedMatrix[i]));assert.ok(maxMatrixError<=4e-8,JSON.stringify({maxMatrixError}));
   assert.equal(geometry.values.length,prepared[frame].positions.length);for(let i=0;i<geometry.values.length;i++){const expected=Math.fround(prepared[frame].positions[i]);maxGeometryError=Math.max(maxGeometryError,Math.abs(geometry.values[i]-expected));}
   const ink=inkColor.map((v,i)=>i<3?v*alpha:alpha);for(let i=0;i<palette.values.length;i++)maxPaletteError=Math.max(maxPaletteError,Math.abs(palette.values[i]-ink[i%4]));assert.ok(maxGeometryError<=4e-5,JSON.stringify({maxGeometryError}));assert.ok(maxPaletteError<=4e-6,JSON.stringify({maxPaletteError}));
   const result=await renderer.exportNativeBuffer(ticket,'geometry/pixels');assert.ok(result.values instanceof Float32Array);const values=result.values;assert.equal(values.length,640*400*4);assert.ok(values.every(Number.isFinite));assert.ok(values.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(values.some((v,i)=>i%4!==3&&v<0));assert.ok(values.some((v,i)=>i%4!==3&&v>1));assert.ok(values.some((v,i)=>i%4===3&&v===0));if(entry==='half.tsx')assert.ok(values.every(v=>Object.is(v,fromHalf(toHalf(v)))));
   let main=0,comparison=0;for(let y=0;y<400;y++)for(let x=0;x<640;x++)if(values[(y*640+x)*4+3]>0){if(y<250)main++;if(y>=270)comparison++;}assert.ok(main>0&&comparison>0);const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===4){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(directory,entry+'.f32'),bytes);}records.push({entry,frame,hash,maxGeometryError,maxPaletteError,maxMatrixError,maxQueryError,main,comparison,wallMs:performance.now()-start,preparation:prepared[frame].preparation});
  }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);records.push({entry,buildMs,stats});
  }finally{await renderer.close();}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,records,scope:'Original kurbo nearest/quintic/differential/portion/approximation queries explicitly prepared for8 integer frames; live existing motion Signal and independent original cubic evaluation in Native JS, actual one-owner HDR stroke/Glow/Layer F16/F32 and4/0/7/4. Diagnostic buffer exports after completion, no upstream/native-host WASM claim.'},null,2));
});
