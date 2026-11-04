import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {analysisHash} from '../../../src/analysis/artifact.ts';
import type {AnalysisArtifact} from '../../../src/analysis/types.ts';
import {buildProject,engineRoot} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import {readJsonResource} from '../resources.ts';
import {validateTrackData,createTrackReader,queryTrack} from '../track.ts';
import {queryTrack as compatibilityQuery} from '../../../prototypes/analysis-job-mvp/track.ts';

interface FaceOutput {trackFile:string;metrics:{inferenceFrames:number;validFrames:number}}
const delivery=join(engineRoot,'docs/analysis-c3-validation');
const proof=join(engineRoot,'artifacts/graphics-stabilization/c3');
const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const bytes=await readFile(join(delivery,'track-example.json'));
const artifact:AnalysisArtifact<FaceOutput>=JSON.parse(await readFile(join(delivery,'face-artifact.json'),'utf8'));
const file=artifact.files.find(f=>f.path===artifact.output.trackFile);
assert.ok(file,'published artifact must explicitly declare its TrackData output');
const identity={resourceId:'trackFile',kind:'file' as const,sha256:file.sha256,bytes:file.bytes};
const validated=()=>readJsonResource(identity,bytes,validateTrackData);

test('C3 published real Track file verifies against its artifact and preserves the pre-migration Reader oracle',async()=>{
  assert.equal(artifact.schemaVersion,1);assert.equal(artifact.kind,'frameweave.analysis-artifact');
  assert.equal(artifact.cacheKey,analysisHash({schemaVersion:1,identity:artifact.identity}));
  assert.equal(artifact.identity.algorithm.id,'mediapipe.FaceLandmarker');assert.equal(artifact.output.metrics.inferenceFrames,64);
  assert.equal(file.format,'application/vnd.frameweave.track+json;version=1');
  assert.equal(hash(bytes),'7e286a2915347b3c04602157939bc6be0c6e3b1f859decc0dbca81dbd47018b2');
  const data=await validated(),reader=createTrackReader(data);
  assert.equal(data.cacheKey,artifact.cacheKey);assert.equal(data.media.sha256,artifact.identity.inputs[0].sha256);
  assert.equal(data.model.sha256,artifact.identity.models[0].integrity);assert.equal(data.algorithm.implementationSha256,artifact.identity.algorithm.integrity);assert.equal(data.algorithm.runtimeSha256,artifact.identity.runtime.integrity);
  assert.equal(data.samples.length,64);assert.equal(data.samples.filter(s=>!s.valid).length,7);
  assert.equal(compatibilityQuery,queryTrack,'old entry must forward to the one formal implementation');
  const times=[-1,0,.125,.3125,3.147,7.9375,8,...data.samples.flatMap(s=>[s.timestampUs/1e6,s.timestampUs/1e6+.0625])];
  const records=times.flatMap(time=>(['linear','nearest'] as const).flatMap(mode=>[undefined,.01,.25].map(maxGapSeconds=>({time,mode,maxGapSeconds:maxGapSeconds??null,query:reader.query(time,{mode,maxGapSeconds})}))));
  assert.equal(records.length,810);
  // Captured from the original prototype Reader at base 35b5e45 before migration.
  // Original source SHA-256: 91866d104670d199b3268c3a5e715a75db3fa0d5c25592bb5779bb0f0ffcc228.
  // This digest is an independent behavior oracle, not a second query implementation.
  assert.equal(hash(JSON.stringify(records)),'ad9ce8a08b204be106b565f13402d46e2adb03c91e54f592d2237a3336d98c69');
  for(const time of [...times].reverse())assert.deepEqual(reader.query(time),queryTrack(data,time));
  assert.deepEqual(reader.query(.125),{valid:false,reason:'missing-detection'});
  assert.deepEqual(reader.query(8),{valid:false,reason:'outside-range'});
  assert.deepEqual(reader.query(7.9375),{valid:false,reason:'not-bracketed'});
  const interpolated=reader.query(.3125);assert.ok(interpolated.valid&&interpolated.interpolated);
  await mkdir(proof,{recursive:true});
  await writeFile(join(proof,'artifact-reader-proof.json'),JSON.stringify({ok:true,source:'checked-in successful C3 MediaPipe publication delivery',artifactCacheKey:artifact.cacheKey,trackSha256:file.sha256,trackBytes:file.bytes,verifiedOutputFile:artifact.output.trackFile,fullArtifactDirectoryAvailable:false,limitation:'The delivery contains the published manifest and TrackData; absent original PNG/result files and complete.json were not reconstructed or claimed verified.',queries:records.length,preMigrationOracleSha256:hash(JSON.stringify(records)),samples:64,missing:7,inferenceRerun:false},null,2)+'\n');
});

