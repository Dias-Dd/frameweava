import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rename} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareServo,writeServoDocument} from '@frameweave/engine/servo/node';
import {buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
const root=resolve('.'),out=join(root,'artifacts/main-runtime-unblock');await mkdir(out,{recursive:true});const dir=await mkdtemp(join(out,'servo-')),original=join(dir,'source');await mkdir(original);
await writeFile(join(original,'page.html'),'<html><head><link rel="stylesheet" href="./style.css"/></head><body><div id="card"></div><script src="./animate.js"></script></body></html>');
await writeFile(join(original,'style.css'),'html,body{margin:0;width:100%;height:100%;background:transparent}#card{width:100%;height:100%;background:lime;opacity:var(--alpha)}');
await writeFile(join(original,'animate.js'),'window.frameweaveRender=(c,p)=>{document.documentElement.dataset.frame=String(c.frame)};');
const document=await prepareServo({root:original,entry:'page',resources:{page:'page.html',style:'style.css',script:'animate.js'}});await writeServoDocument(join(dir,'document.ts'),document);
const project=join(dir,'project.tsx');await writeFile(project,`import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';import {servoStage} from '@frameweave/engine/servo';import {document} from './document';export const card=servoStage({document,defaults:{opacity:1},variables:{'--alpha':'opacity'}});export default <Composition width={48} height={24} fps={24} durationInFrames={3} background="transparent"><Stage id="card" factory={card} props={{opacity:keyframes([{frame:0,value:.25},{frame:2,value:1}])}}/><Layer source={ref('card')}/></Composition>;`);
const held=join(dir,'source.held');assert.ok(!relative(dir,original).startsWith('..'));await rename(original,held); // originals unavailable during every render/export below
const native=process.env.FRAMEWEAVE_NATIVE_GPU!,options={nativeGpu:{executable:native,dynamic:'throughput' as const,readback:'final-surface' as const,slots:3,maxBytes:128*1024**2}},built=await buildProject(project),renderer=await Renderer.create(built,options),hashes=new Map<number,string>();
try{for(const frame of [2,0,1,0]){const surface=await renderer.renderNativeSurface(frame),pixels=pixelsFromSurface(surface),at=(12*48+24)*4,alpha=.25+frame*.375;
  assert.ok(Math.abs(pixels[at+1]-alpha)<.006,`${frame}: green ${pixels[at+1]} expected ${alpha}`);assert.ok(Math.abs(pixels[at+3]-alpha)<.006); // explicit Servo SDR8 rounding
  const sha=createHash('sha256').update(new Uint8Array(pixels.buffer)).digest('hex');if(hashes.has(frame))assert.equal(sha,hashes.get(frame));hashes.set(frame,sha);
}await writeFile(join(dir,'first.png'),(await renderer.renderFrame(0)).png);}finally{await renderer.close();}
const rows=[];
for(const [name,policy]of [['flat',{singleFile:true}],['capsule',{singleFile:true,layout:'capsule' as const}],['tree',{}]] as const){
  const target=join(dir,name+(name==='tree'?'':'.tsx')),result=await exportProject(project,{...policy,output:target}),exported=await buildProject(result.entry),r=await Renderer.create(exported,options);
  try{const pixels=pixelsFromSurface(await r.renderNativeSurface(1));assert.equal(createHash('sha256').update(new Uint8Array(pixels.buffer)).digest('hex'),hashes.get(1));rows.push({name,entry:result.entry,hash:hashes.get(1)});}finally{await r.close();}
  console.log(JSON.stringify({case:'servo-export',name,entry:result.entry}));
}
const relativeEntry=join(dir,'relative.tsx');await writeFile(relativeEntry,(await readFile(project,'utf8')).replace("'@frameweave/engine/servo'",JSON.stringify(relative(dir,join(root,'modules/servo/index.ts')).replaceAll('\\','/'))));
const relativeFlat=await exportProject(relativeEntry,{singleFile:true,output:join(dir,'relative-flat.tsx')});assert.ok((await readFile(relativeFlat.entry,'utf8')).includes('@frameweave/engine/servo'));await buildProject(relativeFlat.entry);
const invalid=join(dir,'invalid.tsx');await writeFile(invalid,`import {Composition,Stage} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {prepareServo} from '@frameweave/engine/servo/node';export const bad=defineNativeStage(async init=>{await prepareServo({root:'.',entry:'p',resources:{p:'private.html'}});return {renderAt(){throw Error('must never execute');}};});export default <Composition width={2} height={2} fps={24} durationInFrames={3}><Stage id="bad" factory={bad}/></Composition>;`);await assert.rejects(buildProject(invalid),e=>e instanceof Error&&/E_COMPILE|Node|node:|Could not resolve|not available|Unable to resolve/.test(String((e as any).code)+' '+e.message));
const output=join(dir,'clip.mp4'),media=await renderNativeProject(project,{build:built,native,output,start:0,end:3,maxConcurrency:3,initialConcurrency:3,encoder:'libx264'});assert.equal(media.frames,3);
const raw=(await promisify(execFile)(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2,timeout:10000})).stdout;assert.equal(raw.length,48*24*4*3);
await writeFile(join(out,'servo.json'),JSON.stringify({project,originalInputsUnavailable:true,rows,relativeFlat:relativeFlat.entry,nodePreparationDeniedInsideStage:true,output,decodedFrames:3,slots:3},null,2)+'\n');console.log(JSON.stringify({ok:true,project,output,decodedFrames:3}));
