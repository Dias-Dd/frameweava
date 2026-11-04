import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo,ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {renderCreation} from '../src/authoring-tools/index.ts';
import {exportProject,type ExportOptions} from '../src/compiler/export.ts';
const base=join(engineRoot,'.frameweave/fw1-creation');
async function fixture(){
 await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'source-'));
 await writeFile(join(dir,'media-stages.ts'),await readFile(join(engineRoot,'examples/fw1-unified-layer/media-stages.ts')));
 const png=await sharp({create:{width:64,height:48,channels:4,background:'#164e63'}}).png().toBuffer();await writeFile(join(dir,'still.png'),png);
 const encoder=await VideoEncoder.create(join(dir,'clip.mp4'),{num:8,den:1},64,48);
 try{for(let f=0;f<8;f++)await encoder.write(await sharp(Buffer.from(`<svg width="64" height="48"><rect width="64" height="48" fill="#071b29"/><rect x="${f*6}" y="10" width="16" height="26" fill="#39e7b5"/></svg>`)).png().toBuffer());await encoder.finish();}catch(e){await encoder.abort();throw e;}
 const prefix=`import {Composition,Stage,Layer,Resource,content,ref,Text,keyframes} from '@frameweave/engine';
 import {imageStage,videoStage} from './media-stages.ts';export {imageStage,videoStage};`;
 await writeFile(join(dir,'still.tsx'),`${prefix}
 export default <Composition width={64} height={48} fps={8}><Resource id="still" src="./still.png" kind="image"/><Stage id="image" factory={imageStage}/><Layer name="Still image" source={content.image(ref('image'))}/></Composition>;`);
 await writeFile(join(dir,'video.tsx'),`${prefix}
 const make=()=> <Stage id="video" factory={videoStage}/>;
 export default <Composition width={64} height={48} fps={8}><Resource id="clip" src="./clip.mp4" kind="media"/>{make()}<Stage id="label"><Text content="FW" fontSize={10} fill="#ffffff" x={3} y={2}/></Stage><Layer id="group" name="Media"><Layer source={content.video(ref('video'),{durationInFrames:8})}/><Layer source={ref('label')} x={keyframes([{frame:0,value:0},{frame:7,value:8}])}/></Layer></Composition>;`);
 return dir;
}
test('Real PNG and video references execute unified Layer/default output via formal Session',{timeout:180000},async()=>{
 const dir=await fixture();const still=await renderCreation({project:join(dir,'still.tsx'),output:join(dir,'still-output.png')});assert.equal(still.plan.format,'png');assert.equal((await sharp(join(dir,'still-output.png')).metadata()).width,64);
 const video=await renderCreation({project:join(dir,'video.tsx'),output:join(dir,'video-output.mp4')});assert.equal(video.plan.format,'mp4');
 const probe=await probeVideo(join(dir,'video-output.mp4'));assert.deepEqual(probe,{width:64,height:48,fps:8,duration:1,frames:8,decodable:true});
 const decoded=await promisify(execFile)(ffmpegPath(),['-hide_banner','-loglevel','error','-i',join(dir,'video-output.mp4'),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1024*1024});assert.equal(decoded.stdout.length,64*48*4*8);for(const f of [0,4,7]){const xs=[];for(let x=0;x<64;x++){const at=((f*48+20)*64+x)*4;if(decoded.stdout[at+1]>150&&decoded.stdout[at]<100)xs.push(x);}assert.ok(Math.abs(Math.min(...xs)-f*6)<=1,`encoded video region must move at frame ${f}`);}
 const built=await buildProject(join(dir,'video.tsx')),r=await Renderer.create(built,{cache:false}),frames=new Map<number,Buffer>();
 try{for(const f of [0,4,7,2,7,0]){const png=(await r.renderFrame(f)).png,pixels=await sharp(png).ensureAlpha().raw().toBuffer();if(frames.has(f))assert.deepEqual(pixels,frames.get(f));const green=[];for(let x=0;x<64;x++){const at=(20*64+x)*4;if(pixels[at+1]>150&&pixels[at]<100)green.push(x);}assert.ok(Math.abs(Math.min(...green)-f*6)<=1,`video region at frame ${f} must advance: ${green}`);frames.set(f,pixels);await writeFile(join(dir,`frame-${f}.png`),png);}assert.notDeepEqual(frames.get(0),frames.get(7));}finally{await r.close();}
 const override=await renderCreation({project:join(dir,'video.tsx'),output:join(dir,'explicit.png'),format:'png',start:4});assert.equal(override.plan.format,'png');
 await assert.rejects(renderCreation({project:join(dir,'still.tsx'),output:join(dir,'wrong.mp4')}),{code:'E_OUTPUT_FORMAT'});
 const aborted=new AbortController();aborted.abort();await assert.rejects(renderCreation({project:join(dir,'still.tsx'),output:join(dir,'cancelled.png'),signal:aborted.signal}),{name:'AbortError'});
 await writeFile(join(base,'evidence.json'),JSON.stringify({dir,probe,seekOrder:[0,4,7,2,7,0],tolerance:0}));
});
test('Six existing portable export modes preserve typed Layer, factory binding, media assets and Engine metadata',{timeout:240000},async()=>{
 const dir=await fixture(),entry=join(dir,'video.tsx'),destination=await mkdtemp(join(base,'exports-'));
 const policies:Omit<ExportOptions,'output'>[]=[{sources:'preserve',modules:'copy',assets:'copy'},{sources:'merge',modules:'merge',assets:'embed'},{singleFile:true},{singleFile:true,layout:'capsule'},{sources:'preserve',modules:'external',assets:'external'},{sources:'merge',modules:'copy',assets:'copy'}];
 const outputs=[];for(let i=0;i<policies.length;i++)outputs.push(await exportProject(entry,{...policies[i],output:join(destination,policies[i].singleFile?`mode-${i}.tsx`:`mode-${i}`)}));
 const expected=await Renderer.create(await buildProject(entry),{cache:false});const original=await sharp((await expected.renderFrame(4)).png).ensureAlpha().raw().toBuffer();await expected.close();
 // Self-contained modes must rebuild/render with original resources unavailable. External mode intentionally keeps original dependencies.
 const offline=`${dir}-offline`;await rename(dir,offline);
 for(let i=0;i<outputs.length;i++){
  if(i===4)await rename(offline,dir);
  const build=await buildProject(outputs[i].entry),r=await Renderer.create(build,{cache:false});
  try{assert.equal(build.manifest.stages[0].engine,'web');assert.deepEqual(await sharp((await r.renderFrame(4)).png).ensureAlpha().raw().toBuffer(),original);}finally{await r.close();}
  if(i===4)await rename(dir,offline);
 }
 await writeFile(join(base,'export-evidence.json'),JSON.stringify({source:offline,destination,modes:policies,rendered:6,tolerance:0}));
});
