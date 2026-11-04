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
import {prepared} from '../modules/pro-animation/validation/path-authoring-scene/prepared.ts';
import {inkAlpha,pathWords} from '../modules/pro-animation/validation/path-authoring-scene/animation.ts';
import {authoringCases} from '../modules/pro-animation/validation/path-authoring-scene/cases.ts';
test('23 real parameterized paths -> original Clipper2 stroke -> Native mesh/Glow/Layer with random frame access',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-path-authoring/stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');const proof:object[]=[];
 for(const entry of ['project.tsx','half.tsx']){const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/path-authoring-scene',entry)),buildMs=performance.now()-started,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});try{let repeated:string|undefined;
  for(const frame of [5,0,7,5]){const start=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const c=frameContext(build.manifest,build.manifest.stages[0],frame),alpha=evaluate(inkAlpha,c),geometry=await renderer.exportNativeBuffer(ticket,'curves/geometry'),palette=await renderer.exportNativeBuffer(ticket,'curves/palette');assert.ok(geometry.values instanceof Float32Array);assert.deepEqual(geometry.values,new Float32Array(prepared[frame].positions));assert.ok(palette.values instanceof Float32Array);let maxPaletteError=0;const expected=[-.12*alpha*.9,.65*alpha*.9,2.2*alpha*.9,alpha*.9];for(let i=0;i<palette.values.length;i++)maxPaletteError=Math.max(maxPaletteError,Math.abs(palette.values[i]-expected[i%4]));assert.ok(maxPaletteError<=4e-6,JSON.stringify({maxPaletteError}));
   const authored=await renderer.exportNativeBuffer(ticket,'curves/authored'),reference=pathWords(authoringCases(c));assert.ok(authored.values instanceof Float32Array);assert.equal(authored.values.length,reference.length*2);let maxControlError=0;for(let i=0;i<reference.length;i++)maxControlError=Math.max(maxControlError,Math.abs(authored.values[i*2]+authored.values[i*2+1]-reference[i]));assert.ok(maxControlError<=4e-10,JSON.stringify({maxControlError}));
   const result=await renderer.exportNativeBuffer(ticket,'curves/pixels');assert.ok(result.values instanceof Float32Array);const values=result.values;assert.equal(values.length,640*480*4);assert.ok(values.every(Number.isFinite));assert.ok(values.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(values.some((v,i)=>i%4!==3&&v<0));assert.ok(values.some((v,i)=>i%4!==3&&v>1));if(entry==='half.tsx')assert.ok(values.every(v=>Object.is(v,fromHalf(toHalf(v)))));
   const occupied:number[]=[];for(let cell=0;cell<23;cell++){let count=0;const left=(cell%5)*128,top=Math.floor(cell/5)*96;for(let y=top;y<top+96;y++)for(let x=left;x<left+128;x++)if(values[(y*640+x)*4+3]>0)count++;assert.ok(count>0,'actual pixels for case'+cell);occupied.push(count);}const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===5){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(directory,entry+'.f32'),bytes);}proof.push({entry,frame,hash,maxControlError,maxPaletteError,occupiedPixelsPerCase:occupied,wallMs:performance.now()-start});
  }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
 }finally{await renderer.close();}}
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,scope:'Actual eight prepared geometries, F32 buffer identity, independent constant PM ink reference, all23 occupied cells. No CPU pixels or hidden owner/browser; completed-ticket exports only.'},null,2));
});
