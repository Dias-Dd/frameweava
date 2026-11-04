import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {Renderer} from '../src/render/renderer.ts';
import {buildProject} from '../src/compiler/build.ts';
import {frameContext} from '../src/core/time.ts';
import {evaluate} from '../src/core/animation.ts';
import {fromHalf,toHalf} from '../src/media/surface.ts';
import {pathControlCases,guideMesh,inkAlpha} from '../modules/pro-animation/validation/path-controls-scene/cases.ts';
import {pathAnchors} from '../modules/pro-animation/src/path-controls/index.ts';
function compare(actual:unknown,expected:unknown,path='$'):number{
 if(typeof expected==='number'){assert.equal(typeof actual,'number',path);const error=Math.abs((actual as number)-expected);assert.ok(error<=1e-9*Math.max(1,Math.abs(expected)),path+':'+error);return error;}
 if(expected&&typeof expected==='object'){assert.ok(actual&&typeof actual==='object',path);assert.deepEqual(Object.keys(actual),Object.keys(expected),path);let error=0;for(const key of Object.keys(expected))error=Math.max(error,compare((actual as Record<string,unknown>)[key],(expected as Record<string,unknown>)[key],path+'.'+key));return error;}
 assert.equal(actual,expected,path);return 0;
}
test('canonical anchor/Bezier21 controls -> original compound fill/hole solver -> Native GPU guides/Glow/Layer',{timeout:120000},async()=>{
 const out=resolve('.frameweave/pa3-path-controls/stage');await mkdir(out,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');const proof:object[]=[];
 for(const entry of ['project.tsx','half.tsx']){
 const start=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/path-controls-scene',entry)),buildMs=performance.now()-start,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 try{let repeated:string|undefined;for(const frame of [4,0,7,4]){
 const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const context=frameContext(build.manifest,build.manifest.stages[0],frame),cases=pathControlCases(context),guides=guideMesh(cases.paths),trace=await renderer.exportNativeBuffer(ticket,'pathControls/trace');assert.ok(trace.values instanceof Uint32Array);let json='';for(const n of trace.values)json+=String.fromCharCode(n);const maxQueryError=compare(JSON.parse(json),cases.trace),geometry=await renderer.exportNativeBuffer(ticket,'pathControls/guides');assert.ok(geometry.values instanceof Float32Array);assert.equal(geometry.values.length,guides.positions.length);let maxGeometryError=0;for(let n=0;n<geometry.values.length;n++)maxGeometryError=Math.max(maxGeometryError,Math.abs(geometry.values[n]-Math.fround(guides.positions[n])));assert.equal(maxGeometryError,0);
 const raw=await renderer.exportNativeBuffer(ticket,'pathControls/fillPixels');assert.ok(raw.values instanceof Float32Array);const alpha=evaluate(inkAlpha,context),expected=[-.18,1.8,3.2,1].map(v=>entry==='half.tsx'?fromHalf(toHalf(v*alpha)):v*alpha);let occupied=0,maxInkError=0;for(let p=0;p<640*400;p++){if(Math.abs(raw.values[p*4+3]-expected[3])<1e-7){occupied++;for(let c=0;c<4;c++)maxInkError=Math.max(maxInkError,Math.abs(raw.values[p*4+c]-expected[c]));}}assert.ok(occupied>5000);assert.ok(maxInkError<=4e-6,JSON.stringify({maxInkError}));
 const holes=[];for(const path of cases.paths){const anchors=pathAnchors(path).filter(a=>a.contour===1),x=Math.floor(anchors.reduce((n,a)=>n+a.position[0],0)/anchors.length),y=Math.floor(anchors.reduce((n,a)=>n+a.position[1],0)/anchors.length),holeAlpha:number=raw.values[(y*640+x)*4+3];assert.equal(holeAlpha,0,'declared evenodd hole at '+x+','+y);holes.push({x,y,alpha:holeAlpha});}
 const result=await renderer.exportNativeBuffer(ticket,'pathControls/pixels');assert.ok(result.values instanceof Float32Array);const pixels=result.values;assert.equal(pixels.length,640*400*4);assert.ok(pixels.every(Number.isFinite));assert.ok(pixels.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(pixels.some((v,i)=>i%4!==3&&v<0));assert.ok(pixels.some((v,i)=>i%4!==3&&v>1));assert.ok(pixels.some((v,i)=>i%4===3&&v===0));if(entry==='half.tsx')assert.ok(pixels.every(v=>Object.is(v,fromHalf(toHalf(v)))));
 const bytes=new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===4){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(out,entry+'.f32'),bytes);}proof.push({entry,frame,hash,maxQueryError,maxGeometryError,maxInkError,occupied,holes,wallMs:performance.now()-begin});
 }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
 }finally{await renderer.close();}
 }
 await writeFile(join(out,'result.json'),JSON.stringify({version:1,proof,scope:'All21 canonical point/handle operations execute in Native logic; original IDs/closure/continuity traces and guide buffer compared to independent Node values. Original Clipper2/Earcut8 finite geometry frames, actual evenodd holes/professional native fills/guide/Glow/Layer, no CPU pixel or Native-host WASM claim. Interior ink and declared holes tested; edge AA not an invented analytic area reference. Explicit post-ticket buffer exports.'},null,2));
});
