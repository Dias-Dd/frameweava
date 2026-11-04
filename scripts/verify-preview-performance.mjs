import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';

// Run after (not concurrently with) timing benchmarks. Historical reference
// pixels and the full video were verified before preview acceleration existed.
const directory=join(engineRoot,'artifacts/preview-performance');
const reference=join(engineRoot,'artifacts/native-preview/final');
await mkdir(directory,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=JSON.parse(await readFile(join(reference,'expected-rgba.json'),'utf8'));
const build=await buildProject(join(reference,'Across-Machines.tsx'));
const accurate=await Renderer.create(build,{cache:false});
const path=join(directory,'Export-Unchanged.mp4');
const encoder=await VideoEncoder.create(path,build.manifest.composition.fps,640,360);
const frames=[0,24,60,120,180,239],rawReferences=new Map();
let comparisons=0;
try{
  for(let i=0;i<240;i++){
    const frame=await accurate.renderFrame(i),raw=await sharp(frame.png).ensureAlpha().raw().toBuffer();
    assert.equal(hash(raw),expected[i],`Export RGBA changed at frame ${i}`);
    comparisons++;await encoder.write(frame.png);
    if(frames.includes(i)){rawReferences.set(i,raw);await writeFile(join(directory,`accurate-${i}.png`),frame.png);}
    if(i%60===0)console.log(`Export regression: ${i}/240`);
  }
  await encoder.finish();
}catch(e){await encoder.abort();throw e;}finally{await accurate.close();}
const metadata=await probeVideo(path);
assert.deepEqual(metadata,{width:640,height:360,fps:24,duration:10,frames:240,decodable:true});
const originalSHA256=hash(await readFile(join(reference,'Original.mp4'))),outputSHA256=hash(await readFile(path));
assert.equal(outputSHA256,originalSHA256,'Encoded MP4 changed');
const preview=await Renderer.create(build,{preview:true}),quality=[];
try{for(const frame of frames){const rendered=await preview.renderPreviewFrame(frame);assert.equal(rendered.mime,'image/jpeg');await writeFile(join(directory,`preview-${frame}.jpg`),rendered.image);const raw=await sharp(rendered.image).ensureAlpha().raw().toBuffer(),original=rawReferences.get(frame);let total=0,squared=0;for(let i=0;i<raw.length;i++){const d=raw[i]-original[i];total+=Math.abs(d);squared+=d*d;}quality.push({frame,meanAbsoluteChannelError:total/raw.length,channelRMSE:Math.sqrt(squared/raw.length)});}}finally{await preview.close();}
const report={pass:true,rawFrameComparisons:comparisons,rawPixelTolerance:0,metadata,mp4ByteIdentical:true,originalSHA256,outputSHA256,previewComparisons:quality,previewPixelExact:false,freshDependencyInstallRepeated:false};
await writeFile(join(directory,'export-regression.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
