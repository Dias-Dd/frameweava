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
import {prepared} from '../modules/pro-animation/validation/text-layout-scene/prepared.ts';
import {createParagraphIndex} from '../modules/pro-animation/src/text-layout/queries.ts';
import {paragraphAnimation,inkAlpha} from '../modules/pro-animation/validation/text-layout-scene/animation.ts';
import {querySnapshot} from '../modules/pro-animation/validation/text-layout-scene/queries.ts';
function compare(actual:unknown,expected:unknown,path='$'):number{
 if(typeof expected==='number'){assert.equal(typeof actual,'number',path);const error=Math.abs((actual as number)-expected);assert.ok(error<=1e-9*Math.max(1,Math.abs(expected)),path+':'+error);return error;}
 if(expected&&typeof expected==='object'){assert.ok(actual&&typeof actual==='object',path);assert.deepEqual(Object.keys(actual),Object.keys(expected),path);let error=0;for(const key of Object.keys(expected))error=Math.max(error,compare((actual as Record<string,unknown>)[key],(expected as Record<string,unknown>)[key],path+'.'+key));return error;}
 assert.equal(actual,expected,path);return 0;
}
test('original four-font wrapping/index -> actual Native mixed paragraph, exact queries, affine/ink reference, selection/caret/Glow/Layer',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-text-layout/stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
 const proof:object[]=[],index=createParagraphIndex(prepared.index.source),transform=paragraphAnimation(index);
 for(const entry of ['project.tsx','half.tsx']){
  const started=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/text-layout-scene',entry)),buildMs=performance.now()-started,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{let repeated:string|undefined;for(const frame of [4,0,7,4]){
   const start=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const c=frameContext(build.manifest,build.manifest.stages[0],frame),geometry=await renderer.exportNativeBuffer(ticket,'paragraph/geometry'),palette=await renderer.exportNativeBuffer(ticket,'paragraph/palette');assert.ok(geometry.values instanceof Float32Array);assert.ok(palette.values instanceof Float32Array);
   const controls=index.clusters.map(u=>transform(u,c));let maxGeometryError=0,maxPaletteError=0;
   for(let vertex=0;vertex<prepared.vertexUnits.length;vertex++){const i=vertex*3,x=Math.fround(prepared.positions[i]),y=Math.fround(prepared.positions[i+1]),m=controls[prepared.vertexUnits[vertex]].matrix,expected=[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5],.5];for(let k=0;k<3;k++)maxGeometryError=Math.max(maxGeometryError,Math.abs(geometry.values[i+k]-expected[k]));}
   const alpha=evaluate(inkAlpha,c);for(const [unit,control]of controls.entries()){const expected=[-.12,1.8,3.1,1].map(v=>v*alpha*control.opacity);for(let k=0;k<4;k++)maxPaletteError=Math.max(maxPaletteError,Math.abs(palette.values[unit*4+k]-expected[k]));}
   assert.ok(maxGeometryError<=4e-5,JSON.stringify({maxGeometryError}));assert.ok(maxPaletteError<=4e-6,JSON.stringify({maxPaletteError}));
   const trace=await renderer.exportNativeBuffer(ticket,'paragraph/queries');assert.ok(trace.values instanceof Uint32Array);let json='';for(const n of trace.values)json+=String.fromCharCode(n);const maxQueryError=compare(JSON.parse(json),querySnapshot(index,frame));
   const result=await renderer.exportNativeBuffer(ticket,'paragraph/pixels');assert.ok(result.values instanceof Float32Array);const values=result.values;assert.equal(values.length,720*360*4);assert.ok(values.every(Number.isFinite));assert.ok(values.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(values.some((v,i)=>i%4!==3&&v<0));assert.ok(values.some((v,i)=>i%4!==3&&v>1));assert.ok(values.some((v,i)=>i%4===3&&v===0));if(entry==='half.tsx')assert.ok(values.every(v=>Object.is(v,fromHalf(toHalf(v)))));
   const occupied:number[]=[];for(const line of index.lineBoxes){let count=0;for(let y=Math.max(0,Math.floor(line.box.top));y<Math.min(360,Math.ceil(line.box.bottom));y++)for(let x=0;x<720;x++)if(values[(y*720+x)*4+3]>0)count++;assert.ok(count>0,'actual line '+line.id);occupied.push(count);}
   const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===4){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(directory,entry+'.f32'),bytes);}proof.push({entry,frame,hash,maxQueryError,maxGeometryError,maxPaletteError,occupied,wallMs:performance.now()-start});
  }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
  }finally{await renderer.close();}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,scope:'Actual canonical four-font paragraph and all19 pure query functions executed in Native Stage. F64 affine/PM ink references, original glyph mesh GPU renderer, no CPU raster/browser. Frozen source randomized4/0/7/4.'},null,2));
});
