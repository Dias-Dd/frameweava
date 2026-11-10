import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {createNativePathTracer} from '../modules/native-gpu/path-tracer.ts';
import {linear709,surfaceFromPixels} from '../src/media/surface.ts';
const executable=process.env.FRAMEWEAVE_NATIVE_GPU;

test('denoise features require explicit boolean opt-in and existing AOV publication',async()=>{
 const s=new NativeRecordingScope();const init={gpu:s.api,width:32,height:32} as Parameters<typeof createNativePathTracer>[0];
 try{
  await assert.rejects(createNativePathTracer(init,{} as never,{denoiseFeatures:true}),{code:'E_NATIVE_PATH_OPTIONS'});
  await assert.rejects(createNativePathTracer(init,{} as never,{aovs:true,denoiseFeatures:'yes' as never}),{code:'E_NATIVE_PATH_OPTIONS'});
 }finally{await s.api.dispose();}
});

test('both atlas representations preserve HDR/negative Beauty and bounded material/normal-map features',{
 skip:executable?false:'FRAMEWEAVE_NATIVE_GPU must identify the reviewed Native owner',
},async()=>{
 const parent=resolve('.frameweave/scene3d');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'denoise-materials-')),entry=join(dir,'project.tsx');
 const texels=Float32Array.of(-.2,.5,2,1,.8,.5,.9,1);
 await writeFile(join(dir,'atlas.f32'),Buffer.from(texels.buffer));
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(2,1,texels,{format:'rgba32float',color:linear709,alpha:'straight'})));
 await writeFile(entry,`
import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage,createNativePathTracer,type NativeScene3D,type SceneMaterial} from '@frameweave/engine/native';
export const picture=defineNativeStage(async init=>{
 const paths:Awaited<ReturnType<typeof createNativePathTracer>>[]=[];
 const materials:SceneMaterial[]=[{kind:'unlit',color:[1,1,1],colorMap:'color'},{kind:'emissive',radiance:[1000,20,3]},
  {kind:'dielectric',ior:1.5},{kind:'pbr',color:[.1,.2,.3],transmission:.8}];
 for(const decode of ['surface-v2','rgba32float-le'] as const)for(const material of materials){
  const scene:NativeScene3D={geometries:{panel:{restPositions:[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]],indices:[0,1,2,0,2,3],
    texCoords:[[.5,.5],[.5,.5],[.5,.5],[.5,.5]],normals:[[0,0,1],[0,0,1],[0,0,1],[0,0,1]],tangents:[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1]]}},
   materials:{m:{...material,normalMap:'normal'}},nodes:[{id:'panel',geometry:'panel',material:'m'}],
   textureAtlas:{resource:decode==='surface-v2'?'json':'raw',decode,width:2,height:1,regions:{color:{x:0,y:0,width:1,height:1},normal:{x:1,y:0,width:1,height:1}}},
   environment:{lower:[0,0,0],upper:[0,0,0]},sample(){return {camera:{position:[0,0,3],target:[0,0,0],projection:'orthographic',viewHeight:.001,near:.01,far:8}};}};
  paths.push(await createNativePathTracer(init,scene,{aovs:true,denoiseFeatures:true,samples:8,maxBounces:0}));
 }
 return {renderAt(c){return paths[c.frame].renderAt(c,{},{});},async dispose(){for(const p of paths)await p.dispose?.();}};
});
export default <Composition width={4} height={4} fps={24} durationInFrames={8}><Resource id="json" src="./atlas.json" kind="file"/><Resource id="raw" src="./atlas.f32" kind="file"/>
 <Stage id="test" factory={picture}/><Layer source={ref('test')}/></Composition>;
`);
 const r=await Renderer.create(await buildProject(entry),{timeoutMs:120000,nativeGpu:{executable:resolve(executable!),rayQuery:true,slots:1,dynamic:'throughput',readback:'final-surface'}});
 try{for(let frame=0;frame<8;frame++){
  const data=await r.captureNativeFrame(frame,['test/path-denoise-features','frameweave.final-surface']),features=data.buffers['test/path-denoise-features'].values,beauty=data.buffers['frameweave.final-surface'].values;
  assert.ok(features instanceof Float32Array&&beauty instanceof Float32Array);
  const expected=frame%4===0?[0,.5,1]:[1,1,1];
  for(let p=0;p<16;p++){
   for(let c=0;c<3;c++){assert.ok(Math.abs(features[p*3+c]-expected[c])<1e-6);assert.ok(Math.abs(features[48+p*3+c]-[.6,0,.8][c])<1e-6);}
   if(frame%4<2)for(let c=0;c<3;c++)assert.ok(Math.abs(beauty[p*4+c]-(frame%4===0?[-.2,.5,2]:[1000,20,3])[c])<1e-5,'Feature range conversion must never clamp the HDR/negative Beauty');
  }
 }}finally{await r.close();}
});

