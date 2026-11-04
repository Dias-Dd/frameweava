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
import {prepared} from '../modules/pro-animation/validation/native-text-scene/prepared.ts';
import {titleAnimation} from '../modules/pro-animation/validation/native-text-scene/animation.ts';
test('real Latin/Arabic/CJK glyph geometry -> native affine/opacity -> shutter -> Glow -> Layer',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-native-text/stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
 const proof:object[]=[];for(const entry of ['project.tsx','half.tsx']){
  const start=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/native-text-scene',entry)),buildMs=performance.now()-start,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{let repeated:string|undefined;for(const frame of [18,0,47,18]){
   const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   const context=frameContext(build.manifest,build.manifest.stages[0],frame),sample=shutterTimeSamples({count:8,angleDegrees:180},context).at(0);let maxGeometryError=0,maxPaletteError=0;
   for(const [i,p]of prepared.entries()){
    const actual=await renderer.exportNativeBuffer(ticket,'text/glyph-'+i),ink=await renderer.exportNativeBuffer(ticket,'text/palette-'+i);assert.ok(actual.values instanceof Float32Array);assert.ok(ink.values instanceof Float32Array);const transform=titleAnimation(p.mesh,p.words),controls=p.mesh.units.map(u=>transform(u,sample.context));assert.equal(actual.values.length,p.mesh.positions.length);
    for(let vertex=0;vertex<p.mesh.vertexUnits.length;vertex++){const at=vertex*3,x=Math.fround(p.mesh.positions[at]),y=Math.fround(p.mesh.positions[at+1]),m=controls[p.mesh.vertexUnits[vertex]].matrix,expected=[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5],.5];for(let c=0;c<3;c++)maxGeometryError=Math.max(maxGeometryError,Math.abs(actual.values[at+c]-expected[c]));}
    for(const [unit,control]of controls.entries()){const expected=[-.2,2.4,4,1].map(v=>v*.85*control.opacity);for(let c=0;c<4;c++)maxPaletteError=Math.max(maxPaletteError,Math.abs(ink.values[unit*4+c]-expected[c]));}
   }
   assert.ok(maxGeometryError<=4e-5,JSON.stringify({maxGeometryError}));assert.ok(maxPaletteError<=4e-6,JSON.stringify({maxPaletteError}));
   const exported=await renderer.exportNativeBuffer(ticket,'text/pixels');assert.ok(exported.values instanceof Float32Array);const pixels=exported.values;assert.equal(pixels.length,600*360*4);assert.ok(pixels.every(Number.isFinite));assert.ok(pixels.every((v,i)=>i%4!==3||v>=0&&v<=1));if(frame!==0){assert.ok(pixels.some((v,i)=>i%4!==3&&v<0));assert.ok(pixels.some((v,i)=>i%4!==3&&v>1));}if(entry==='half.tsx')assert.ok(pixels.every(v=>Object.is(v,fromHalf(toHalf(v)))));
   const bytes=new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength),hash=createHash('sha256').update(bytes).digest('hex');if(frame===18){if(repeated)assert.equal(hash,repeated);repeated=hash;await writeFile(join(directory,entry+'.f32'),bytes);}proof.push({entry,frame,maxGeometryError,maxPaletteError,hash,wallMs:performance.now()-begin});
  }
  const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
  }finally{await renderer.close();}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,scope:'CPU geometry oracle is mathematical XYZ/affine, never CPU pixels. Native pixel/geometry exports happen explicitly after GPU completion.'},null,2));
});
