import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,Renderer,VideoEncoder,probeVideo,userLibraryHome} from '../src/node.ts';

const [entry,expectedPath,output,reportPath,forbidden]=process.argv.slice(2);
const expected=JSON.parse(await readFile(expectedPath,'utf8')) as string[];
const built=await buildProject(entry),renderer=await Renderer.create(built,{cache:false}),composition=built.manifest.composition;
assert.equal(composition.durationInFrames,expected.length);
const digest=async(png:Buffer)=>createHash('sha256').update(await sharp(png).ensureAlpha().raw().toBuffer()).digest('hex');
for(const file of [...Object.values(built.assets),...Object.values(built.stageBundles)])assert.ok(!file.includes(forbidden),'Original instance path leaked into relocated build');
const encoder=await VideoEncoder.create(output,composition.fps,composition.width,composition.height),seekFrames=[120,0,239];
try{
  for(const index of seekFrames){const result=await renderer.renderFrame(index);assert.equal(await digest(result.png),expected[index]);assert.equal(result.diagnostics.length,0);}
  for(let i=0;i<expected.length;i++){const result=await renderer.renderFrame(i);assert.equal(result.diagnostics.length,0);assert.equal(await digest(result.png),expected[i],`Frame ${i} RGBA mismatch`);await encoder.write(result.png);if(i%48===0)console.log(`Relocated frame ${i}/${expected.length}`);}
  await encoder.finish();
}catch(e){await encoder.abort();throw e;}finally{await renderer.close();}
const info=await probeVideo(output);assert.equal(info.frames,expected.length);
await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify({pass:true,entry,output,video:info,userLibrary:userLibraryHome(),originalPathForbidden:forbidden,rawFrameComparisons:expected.length,rawPixelTolerance:0,seekFrames,buildHash:built.hash},null,2));
