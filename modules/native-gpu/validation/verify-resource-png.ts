import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
import {NativeResourceImages} from '../resource-images.ts';
import {buildProject} from '../../../src/compiler/build.ts';
import {linear709} from '../../../src/media/surface.ts';
if(!process.env.FRAMEWEAVE_MEDIA_PYTHON)throw Error('Explicit reviewed FRAMEWEAVE_MEDIA_PYTHON required; no silent skip or downloader');
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');const base=resolve('.frameweave/native-resource-png');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'p-')),entry=join(dir,'scene.tsx');
await sharp({create:{width:8,height:4,channels:4,background:{r:128,g:64,b:255,alpha:.5}}}).png().withIccProfile('srgb').toFile(join(dir,'input.png'));
await writeFile(entry,`import {Composition,Stage,Resource} from '@frameweave/engine';export default <Composition width={8} height={4} fps={24} durationInFrames={1}><Resource id="image" src="./input.png" kind="image"/><Stage id="placeholder" engine="mock"/></Composition>;`);
const build=await buildProject(entry),adapter=await NativeResourceImages.create(build);
try{const file=await adapter.image({version:1,id:'image',decode:'icc-sdr',output:{width:8,height:4,format:'rgba32float',alpha:'premultiplied',color:linear709}}),bytes=await readFile(join(adapter.lease.directory,file));assert.equal(bytes.length,8*4*16);const alpha=128/255,decode=(x:number)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4,expected=[decode(128/255)*alpha,decode(64/255)*alpha,alpha,alpha];let maxError=0;for(let i=0;i<bytes.length/4;i++){const e=Math.abs(bytes.readFloatLE(i*4)-expected[i%4]);maxError=Math.max(maxError,e);assert.ok(e<=5e-5,JSON.stringify({i,actual:bytes.readFloatLE(i*4),expected:expected[i%4]}));}const result={version:1,ok:true,profile:'existing LCMS ICC16 import then explicit linear F32/PM',maxError,expected,pixels:Array.from({length:4},(_,i)=>bytes.readFloatLE(i*4)),python:process.env.FRAMEWEAVE_MEDIA_PYTHON};await writeFile(resolve('artifacts/native-interfaces/png-input.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}finally{await adapter.close();}
