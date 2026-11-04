import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {openRenderSession} from '../modules/render-session/index.ts';
import {linear709,srgb,pixelsFromSurface,type ProfessionalSurface} from '../src/media/surface.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
const base=resolve(process.argv[2]??'artifacts/spatial-effects/batch-1-release'),proof=JSON.parse(await readFile(join(base,'result.json'),'utf8'));
const out=await mkdtemp(join(base,'raw-and-decoded-'));
const session=await openRenderSession(join(proof.project,'project.tsx'),{mode:'preview',width:640,height:360,media:{workingColor:linear709,transport:'buffer-v1',preview:{color:srgb,clip:true}}});
try{const r=await session.mediaFrame(24),s=r.stageOutputs.particles.surface as ProfessionalSurface,p=pixelsFromSurface(s),bytes=Buffer.from(p.buffer),hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,proof.records.find((r:any)=>r.frame===24).hash);await writeFile(join(out,'frame-24.f32.gz'),gzipSync(bytes));await writeFile(join(out,'surface-metadata.json'),JSON.stringify({...s,storage:{...s.storage,data:'see frame-24.f32.gz; tightly packed float32 little-endian'}},null,2));}finally{await session.close();}
await promisify(execFile)(ffmpegPath(),['-hide_banner','-loglevel','error','-i',join(base,'feedback-particles.mp4'),'-vf','select=eq(n\\,0)+eq(n\\,24)+eq(n\\,48)','-vsync','0',join(out,'decoded-%03d.png')],{windowsHide:true,maxBuffer:1024*1024});
const differences=[];
for(const [i,frame] of [0,24,48].entries()){
  const a=await sharp(join(base,`frame-${frame}.png`)).removeAlpha().raw().toBuffer(),b=await sharp(join(out,`decoded-${String(i+1).padStart(3,'0')}.png`)).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);
  let sum=0,max=0,nonzero=0;for(let j=0;j<a.length;j++){const d=Math.abs(a[j]-b[j]);sum+=d;max=Math.max(max,d);nonzero+=Number(d>0);}const mean=sum/a.length/255;
  assert.ok(mean<.03,'H264 mean display-RGB error exceeds the fixed fixture gate');assert.ok(max/255<.5,'H264 maximum display-RGB error exceeds fixture gate');differences.push({frame,meanAbsolute:mean,maxAbsolute:max/255,nonzeroComponents:nonzero,domain:'decoded 8-bit displayed RGB after sRGB clip and background flatten; H264 is lossy'});
}
await writeFile(join(out,'comparison.json'),JSON.stringify({out,differences,rawFormat:'RGBA F32 little-endian, linear709, premultiplied',alphaInVideo:false},null,2));console.log(JSON.stringify({ok:true,out,differences},null,2));
