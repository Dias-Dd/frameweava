import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {engineRoot} from '../src/compiler/build.ts';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface,surfaceFromPixels,linear2020,pq2020} from '../src/media/surface.ts';
import {inspectMediaFile,decodeVideoFloat} from '../src/media/encoding.ts';

const parent=join(engineRoot,'artifacts/pme-perf'),directory=async(name:string)=>JSON.parse(await readFile(join(parent,name+'-latest.json'),'utf8')).directory;
const baseline=await directory('baseline-final'),cpu=await directory('optimized-cpu'),gpu=await directory('preview-gpu'),rows:any[]=[];
async function floats(file:string){const b=await readFile(file);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}
function difference(a:Float32Array,b:Float32Array){assert.equal(a.length,b.length);let maxAbsolute=0,alphaMax=0,min=Infinity,max=-Infinity;for(let i=0;i<a.length;i++){assert.ok(Number.isFinite(a[i])&&Number.isFinite(b[i]));const e=Math.abs(a[i]-b[i]);maxAbsolute=Math.max(maxAbsolute,e);if(i%4===3)alphaMax=Math.max(alphaMax,e);else{min=Math.min(min,b[i]);max=Math.max(max,b[i]);}}return {maxAbsolute,alphaMax,min,max};}
for(const [width,height]of [[1920,1080],[3840,2160]]){
 const a=await sharp(join(baseline,`preview-${width}.png`)).ensureAlpha().raw().toBuffer(),b=await sharp(join(cpu,`preview-${width}.png`)).ensureAlpha().raw().toBuffer();assert.deepEqual(b,a);rows.push({kind:'png',width,height,exactDecodedRgba:true,bytes:b.length});
 const reference=await floats(join(cpu,`reference-${width}-1.f32`)),expected=pixelsFromSurface(surfaceFromPixels(width,height,reference,{color:linear2020,alpha:'premultiplied',deferBase64:true})),exr=await readExr(join(cpu,`frame-${width}.exr`)),actual=pixelsFromSurface(exr.surface),error=difference(expected,actual);assert.equal(error.maxAbsolute,0);assert.equal(exr.metadata.type,'float16');rows.push({kind:'exr',width,height,metadata:exr.metadata,...error});
 const file=join(cpu,`hdr-${width}.mp4`),probe=await inspectMediaFile(file),stream=probe.streams.find((s:any)=>s.codec_type==='video');assert.equal(stream.profile,'Main 10');assert.equal(stream.pix_fmt,'yuv420p10le');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.color_primaries,'bt2020');assert.ok(probe.frames.length>=1);
 const decoded=await decodeVideoFloat(file,{width,height,color:pq2020});assert.equal(pixelsFromSurface(decoded).length,width*height*4);rows.push({kind:'hdr',width,height,profile:stream.profile,pixelFormat:stream.pix_fmt,primaries:stream.color_primaries,transfer:stream.color_transfer,decoded:true,frames:probe.frames.length});
 const ga=await floats(join(gpu,`gpu-reference-${width}.f32`)),gb=await floats(join(gpu,`gpu-result-${width}.f32`)),ge=difference(ga,gb);assert.ok(ge.maxAbsolute<3e-5&&ge.alphaMax<3e-6,JSON.stringify(ge));rows.push({kind:'gpu-f32',width,height,...ge});
}
const output=join(parent,'artifact-validation.json');await writeFile(output,JSON.stringify({version:1,ok:true,baseline,cpu,gpu,rows},null,2));console.log(JSON.stringify({ok:true,output,rows}));
