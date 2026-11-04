import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import {ffmpegPath,probeVideo} from '../src/encoding/ffmpeg.ts';

// Compare the actual encoded movie with its displayed PNGs; never compare lossy
// video directly with linear HDR RGBA or treat an opaque movie as alpha evidence.
const base=resolve(process.argv[2]??'artifacts/spatial-effects/fields-qualified');
const proof=JSON.parse(await readFile(join(base,'result.json'),'utf8'));
const out=await mkdtemp(join(base,'decoded-')),video=join(base,'noise-curl.mp4'),start=performance.now();
const probe=await probeVideo(video);
assert.equal(probe.decodable,true);assert.equal(probe.frames,49);assert.equal(probe.width,640);assert.equal(probe.height,360);
await promisify(execFile)(ffmpegPath(),['-hide_banner','-loglevel','error','-i',video,'-vf','select=eq(n\\,0)+eq(n\\,24)+eq(n\\,48)','-vsync','0',join(out,'decoded-%03d.png')],{windowsHide:true,maxBuffer:1024*1024});
const differences=[];
for(const [i,frame] of [0,24,48].entries()){
  const a=await sharp(join(base,`frame-${frame}.png`)).removeAlpha().raw().toBuffer(),b=await sharp(join(out,`decoded-${String(i+1).padStart(3,'0')}.png`)).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);
  let sum=0,max=0,nonzero=0;for(let j=0;j<a.length;j++){const d=Math.abs(a[j]-b[j]);sum+=d;max=Math.max(max,d);nonzero+=Number(d>0);}
  const mean=sum/a.length/255;assert.ok(mean<.035,'Decoded H264 mean display-RGB error exceeds the local fixture gate');
  differences.push({frame,meanAbsolute:mean,maxAbsolute:max/255,nonzeroComponents:nonzero,domain:'8-bit displayed RGB: sRGB conversion, clipping, opaque flattening, H264 chroma subsampling and lossy encoding'});
}
const raw=gunzipSync(await readFile(join(base,'field-24.f32.gz'))),hash=createHash('sha256').update(raw).digest('hex');
assert.equal(raw.byteLength,640*360*4*4);assert.ok(proof.records.some((r:any)=>r.frame===24&&r.field?.hash===hash));
const p=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));let minRgb=Infinity,maxRgb=-Infinity,minAlpha=Infinity,maxAlpha=-Infinity,softAlpha=0;
for(let i=0;i<p.length;i++){assert.ok(Number.isFinite(p[i]));if(i%4===3){minAlpha=Math.min(minAlpha,p[i]);maxAlpha=Math.max(maxAlpha,p[i]);softAlpha+=Number(p[i]>0&&p[i]<1);}else{minRgb=Math.min(minRgb,p[i]);maxRgb=Math.max(maxRgb,p[i]);}}
assert.ok(minRgb<0&&maxRgb>1&&softAlpha>0);
const result={out,probe,decodeAndComparisonMs:performance.now()-start,differences,raw:{hash,format:'tightly packed little-endian RGBA F32, linear709, premultiplied',bytes:raw.byteLength,minRgb,maxRgb,minAlpha,maxAlpha,softAlpha},limits:'PNG/video are clipped SDR previews, not HDR/alpha preservation or bitwise replay certification; GPU replay and black/white-over differences are recorded separately.'};
await writeFile(join(out,'comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
