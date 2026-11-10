import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {sceneVolumeLayout} from '../modules/native-gpu/scene-volume-grid.ts';
import type {SceneVolume} from '../modules/native-gpu/scene-volume.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {withGpuResources} from '../modules/gpu-effects/resource-arena.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';

const base:SceneVolume={bounds:{min:[-1,-1,0],max:[1,1,1]},extinction:0,albedo:[0,0,0]};
test('sparse emission RGB is rejected before building GPU records',()=>{
 for(const coefficient of [Array(3),[1,,3]])
  assert.throws(()=>sceneVolumeLayout([{...base,emission:{coefficient:coefficient as [number,number,number]}}]),{code:'E_NATIVE_SCENE_VOLUME'});
 const words=sceneVolumeLayout([{...base,emission:{coefficient:[0,0,0]}}]).words;
 assert.deepEqual(Array.from(words.slice(20,23)),[0,0,0]);
});
test('emission has independent source units, versioned records, scalar grids and caller byte admission',()=>{
 const density={version:1 as const,dimensions:[1,1,2] as const,maximum:1,values:[.2,.8]};
 const words=sceneVolumeLayout([{...base,density,emission:{coefficient:[32,8,2],density,samples:19}}]).words,bits=new Uint32Array(words.buffer);
 assert.equal(words[0],3);assert.equal(words.length,36);assert.deepEqual(Array.from(words.slice(20,23)),[32,8,2]);
 assert.equal(bits[23],19);assert.equal(bits[15],32);assert.equal(bits[24],34);
 assert.deepEqual(Array.from(words.slice(-4)),Array.from(Float32Array.of(.2,.8,.2,.8)));
 assert.equal(sceneVolumeLayout([base]).words[0],2);
 assert.throws(()=>sceneVolumeLayout([{...base,emission:{coefficient:[2,3,4],density}}],128),{code:'E_NATIVE_SCENE_VOLUME'});
 for(const emission of [null,{}, {coefficient:[1,2]}, {coefficient:[-1,2,3]}, {coefficient:[1,NaN,3]},
  {coefficient:[1,Infinity,3]}, {coefficient:['1',2,3]}, {coefficient:[1,2,3],samples:0},
  {coefficient:[1,2,3],samples:1.5},{coefficient:[1,2,3],samples:0x100000000},
  {coefficient:[1,2,3],unknown:1},{coefficient:[1,2,3],density:{...density,values:[-.1,.8]}}])
  assert.throws(()=>sceneVolumeLayout([{...base,emission:emission as never}]),{code:'E_NATIVE_SCENE_VOLUME'});
});

