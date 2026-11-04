import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {installPackages,installedPackages} from '../src/packages/manager.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {RenderSession} from '../modules/render-session/index.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {linear709,srgb,pixelsFromSurface} from '../src/media/surface.ts';
import {writeExr,readExr} from '../src/media/ocio.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {sharedVariable} from '../src/shared-state/authoring.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';

const root=resolve('.'),base=resolve('artifacts/main-integration-20261103');await mkdir(base,{recursive:true});
const out=await mkdtemp(join(base,'consumer-')),ledger=JSON.parse(await readFile(join(base,'campaign.json'),'utf8'));
const catalogCheck=[...ledger.commands].reverse().find(c=>c.name==='catalog'&&c.exitCode===0);assert.ok(catalogCheck);
const catalog=JSON.parse((await readFile(catalogCheck.stdout,'utf8')).trim().split(/\r?\n/).at(-1)!).catalog;
const project=join(out,'project.tsx'),exec=promisify(execFile),rows:any[]=[],media={workingColor:linear709,preview:{color:srgb,clip:true}};
const report={ok:false,runtimePin,catalog,out,rows};const save=()=>writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
async function step(name:string,run:()=>Promise<unknown>){const start=performance.now();try{const evidence=await run();rows.push({name,ok:true,ms:performance.now()-start,evidence});await save();console.log(JSON.stringify({name,ok:true}));}catch(error){rows.push({name,ok:false,ms:performance.now()-start,error:String(error),stack:(error as Error).stack});await save();throw error;}}
try{
 await step('formal four-library install and exact source identities',async()=>{
  await writeFile(project,`import{Composition,Stage,Layer,ref}from'@frameweave/engine';import{defineNativeStage}from'@frameweave/engine/native';
import{scene2D,group,rect,solid}from'native-2d';import{createVectorKeyframeControls}from'pro-animation-native';import{materialPreset}from'spatial-creation';import{processRaster,createNativePsfRestorationEffects,createNativeStabilizationEffects,createNativeVideoRotoEffects,parseVideoRotoBundle}from'native-image-effects';
export const artwork=defineNativeStage(async init=>{
 if(typeof createNativeStabilizationEffects!=='function'||typeof createNativeVideoRotoEffects!=='function'||typeof parseVideoRotoBundle!=='function')throw Error('Missing frozen image entry');
 const material=materialPreset('gold');if(!Number.isFinite(material.roughness))throw Error('Material facade missing');
 const motion=createVectorKeyframeControls([{frame:0,value:[2,3]},{frame:3,value:[18,3]}]);
 const scene=await scene2D(init,group({id:'root',children:[rect({id:'base',width:64,height:36,opacity:.75,fill:solid([2,-.25,.5])}),rect({id:'accent',x:2,y:3,width:16,height:20,opacity:.6,fill:solid([.1,1.5,3])})]}));
 const psf=createNativePsfRestorationEffects(init);
 return{async renderAt(context,inputs,props){const position=motion.valueAt(context);scene.update('accent',{x:position[0]});const source=await scene.renderAt(context,inputs,props);const filtered=await psf.processImage(source,async(image,fx)=>{const profile=await fx.prepareSpatialPsf(image,{kind:'frameweave.psf-grid',schemaVersion:1,columns:1,rows:1,kernelWidth:1,kernelHeight:1,kernels:[[1]]});return fx.convolveSpatialPsf(image,profile);},{context});return processRaster(filtered,(image,fx)=>fx.glow(image,{radius:1,intensity:.1,threshold:1}),{context});},async dispose(){await scene.dispose?.();await psf.dispose();}};
});export default <Composition width={64} height={36} fps={24} durationInFrames={4} background="transparent"><Stage id="art" factory={artwork}/><Layer source={ref('art')}/></Composition>;`);
  const installed=await installPackages(out,[catalog],{add:['pro-animation-native@0.2.1','native-image-effects@0.7.0','spatial-creation@1.1.1','native-2d@0.1.0'],trust:['local:frameweave.animation','local:frameweave.gpu-images','local:frameweave.spatial','local:frameweave.native-2d']});
  const state=await installedPackages(out);assert.equal(state.records.length,4);const image=state.records.find(r=>r.manifest.id==='native-image-effects')!;
  assert.ok(image.manifest.bindings?.gpuExports?.includes('createNativePsfRestorationEffects'));assert.ok(!image.manifest.bindings?.gpuExports?.includes('createNativeSphericalEffects'));return installed;
 });
 await step('installed named imports, real four-library HDR render and random access',async()=>{
  const build=await buildProject(project),renderer=await Renderer.create(build,{allowWasm:true,nativeGpu:{executable:await nativeExecutable(),readback:'final-surface',slots:1}}),hashes=[];
  try{for(const frame of [0,3,0]){const surface=await renderer.renderNativeSurface(frame),pixels=pixelsFromSurface(surface),bytes=Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength);assert.ok(pixels.some(x=>x>1));assert.ok(pixels.some(x=>x<0));hashes.push(createHash('sha256').update(bytes).digest('hex'));if(frame===0){await writeExr(surface,join(out,'combined.exr'),'rgba32float');const decoded=await readExr(join(out,'combined.exr'));assert.deepEqual(pixelsFromSurface(decoded.surface),pixels);}}
   assert.equal(hashes[0],hashes[2]);assert.notEqual(hashes[0],hashes[1]);return{hashes,stats:await renderer.nativeStats()};
  }finally{await renderer.close();}
 });
 await step('root Shared survives SO-2 integration and repeated-frame cache identity',async()=>{
  const count=sharedVariable({id:'count',writer:'writer',kind:'number',initial:0}),session=new RenderSession(resolve('examples/native-shared/project.tsx'),{media});
  try{const values=[];for(const frame of [100,0,100])values.push((await session.renderFrame(frame)).stageOutputs.reader.seen);assert.deepEqual(values,[1,2,3]);assert.equal((await session.readShared(count)).version,3);return{values,state:await session.readShared(count)};}finally{await session.close();}
 });
 await step('nested automatic and explicit helpers remain on the same Native owner',async()=>{
  const build=await buildProject(resolve('examples/stage-orchestration/nested.tsx')),renderer=await Renderer.create(build,{nativeGpu:{executable:await nativeExecutable(),readback:'final-surface',slots:1}});
  try{const surface=await renderer.renderNativeSurface(2),values=pixelsFromSurface(surface);assert.ok(values.some(x=>x<0));assert.ok(values.some(x=>x>1));return{pixel:[...values.slice(0,4)],stats:await renderer.nativeStats()};}finally{await renderer.close();}
 });
 await step('Native shared CLI path writes a real decoded video',async()=>{
  const video=join(out,'shared.mp4');const result=await renderNativeProject(resolve('examples/native-shared/project.tsx'),{output:video,start:0,end:3,encoder:'libx264'});
  const decoded=await exec(ffmpegPath(),['-v','error','-i',video,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{encoding:'buffer',windowsHide:true,timeout:15000,maxBuffer:2*1024**2});assert.equal(decoded.stdout.length,64*36*4*3);return{result,decodedBytes:decoded.stdout.length};
 });
 report.ok=true;await save();await writeFile(join(base,'latest-consumer.json'),JSON.stringify({out,result:join(out,'result.json')},null,2)+'\n');
}catch(error){await save();throw error;}
