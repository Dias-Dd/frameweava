import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,Renderer,VideoEncoder,probeVideo} from '../src/node.ts';
const [entry,reference,output,report,forbidden,mode='video']=process.argv.slice(2);
const expected=JSON.parse(await readFile(reference,'utf8')),built=await buildProject(entry),renderer=await Renderer.create(built,{cache:false});
const sources=JSON.parse(await readFile(join(built.dir,'sources.json'),'utf8'));
for(const path of sources.files)assert.ok(!path.startsWith(forbidden),'Original SDK source leaked into clean execution');
const video=mode!=='capsule',frames=video?Array.from({length:expected.length},(_,i)=>i):[0,120,239];
const encoder=video?await VideoEncoder.create(output,built.manifest.composition.fps,640,360):undefined;
let comparisons=0;
try{
  for(const index of [120,0,239]){const result=await renderer.renderFrame(index);assert.equal(createHash('sha256').update(await sharp(result.png).ensureAlpha().raw().toBuffer()).digest('hex'),expected[index]);}
  for(const index of frames){const result=await renderer.renderFrame(index),raw=await sharp(result.png).ensureAlpha().raw().toBuffer();assert.equal(createHash('sha256').update(raw).digest('hex'),expected[index],`RGBA mismatch at ${index}`);assert.deepEqual(result.diagnostics,[]);await encoder?.write(result.png);comparisons++;}
  await encoder?.finish();
}catch(e){await encoder?.abort();throw e;}finally{await renderer.close();}
if(mode==='video'){await assert.rejects(()=>stat(join(process.cwd(),'.frameweave/portable')),{code:'ENOENT'});}
const metadata=encoder?await probeVideo(output):undefined;
await writeFile(report,JSON.stringify({pass:true,mode,frames:comparisons,seekFrames:[120,0,239],rawPixelTolerance:0,metadata,sourcePathsIndependent:true},null,2));
console.log(`${mode}: ${comparisons} frames matched exactly`);