test('shared extinction/emission factories preserve scope ownership, single evaluation and failure cleanup',async()=>{
 const scope=new NativeRecordingScope(),foreign=new NativeRecordingScope(),g=scope.api;
 const context={frame:0,time:0,dt:1/24,globalFrame:0,globalTime:0,fps:{num:24,den:1},seed:1,progress:0,durationInFrames:1};
 const density={version:1 as const,dimensions:[1,1,2] as const,maximum:1};
 const other=await foreign.api.createField({type:'f32',dimensions:[1,1,2],components:1,semantic:'density'});
 let calls=0;
 const factory:NonNullable<NonNullable<SceneVolume['density']>['gpu']>=async(_c,a)=>{
  calls++;return a.buffer(await g.createField({type:'f32',dimensions:[1,1,2],components:1,semantic:'density'},Float32Array.of(.2,.8)));
 };
 const valid=sceneVolumeLayout([{...base,density:{...density,gpu:factory},emission:{coefficient:[2,3,4],density:{...density,gpu:factory}}}]);
 const buffer=await g.createBuffer({type:'f32',length:valid.words.length},valid.words);
 scope.sealInitialization();scope.beginFrame();
 try{
  await withGpuResources(g,a=>valid.frame(g,a,context,buffer));assert.equal(calls,1);
  const invalid:{factory:NonNullable<NonNullable<SceneVolume['density']>['gpu']>;code:string}[]=[
   {factory:async()=>other,code:'E_NATIVE_SCOPE'},
   {factory:async(_c,a)=>a.buffer(await g.createField({type:'f32',dimensions:[1,1,3],components:1,semantic:'density'})),code:'E_NATIVE_SCENE_VOLUME'},
  ];
  for(const {factory,code} of invalid){
   const plan=sceneVolumeLayout([{...base,emission:{coefficient:[2,3,4],density:{...density,gpu:factory}}}]);
   await assert.rejects(withGpuResources(g,a=>plan.frame(g,a,context,buffer)),{code});
  }
 }finally{await g.dispose();await foreign.api.dispose();}
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('real GPU emission matches closed-form transport, independent grids, occlusion, reflection and diffuse GI',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan owner',
},async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'emission-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage,createNativePathTracer,type SceneVolume,type NativeScene3D} from '@frameweave/engine/native';
const volume:SceneVolume={bounds:{min:[-1,-1,0],max:[1,1,1]},extinction:0,albedo:[0,0,0]};
const j:NonNullable<SceneVolume['emission']>={coefficient:[2,3,4]};
export const shot=defineNativeStage(async init=>{
 const kernel=await init.gpu.compileCompute({abiVersion:1,id:'test/emission-grid',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[1,1,1],code:'fn compute(p:vec3u,l:vec3u,g:vec3u){store0(p.z,select(.2,.8,p.z==1u));}'});
 const gpuDensity:NonNullable<SceneVolume['density']>={version:1,dimensions:[1,1,2],maximum:1,async gpu(c,a){const data=a.buffer(await init.gpu.createField({type:'f32',dimensions:[1,1,2],components:1,semantic:'density'}));await init.gpu.dispatch(kernel,[data],{workItems:[1,1,2]});return data;}};
 const scene=(volumes:SceneVolume[],z=-1,kind='black',mirror=false,glass=false):NativeScene3D=>({
  geometries:{plane:{restPositions:[[-4,-4,z],[4,-4,z],[4,4,z],[-4,4,z]],indices:[0,1,2,0,2,3]},
   slab:{restPositions:[[-4,-4,1],[4,-4,1],[4,4,1],[-4,4,1],[-4,-4,-1],[4,-4,-1],[4,4,-1],[-4,4,-1]],indices:[0,1,2,0,2,3,4,6,5,4,7,6]}},
  materials:{m:kind==='emit'?{kind:'emissive',radiance:[2,3,4]}:kind==='diffuse'?{kind:'diffuse',color:[.5,.5,.5]}:kind==='mirror'?{kind:'metal',color:[1,1,1],roughness:0}:{kind:'unlit',color:[0,0,0]},glass:{kind:'dielectric',ior:1,absorption:[.2,.3,.4]}},
  nodes:[{id:'plane',geometry:'plane',material:'m'},...(glass?[{id:'glass',geometry:'slab',material:'glass'}]:[])],
  volumes,environment:{lower:[0,0,0],upper:[0,0,0]},sun:{direction:[0,0,1],radiance:[0,0,0]},
  sample(){return {camera:{projection:'orthographic',position:mirror?[3,0,3]:[0,0,3],target:[0,0,0],near:.05,far:9,viewHeight:.0001}};}
 });
 const cases=[
  scene([{...volume,emission:j}]),
  scene([{...volume,emission:{coefficient:[32,8,2]}}]),
  scene([{...volume,extinction:.8,emission:j}]),
  scene([{...volume,density:{version:1,dimensions:[1,1,1],maximum:1,values:[0]},emission:j,extinction:1}]),
  scene([{...volume,emission:{...j,density:{version:1,dimensions:[1,1,2],maximum:1,values:[.2,.8]}}}]),
  scene([{...volume,emission:{...j,density:gpuDensity}}]),
  scene([{...volume,emission:j}],.75),
  scene([{...volume,emission:j},{...volume,extinction:.8}]),
  scene([{...volume,bounds:{min:[-1,-1,-.5],max:[1,1,.5]},emission:j}],-2,'black',false,true),
  scene([{...volume,bounds:{min:[-2.1,-1,.9],max:[-.9,1,2.1]},emission:{coefficient:[2,1,.5]}}],0,'mirror',true),
  scene([{...volume,bounds:{min:[.8,-1,1],max:[1.8,1,2]},emission:{coefficient:[4,2,1]}}],0,'diffuse'),
  scene([],0,'diffuse'),scene([],-1,'emit'),scene([{...volume,emission:{coefficient:[0,0,0]}}],-1,'emit')
 ];
 const paths=await Promise.all(cases.map(s=>createNativePathTracer(init,s,{samples:128,maxBounces:4,aovs:true})));
 return {renderAt(c){return paths[c.frame].renderAt(c,{},{});},async dispose(){for(const p of paths)await p.dispose?.();}};
});
export default <Composition width={64} height={64} fps={24} durationInFrames={14} seed={9187}><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/></Composition>;
`);
 // Independent cosine-hemisphere quadrature of a box's radiance-length, not
 // the shader's free-flight/source estimator or its random-number generator.
 let integral=0;const side=256;
 for(let i=0;i<side;i++)for(let k=0;k<side;k++){
  const u=(i+.5)/side,phi=2*Math.PI*(k+.5)/side,d=[Math.sqrt(u)*Math.cos(phi),Math.sqrt(u)*Math.sin(phi),Math.sqrt(1-u)];
  let near=0,far=Infinity;for(let axis=0;axis<3;axis++){const lo=[.8,-1,1][axis],hi=[1.8,1,2][axis],a=(lo-(axis===2?.0001:0))/d[axis],b=(hi-(axis===2?.0001:0))/d[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
  integral+=Math.max(0,far-near)/(side*side);
 }
 const absorption=(1-Math.exp(-.8))/.8;
 const expected=[[2,3,4],[32,8,2],[2,3,4].map(x=>x*absorption),[2,3,4],[1,1.5,2],[1,1.5,2],[.5,.75,1],
  [2,3,4].map(x=>x*absorption),[.2,.3,.4].map((a,i)=>(i+2)*(Math.exp(-a*.5)-Math.exp(-a*1.5))/a),
  [2,1,.5].map(x=>x*1.2*Math.SQRT2),[4,2,1].map(x=>x*.5*integral),[0,0,0],[2,3,4],[2,3,4]];
 const r=await Renderer.create(await buildProject(entry),{timeoutMs:120000,nativeGpu:{executable:resolve(executable!),rayQuery:true,slots:1,dynamic:'throughput',readback:'final-surface'}});
 const seen=new Map<number,Float32Array>(),records=[];
 try{for(const frame of [9,0,2,8,10,1,3,4,5,6,7,11,12,13,5,0]){
  const capture=await r.captureNativeFrame(frame,['frameweave.final-surface','shot/path-transport']);
  const pixels=capture.buffers['frameweave.final-surface'].values,lighting=capture.buffers['shot/path-transport'].values;
  assert.ok(pixels instanceof Float32Array&&lighting instanceof Float32Array&&pixels.every(Number.isFinite)&&lighting.every(Number.isFinite));
  if(seen.has(frame))assert.deepEqual(pixels,seen.get(frame));else seen.set(frame,pixels.slice());
  const mean=[0,0,0];let lobeError=0;
  for(let i=0;i<4096;i++){assert.equal(pixels[i*4+3],1);for(let c=0;c<3;c++){mean[c]+=pixels[i*4+c]/4096;lobeError=Math.max(lobeError,Math.abs(lighting[i*18+c]-[3,6,9,12,15].reduce((s,j)=>s+lighting[i*18+j+c],0)));}}
  const error=Math.max(...mean.map((v,i)=>Math.abs(v-expected[frame][i])));
  assert.ok(error<.018,JSON.stringify({frame,mean,expected:expected[frame],error}));assert.ok(lobeError<.00005);
  records.push({frame,mean,expected:expected[frame],error,lobeError});
 }
 assert.deepEqual(seen.get(12),seen.get(13),'Explicit zero emission must preserve the nonemissive result');
 const result={version:1,records,independentDiffuseIntegral:integral,stats:await r.nativeStats()};
 await writeFile(join(dir,'result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({version:1,result:join(dir,'result.json'),cases:records.length,maxError:Math.max(...records.map(r=>r.error))}));
 }finally{await r.close();}
});
