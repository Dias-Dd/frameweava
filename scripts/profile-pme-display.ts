import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {engineRoot} from '../src/compiler/build.ts';
import {surfaceFromPixels,linear2020,srgb} from '../src/media/surface.ts';
import {ocioTransform} from '../src/media/ocio.ts';
import {OcioWorker} from '../src/media/ocio-worker.ts';
import {mediaPreview} from '../src/media/node.ts';
import sharp from 'sharp';

// Separate diagnostic run; never added to a frame's nested spans/FPS.
const parent=join(engineRoot,'artifacts/pme-perf'),source=JSON.parse(await readFile(join(parent,'optimized-cpu-latest.json'),'utf8')).directory,rows=[];
for(const [width,height]of [[1920,1080],[3840,2160]]){
 const bytes=await readFile(join(source,`reference-${width}-1.f32`)),s=surfaceFromPixels(width,height,new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),{format:'rgba32float',color:linear2020,alpha:'premultiplied',deferBase64:true}),worker=new OcioWorker();
 try{for(const sample of ['cold-worker','warm-processor']){
  const start=performance.now(),converted=await ocioTransform(s,{source:'Linear Rec.2020',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)',outputColor:srgb},worker),ocioWithBridgeMs=performance.now()-start;
  const pngStart=performance.now(),png=await mediaPreview(converted.surface,{workingColor:linear2020,preview:{color:srgb,clip:true}}),pngPackAndEncodeMs=performance.now()-pngStart;
  const expected=await sharp(join(source,`preview-${width}.png`)).ensureAlpha().raw().toBuffer(),actual=await sharp(png).ensureAlpha().raw().toBuffer();assert.deepEqual(actual,expected);
  rows.push({width,height,sample,ocioWithBridgeMs,pngPackAndEncodeMs,exactRgba:true,worker:worker.status()});
 }}finally{await worker.close();}
}
const result={version:1,scope:'Separate host diagnostic, same retained CPU pixels/ACES2 policy. OCIO includes bridge IO/validation; PNG includes unpack/unpremultiply/8-bit quantization/sharp encoding. Not a GPU timer or frame FPS.',rows};await writeFile(join(parent,'display-profile.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