test('C3 real published Artifact TrackData drives existing Stage PNG/MP4 with exact/missing/interpolated/random frames',{timeout:180000},async()=>{
  const parent=join(engineRoot,'.frameweave/graphics-c3-stabilization');await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'project-'));
  await mkdir(proof,{recursive:true});
  try{
    await writeFile(join(directory,'track.json'),bytes);
    const stages=join(engineRoot,'modules/graphics-contracts/experiments');
    await writeFile(join(directory,'project.ts'),`import {Composition,Stage,Resource,Layer,ref} from '@frameweave/engine';
import {trackReaderStage} from ${JSON.stringify(join(stages,'track-reader-stage.ts'))};
import {markerConsumer} from ${JSON.stringify(join(stages,'marker-consumer.ts'))};
export {trackReaderStage,markerConsumer};
export default Composition({width:128,height:96,fps:16,durationInFrames:128,background:'transparent',children:[
Resource({id:'trackFile',kind:'file',src:'./track.json'}),
Stage({id:'track',factory:trackReaderStage,props:{identity:${JSON.stringify(identity)},sourceStartSeconds:0,rate:1,target:{spaceId:'c3.canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:128,height:96}},outputs:{motion:'json'}}),
Stage({id:'marker',factory:markerConsumer,inputs:{motion:ref('track','motion')},inputTypes:{motion:'json'},outputs:{surface:'surface',drawn:'boolean',x:'number',y:'number'}}),Layer({source:ref('marker')})]});`);
    const build=await buildProject(join(directory,'project.ts'));
    assert.equal(build.manifest.schemaVersion,'0.1');
    const sources:{files:string[]}=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8'));
    assert.ok(sources.files.every(f=>!/[\\/]prototypes[\\/]/.test(f)&&!/[\\/]src[\\/]analysis[\\/]/.test(f)),'render bundle has no analysis executor or prototype runtime dependencies');
    const data=await validated(),reader=createTrackReader(data),order=[0,64,127,2,5,19,64,0],seen=new Map<number,Buffer>();
    const renderer=await Renderer.create(build,{cache:false});
    const inspect=async(frame:number,save=false)=>{
      const result=await renderer.renderFrame(frame),q=reader.query(frame/16),pixels=await sharp(result.png).ensureAlpha().raw().toBuffer();
      assert.deepEqual(result.diagnostics.map(d=>[d.code,d.severity,d.frame]),q.valid?[]:[['W_BLANK_FRAME','warning',frame]]);
      assert.equal(result.stageOutputs.marker.drawn,q.valid);
      if(q.valid){assert.equal(result.stageOutputs.marker.x,q.anchor.x*128);assert.equal(result.stageOutputs.marker.y,q.anchor.y*96);const index=(Math.round(q.anchor.y*96)*128+Math.round(q.anchor.x*128))*4;assert.deepEqual([...pixels.subarray(index,index+4)],[53,244,164,255]);}
      else assert.ok(pixels.every((v,i)=>i%4!==3||v===0),'missing or unbracketed observations stay transparent');
      if(seen.has(frame))assert.deepEqual(pixels,seen.get(frame));
      if(save){seen.set(frame,pixels);await writeFile(join(proof,`frame-${frame}.png`),result.png);}
      return result.png;
    };
    try{
      for(const frame of order)await inspect(frame,true);
      const encoder=await VideoEncoder.create(join(proof,'C3-Graphics-Track.mp4'),{num:16,den:1},128,96);
      try{for(let frame=0;frame<128;frame++)await encoder.write(await inspect(frame));await encoder.finish();}catch(e){await encoder.abort();throw e;}
    }finally{await renderer.close();}
    const freshOrder=[127,5,0,2,64,19],fresh=await Renderer.create(build,{cache:false});
    try{for(const frame of freshOrder)assert.deepEqual(await sharp((await fresh.renderFrame(frame)).png).ensureAlpha().raw().toBuffer(),seen.get(frame));}finally{await fresh.close();}
    const video=await probeVideo(join(proof,'C3-Graphics-Track.mp4'));
    assert.equal(video.decodable,true);assert.equal(video.frames,128);assert.equal(video.fps,16);assert.equal(video.width,128);assert.equal(video.height,96);
    await writeFile(join(proof,'render-proof.json'),JSON.stringify({ok:true,artifactCacheKey:artifact.cacheKey,trackSha256:file.sha256,samples:64,missing:7,sourceTime:'absolute media seconds rounded to microseconds by original Reader',stageMapping:{sourceStartSeconds:0,rate:1},seekOrder:order,freshContextOrder:freshOrder,rgbaTolerance:0,uncached:true,frameHashes:Object.fromEntries([...seen].map(([f,b])=>[f,hash(b)])),all128FrameCoordinatesAndPixelsChecked:true,inferenceRerun:false,video},null,2)+'\n');
  }finally{assert.equal(dirname(resolve(directory)),resolve(parent));await rm(directory,{recursive:true,force:true});}
});