test('real GPU features match the actual Beauty rays with AA, lens, shutter and repeat access',{
 skip:executable?false:'FRAMEWEAVE_NATIVE_GPU must identify the reviewed Native owner',
},async()=>{
 const parent=resolve('.frameweave/scene3d');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'denoise-features-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage,createNativePathTracer,type NativeScene3D} from '@frameweave/engine/native';
export const picture=defineNativeStage(async init=>{
 const scene:NativeScene3D={geometries:{panel:{restPositions:[[-3,-3,0],[.083,-3,0],[.083,3,0],[-3,3,0]],indices:[0,1,2,0,2,3]}},
  materials:{m:{kind:'unlit',color:[.6,.2,.1]}},nodes:[{id:'panel',geometry:'panel',material:'m'}],
  environment:{lower:[0,0,0],upper:[0,0,0]},
  sample(c){return {camera:{position:[0,0,3],target:[0,0,0],projection:'perspective',verticalFov:50,near:.01,far:12},
   transforms:{panel:[1,0,0,c.time*8,0,1,0,0,0,0,1,0]}};}};
 const paths:Awaited<ReturnType<typeof createNativePathTracer>>[]=[];
 for(let mode=0;mode<4;mode++)for(let enabled=0;enabled<2;enabled++)paths.push(await createNativePathTracer(init,scene,{
  aovs:true,cryptomatte:true,samples:64,maxBounces:0,...enabled?{denoiseFeatures:true}:{},
  ...mode&1?{lens:{apertureRadius:.35,focusDistance:7}}:{},...mode&2?{shutter:{angleDegrees:180,timeSamples:8}}:{}}));
 // Paired frames deliberately ask the tracer for the SAME logical camera time
 // and random seed, so the opt-in itself cannot alter its comparison input.
 return {renderAt(c){const mode=Math.floor(c.frame/2),frame=0;return paths[c.frame].renderAt({...c,frame,time:.1,globalFrame:frame,globalTime:.1,seed:9187}, {}, {});},
  async dispose(){for(const p of paths)await p.dispose?.();}};
});
export default <Composition width={32} height={32} fps={24} durationInFrames={8} seed={9187}><Stage id="test" factory={picture}/><Layer source={ref('test')}/></Composition>;
`);
 const r=await Renderer.create(await buildProject(entry),{timeoutMs:120000,nativeGpu:{executable:resolve(executable!),rayQuery:true,slots:1,dynamic:'throughput',readback:'final-surface'}});
 const seen=new Map<number,Float32Array>(),records=[];
 try{for(const frame of [0,1,2,3,4,5,6,7,7,1]){
  const enabled=frame%2===1;
  const capture=await r.captureNativeFrame(frame,['frameweave.final-surface','test/path-transport','test/path-guide','test/path-cryptomatte',...enabled?['test/path-denoise-features']:[]]);
  const beauty=capture.buffers['frameweave.final-surface'].values,transport=capture.buffers['test/path-transport'].values;
  assert.ok(beauty instanceof Float32Array&&transport instanceof Float32Array);
  if(seen.has(frame))assert.deepEqual(beauty,seen.get(frame));else seen.set(frame,beauty.slice());
  if(!enabled){assert.equal(capture.buffers['test/path-denoise-features'],undefined);continue;}
  assert.deepEqual(beauty,seen.get(frame-1),'Opt-in feature computation must not change any Beauty byte');
  const data=capture.buffers['test/path-denoise-features'],features=data.values,coverage=capture.buffers['test/path-cryptomatte'].values;
  assert.ok(features instanceof Float32Array&&coverage instanceof Uint32Array);assert.equal(features.length,32*32*6);
  assert.deepEqual(data.info.dimensions,[32,32,2]);assert.equal(data.info.components,3);
  assert.equal((data.info.metadata as any).profile,'path-denoise-features-v1');
  let error=0,coverageError=0,fractional=0;
  for(let p=0;p<1024;p++){
   let hits=0;for(let sample=0;sample<64;sample++)if(coverage[sample*1024+p])hits++;
   const q=hits/64;if(q>0&&q<1)fractional++;
   for(let c=0;c<3;c++){
    error=Math.max(error,Math.abs(features[p*3+c]-transport[p*18+c]));
    coverageError=Math.max(coverageError,Math.abs(features[p*3+c]-q*[.6,.2,.1][c]));
   }
   coverageError=Math.max(coverageError,Math.abs(features[3072+p*3+2]-q));
  }
  assert.ok(fractional>0,'The fixture must exercise genuinely mixed camera-sample coverage');
  assert.ok(error<1e-6,JSON.stringify({frame,error}));assert.ok(coverageError<1e-6,JSON.stringify({frame,coverageError}));
  assert.ok(features.every(Number.isFinite));
  records.push({frame,mode:['jitter','jitter+lens','jitter+shutter','jitter+lens+shutter'][Math.floor(frame/2)],maximumBeautyError:error,maximumIndependentCoverageError:coverageError,fractionalPixels:fractional});
 }
 await writeFile(join(dir,'result.json'),JSON.stringify({version:1,records,stats:await r.nativeStats()},null,2));console.log(JSON.stringify({result:join(dir,'result.json'),records}));
 }finally{await r.close();}
});
