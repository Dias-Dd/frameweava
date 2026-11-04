import test from 'node:test';import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';import {mkdir,mkdtemp,readFile,writeFile,rename} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';import {readExr} from '../src/media/ocio.ts';import {pixelsFromSurface,linear709} from '../src/media/surface.ts';

test('SO-2 actual TSX nested automatic/explicit scopes keep five HDR operations resident, export and carry their sources',{timeout:150000},async()=>{
 const base=resolve('.frameweave/so2');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'native-'));
 const source=await readFile(resolve('examples/stage-orchestration/nested.tsx'),'utf8'),entry=join(dir,'project.tsx');await writeFile(entry,source);
 const build=await buildProject(entry),native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),renderer=await Renderer.create(build,{timeoutMs:30000,nativeGpu:{executable:native,slots:1,maxBytes:64*1024**2}}),rows=[];
 try{
  for(const frame of [3,0,1,3,3]){const started=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const renderMs=performance.now()-started,stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);
   const actual=await renderer.exportNativeBuffer(ticket,'finish/pixels'),expected=[3.25+frame/4,-.5,4,.5];assert.equal(actual.values.length,32*16*4);for(let i=0;i<actual.values.length;i++)assert.equal(actual.values[i],expected[i%4],`frame ${frame} value ${i}`);
   rows.push({frame,renderMs,expected,stats});
  }
 }finally{await renderer.close();await renderer.close();}
 const png=join(dir,'frame.png'),exr=join(dir,'frame.exr'),mp4=join(dir,'sequence.mp4');
 for(const [output,start,end]of [[png,3,4],[exr,3,4],[mp4,0,4]] as const)await renderNativeProject(entry,{build,native,output,start,end,maxConcurrency:1,maxBytes:64*1024**2,encoder:'libx264'});
 const decodedPng=await sharp(png).raw().toBuffer();assert.equal(decodedPng.length,32*16*4);
 const decoded=execFileSync(ffmpegPath(),['-v','error','-i',mp4,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,timeout:10000});assert.equal(decoded.length,32*16*4*4);
 const pixels=pixelsFromSurface((await readExr(exr,{color:linear709,alpha:'premultiplied'})).surface);for(let i=0;i<pixels.length;i++)assert.ok(Math.abs(pixels[i]-[4,-.5,4,.5][i%4])<1e-5);
 const carried=join(dir,'carried'),capsule=join(dir,'capsule.tsx'),flat=join(dir,'flat.tsx');await exportProject(entry,{output:carried});await exportProject(entry,{singleFile:true,layout:'capsule',output:capsule});await exportProject(entry,{singleFile:true,output:flat});
 const hidden=join(dir,'source-hidden.tsx');await rename(entry,hidden);
 try{for(const [kind,carriedEntry]of [['directory',join(carried,'project.tsx')],['capsule',capsule],['flat',flat]]as const){const carriedBuild=await buildProject(carriedEntry),output=join(dir,kind+'.png');await renderNativeProject(carriedEntry,{build:carriedBuild,native,output,start:3,end:4,maxConcurrency:1,maxBytes:64*1024**2});assert.deepEqual(await sharp(output).raw().toBuffer(),decodedPng);}}finally{await rename(hidden,entry);}
 await writeFile(join(base,'native-result.json'),JSON.stringify({version:1,rows,png,exr,mp4,decodedFrames:4,exrReference:[4,-.5,4,.5],sourceUnavailableExports:['directory','capsule','flat'],scopeModes:['auto','explicit','auto'],gpuImageReadbackBeforeExplicitExport:0},null,2));
});

test('SO-2 real scope errors are located, explicit inputs are required, unawaited/concurrent calls fail, and cancellation cleans up',{timeout:90000},async()=>{
 const base=resolve('.frameweave/so2');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'errors-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,CompositeStage,Stage,Layer,ref,linear709} from '@frameweave/engine';import{defineNativeStage,defineCompositeStage}from'@frameweave/engine/native';
 export const child=defineNativeStage(({gpu,width,height})=>({async renderAt(c,i:{n:number}){if(c.globalFrame===2)throw new Error('child exploded');return {n:c.globalFrame===6?'bad':i.n+1};}}));
 export const controller=defineCompositeStage(async({stages,gpu,width,height})=>{const draw=await gpu.compile({abiVersion:1,id:'so2/errors-draw',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.);}'});return{async renderAt(c){
 if(c.frame===0)await stages.run('outer');
 if(c.frame===1)await stages.run('child');
 if(c.frame===2||c.frame===6)await stages.run('child',{inputs:{n:1}});
 if(c.frame===3)void stages.run('child',{inputs:{n:1}});
 if(c.frame===4)await Promise.all([stages.run('child',{inputs:{n:1}}),stages.run('child',{inputs:{n:2}})]);
 if(c.frame===5)while(true){}
 return {surface:await gpu.run(draw,[],{output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709}})};}};});
 export default <Composition width={4} height={4} fps={24} durationInFrames={7}><CompositeStage id="outer" publish={{surface:ref('control')}}><CompositeStage id="control" mode="explicit" factory={controller}><Stage id="child" factory={child} inputTypes={{n:'number'}} outputs={{n:'number'}}/></CompositeStage></CompositeStage><Layer source={ref('outer')}/></Composition>;`);
 const build=await buildProject(entry),native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),rows:unknown[]=[];
 for(const [frame,code]of [[0,'E_STAGE_REFERENCE'],[1,'E_INPUT_MISSING'],[2,'E_NATIVE_LOGIC'],[3,'E_STAGE_CALL_PENDING'],[4,'E_STAGE_CALL_BUSY'],[5,'E_RENDER_CANCELLED'],[6,'E_OUTPUT_TYPE']]as const){
  const r=await Renderer.create(build,{timeoutMs:15000,nativeGpu:{executable:native,slots:1,maxBytes:16*1024**2}}),abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{if(frame===5)timer=setTimeout(()=>abort.abort(),60);await assert.rejects(r.submitNativeFrame(frame,{signal:abort.signal}),(error:any)=>{assert.equal(error.code,code);if([0,1,2,6].includes(frame)){assert.ok(error.stageId.includes('so2_'));assert.ok(error.details?.callPath);}rows.push({frame,code,stageId:error.stageId,details:error.details});return true;});}
  finally{clearTimeout(timer);await r.close();await r.close();}
 }
 await writeFile(join(base,'errors-result.json'),JSON.stringify({version:1,rows},null,2));
});
