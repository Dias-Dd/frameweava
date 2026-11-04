import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {nativeExecutable} from '../../native-gpu/executable.ts';
import {fromHalf,toHalf} from '../../../src/media/surface.ts';
import {sampleOptions} from './cases.ts';
import * as R from './reference.ts';
import type {FrameLayout} from './types.ts';
const out=resolve(process.env.FRAMEWEAVE_SPHERICAL_RUN!),rows:{fixture:string;frame:number;name:string;gate:number;maxScaled:number;worst:number;actual:number;expected:number}[]=[],failures:object[]=[],save=(n:string,v:unknown)=>writeFile(join(out,n),JSON.stringify(v,null,2)+'\n'),hash=(a:Float32Array)=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
try{
 for(const fixture of (process.argv[2]?.split(',')??['suite'])){
  const build=await buildProject(resolve('modules/native-effects/examples/spherical-'+fixture+'.tsx')),r=await Renderer.create(build,{cache:false,timeoutMs:60000,nativeGpu:{executable:await nativeExecutable(),dynamic:'interactive',slots:1,maxBytes:2*1024**3}}),width=build.manifest.composition.width,height=build.manifest.composition.height,layout:FrameLayout=fixture==='stereo'?'side-by-side':fixture==='180'?'top-bottom':'mono',half=fixture==='half',seen=new Map<number,string>();
  try{
   await assert.rejects(r.submitNativeFrame(0,{signal:AbortSignal.abort()}));
   for(const frame of [0,1,2,3,9,0]){
    const ticket=await r.submitNativeFrame(frame);await ticket.completed;
    const get=async(name:string)=>{const b=await r.exportNativeBuffer(ticket,'spherical/'+name);assert.ok(b.values instanceof Float32Array);assert.ok(b.values.every(Number.isFinite),name);return b.values;},source=await get('source'),metadata=await r.exportNativeBuffer(ticket,'spherical/metadata');const width=metadata.values[2],height=metadata.values[3],layout:FrameLayout=(['mono','side-by-side','top-bottom'] as const)[metadata.values[4]],half=metadata.values[5]===1,o=sampleOptions(frame,layout,metadata.values[6]===1),pm=Float64Array.from(source,(v,j)=>frame%3===1&&j%4!==3?v*source[j-j%4+3]:v),image:R.Image={data:pm,width,height,layout,projection:'equirectangular',fov:o.blur.fieldOfView.map(v=>v*Math.PI/180)};
    const compare=async(name:string,expected:ArrayLike<number>,gate=half?6e-4:3e-6)=>{const actual=await get(name);assert.equal(actual.length,expected.length,name);let maxScaled=0,worst=0;for(let j=0;j<actual.length;j++){assert.ok(Number.isFinite(expected[j]),name+' expected');const error=Math.abs(actual[j]-expected[j])/Math.max(1,Math.abs(expected[j]));if(error>maxScaled){maxScaled=error;worst=j;}}const row={fixture,frame,name,gate,maxScaled,worst,actual:actual[worst],expected:expected[worst]};rows.push(row);if(maxScaled>gate)failures.push(row);if(half&&name!=='metadata')for(const value of actual)assert.equal(value,fromHalf(toHalf(value)));return actual;};
    await compare('blur',R.neighborhood(image,o.blur));await compare('random',R.neighborhood(image,o.random,'random'));await compare('salt',R.neighborhood(image,o.salt,'salt'));
    const sharpBlur=Float32Array.from(R.neighborhood(image,{...o.sharpen,kernelSize:3}));await compare('sharpen',R.sharpen(image,sharpBlur,o.sharpen.strength,o.sharpen.threshold));
    const bright=Float32Array.from(R.bright(image,o.glow.threshold,o.glow.knee)),glowBlur=Float32Array.from(R.neighborhood({...image,data:bright},o.glow));await compare('glow',R.glow(image,glowBlur,o.glow.intensity,o.glow.saturation));
    await compare('chromatic',R.chromatic(image,o.chromatic));await compare('gradient',R.gradient(image,o.gradient));await compare('fractal',R.fractal(image,o.fractal,metadata.values[0]));await compare('glitch',R.glitch(image,o.glitch,metadata.values[0]));
    await compare('rotated',R.convert(image,image,o.rotate.rotation));
    const cubeDescriptor={width:o.cube.width,height:o.cube.height,layout,projection:'cube-3x2' as const,fov:[Math.PI*2,Math.PI]},cube=await compare('cube',R.convert(image,cubeDescriptor));
    await compare('cube-to-sphere',R.convert({...cubeDescriptor,data:cube},{...image,fov:[Math.PI*2,Math.PI]}));
    await compare('view',R.convert(image,{width:8,height:6,layout:'mono',projection:'rectilinear',fov:o.view.viewFieldOfView.map(v=>v*Math.PI/180)},o.view.rotation,layout==='mono'?0:1));
    await compare('plane',R.plane(image,o.plane));
    const chain=await get('chain'),h=hash(chain);if(seen.has(frame))assert.equal(h,seen.get(frame));seen.set(frame,h);
    await save('progress.json',{rows,failures});
   }
   const stats=await r.nativeStats();assert.equal(stats.capabilities.hardwareVerified,true);assert.equal(stats.devicesCreated,1);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.imageReadbacks,0);await save(fixture+'-stats.json',stats);
  }finally{await r.close();await r.close();await r.nativeExited();await save(fixture+'-closed.json',{nativeExited:true,doubleClose:true});}
 }
 await save('result.json',{ok:failures.length===0,rows,failures});assert.equal(failures.length,0,JSON.stringify(failures));console.log(JSON.stringify({ok:true,comparisons:rows.length}));
}catch(error){await save('result.json',{ok:false,rows,failures,error:String(error)});throw error;}
