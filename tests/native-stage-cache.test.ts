import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {linear709,pixelsFromSurface} from '../src/media/surface.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';

const executable=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
const scene=`
import {Composition,Stage,Layer,ref,acescg} from '@frameweave/engine';
const output={format:'rgba32float',alpha:'premultiplied',color:acescg};
const source={version:1,output,inputOrder:[],parameterTypes:['f32'],
 kernel:{abiVersion:1,id:'test/cache/source',version:'1.0.0',inputCount:0,parameterWords:1,
 code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),-.125,3.,.75);}'}};
const grade={version:1,output,inputOrder:['image'],parameterTypes:['f32'],
 kernel:{abiVersion:1,id:'test/cache/grade',version:'1.0.0',inputCount:1,parameterWords:1,
 code:'fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(v.rgb*paramF32(0u),v.a);}'}};
export default <Composition width={8} height={4} fps={24} durationInFrames={12} background="transparent">
 <Stage id="source" engine="native-gpu" outputs={{surface:'surface'}} props={{nativePixel:source,parameters:[2],nativeCache:'deterministic-v1'}}/>
 <Stage id="grade" engine="native-gpu" inputs={{image:ref('source')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}} props={{nativePixel:grade,parameters:[1],nativeCache:'deterministic-v1'}}/>
 <Layer source={ref('grade')}/>
</Composition>;
`;

test('deterministic Stage cache stays resident and invalidates by upstream parameters and time',async()=>{
 await mkdir('.frameweave',{recursive:true});
 const folder=await mkdtemp(resolve('.frameweave','stage-cache-test-'));
 try{
  const file=join(folder,'project.tsx');
  await writeFile(file,scene);
  const build=await buildProject(file),frames=[[0,2,1],[0,2,.5],[0,3,.5],[1,2,.5],[0,2,1]];
  const results=[];
  for(const cache of [false,true]){
   const renderer=await Renderer.create(build,{cache,nativeGpu:{executable,slots:1,dynamic:'interactive',readback:'final-surface'}});
   try {
    const values=[],counters=[];
    for(const [frame,source,grade] of frames){
     const surface=await renderer.renderNativeSurface(frame,{execution:{stageProps:{source:{parameters:[source]},grade:{parameters:[grade]}}}});
     values.push(pixelsFromSurface(surface));
     const {stageCache}=await renderer.nativeStats();
     counters.push([stageCache.hits,stageCache.misses]);
    }
    assert.deepEqual(counters,cache?[[0,2],[1,3],[1,5],[1,7],[3,7]]:frames.map(()=>[0,0]));
    results.push(values);
   }finally{await renderer.close();}
  }
  assert.deepEqual(results[0],results[1]);
  assert.deepEqual(results[1].map(p=>[...p.slice(0,4)]),frames.map(([,source,grade])=>[source*grade,-.125*grade,3*grade,.75]));
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('native owner rejects a cached range when an interior image escapes the Stage',async()=>{
 const scope=new NativeRecordingScope();
 const g=scope.api;
 const source=await g.compile({abiVersion:1,id:'test/cache/range-source',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.,0.,0.,1.);}'});
 const mid=await g.compile({abiVersion:1,id:'test/cache/range-mid',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'});
 const end=await g.compile({abiVersion:1,id:'test/cache/range-end',version:'1.0.0',inputCount:2,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p))*.5+read1(vec2i(p))*.5;}'});
 const a=await g.run(source,[],{output:{width:8,height:4,color:linear709,format:'rgba32float',alpha:'opaque'}});
 const b=await g.run(mid,[a]);
 scope.publish(await g.run(end,[a,b]));
 const {parameters,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...graph}=scope.packet();
 const client=await NativeGpuClient.create({...graph,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:2**20,display:null},{executable});
 try{
  const key='a'.repeat(64);
  await assert.rejects(client.submit(0,parameters,{stageCache:[{first:0,pass:1,key}]}),{
   code:'E_NATIVE_STAGE_CACHE',message:'range has an externally visible intermediate',
  });
  for(const frame of [0,1]){
   const ticket=await client.submit(frame,parameters,{stageCache:[{first:0,pass:2,key}]});
   await ticket.completed;
  }
  const {stageCache}=await client.stats();
  assert.equal(stageCache.hits,1);
  assert.equal(stageCache.skippedPasses,3);
 }finally{await client.close();await g.dispose();}
});

test('native owner reuses a range with frame-local compute scratch and rejects escaping scratch',async()=>{
 const scope=new NativeRecordingScope();
 const gpu=scope.api;
 const scratch=await gpu.createBuffer({type:'f32',length:1},new Float32Array([.25]));
 const update=await gpu.compileCompute({
  abiVersion:1,id:'test/cache/range-write',version:'1.0.0',parameterWords:0,workgroupSize:[1,1,1],
  bindings:[{type:'f32',access:'read_write'}],code:'fn compute(g:vec3u,l:vec3u,w:vec3u){store0(0u,.75);}',
 });
 const read=await gpu.compile({
  abiVersion:2,id:'test/cache/range-read',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,
  code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u),0.,0.,1.);}',
 });
 const output={width:8,height:4,color:linear709,format:'rgba32float',alpha:'opaque'} as const;
 await gpu.dispatch(update,[scratch],{workItems:[1,1,1]});
 await gpu.run(read,[],{data:[scratch],output});
 scope.publish(await gpu.run(read,[],{data:[scratch],output}));
 const {parameters,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...graph}=scope.packet();
 const client=await NativeGpuClient.create({...graph,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:2**20,display:null},{executable});
 try{
  const key='b'.repeat(64);
  await assert.rejects(client.submit(0,parameters,{stageCache:[{first:0,pass:1,key}]}),{
   code:'E_NATIVE_STAGE_CACHE',message:'range has externally visible scratch data',
  });
  for(const frame of [0,1]){
   const ticket=await client.submit(frame,parameters,{stageCache:[{first:0,pass:2,key}]});
   await ticket.completed;
  }
  const {stageCache}=await client.stats();
  assert.equal(stageCache.hits,1);
  assert.equal(stageCache.skippedPasses,3);
 }finally{await client.close();await gpu.dispose();}
});
