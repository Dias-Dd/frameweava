import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {readJsonResource} from '../modules/graphics-contracts/resources.ts';
import {validateTrackData,createTrackReader} from '../modules/graphics-contracts/track.ts';
import {queryTrack} from '../modules/graphics-contracts/track.ts';

const evidence=join(engineRoot,'docs/analysis-c3-validation');
const bytes=await readFile(join(evidence,'track-example.json'));
const artifact=JSON.parse(await readFile(join(evidence,'face-artifact.json'),'utf8'));
const file=artifact.files.find((f:{path:string})=>f.path==='track.json');
const identity={resourceId:'trackFile',kind:'file' as const,sha256:file.sha256,bytes:file.bytes};

test('C3 persisted TrackData retains its artifact identity and is accepted by the shared graphics reader',async()=>{
  assert.equal(bytes.length,file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const data=await readJsonResource(identity,bytes,validateTrackData),reader=createTrackReader(data);
  assert.equal(data.cacheKey,artifact.cacheKey);assert.equal(data.media.sha256,artifact.identity.inputs[0].sha256);
  assert.equal(data.samples.length,64);assert.equal(data.samples.filter(s=>!s.valid).length,7);
  const times=[-1,0,.125,.3125,3.147,7.9375,8,...data.samples.flatMap(s=>[s.timestampUs/1e6,s.timestampUs/1e6+.0625])];
  for(const time of times.reverse())for(const mode of ['linear','nearest'] as const)assert.deepEqual(reader.query(time,{mode}),queryTrack(data,time,{mode}));
});

test('C3 artifact file feeds graphics Reader and marker Stages without live analysis or inference',{timeout:120000},async()=>{
  const parent=join(engineRoot,'.frameweave/analysis-graphics-integration');await mkdir(parent,{recursive:true});
  const dir=await mkdtemp(join(parent,'case-')),proof=join(engineRoot,'artifacts/integration-agents-2-3');
  try{
    await writeFile(join(dir,'track.json'),bytes);
    const root=join(engineRoot,'modules/graphics-contracts/experiments');
    await writeFile(join(dir,'project.ts'),`import {Composition,Stage,Resource,Layer,ref} from '@frameweave/engine';
import {trackReaderStage} from ${JSON.stringify(join(root,'track-reader-stage.ts'))};
import {markerConsumer} from ${JSON.stringify(join(root,'marker-consumer.ts'))};
export {trackReaderStage,markerConsumer};
export default Composition({width:128,height:96,fps:16,durationInFrames:128,background:'transparent',children:[
Resource({id:'trackFile',kind:'file',src:'./track.json'}),
Stage({id:'track',factory:trackReaderStage,props:{identity:${JSON.stringify(identity)},sourceStartSeconds:0,rate:1,target:{spaceId:'integration.canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:128,height:96}},outputs:{motion:'json'}}),
Stage({id:'marker',factory:markerConsumer,inputs:{motion:ref('track','motion')},inputTypes:{motion:'json'},outputs:{surface:'surface',drawn:'boolean',x:'number',y:'number'}}),Layer({source:ref('marker')})]});`);
    const build=await buildProject(join(dir,'project.ts')),sources=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8'));
    assert.ok(sources.files.every((f:string)=>!/[\\/](?:face-session|worker)\.ts$/.test(f)&&!/[\\/]src[\\/]analysis[\\/]/.test(f)));
    const renderer=await Renderer.create(build,{cache:false}),data=validateTrackData(JSON.parse(bytes.toString())),seen=new Map<number,Buffer>();
    try{
      await mkdir(proof,{recursive:true});
      for(const frame of [0,2,5,64,127,5,0]){
        const result=await renderer.renderFrame(frame),query=queryTrack(data,frame/16),pixels=await sharp(result.png).ensureAlpha().raw().toBuffer();
        assert.deepEqual(result.diagnostics.map(d=>[d.code,d.severity,d.frame]),query.valid?[]:[['W_BLANK_FRAME','warning',frame]]);
        assert.equal(result.stageOutputs.marker.drawn,query.valid);
        if(query.valid){assert.equal(result.stageOutputs.marker.x,query.anchor.x*128);assert.equal(result.stageOutputs.marker.y,query.anchor.y*96);}
        else assert.ok(pixels.every((v,i)=>i%4!==3||v===0));
        if(seen.has(frame))assert.deepEqual(pixels,seen.get(frame));seen.set(frame,pixels);
        if(frame===0||frame===2)await writeFile(join(proof,`analysis-graphics-frame-${frame}.png`),result.png);
      }
    }finally{await renderer.close();}
  }finally{assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}
});
