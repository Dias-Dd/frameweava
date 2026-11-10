import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {sceneVolumeLayout} from '../modules/native-gpu/scene-volume-grid.ts';
import type {SceneVolume} from '../modules/native-gpu/scene-volume.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {withGpuResources} from '../modules/gpu-effects/resource-arena.ts';

const base:SceneVolume={bounds:{min:[-1,-1,0],max:[1,1,1]},extinction:.8,albedo:[0,0,0]};
test('density tables validate complete bounded scalar data and device/address admission',()=>{
 const density={version:1 as const,dimensions:[1,1,2] as const,maximum:1,values:[.2,.8]};
 const layout=sceneVolumeLayout([{...base,density}]);
 assert.equal(layout.words[0],2);
 assert.deepEqual(Array.from(layout.words.slice(-2)),Array.from(Float32Array.of(.2,.8)));
 for(const invalid of [
  {...density,version:2},{...density,dimensions:[2,2,2]},
  {...density,maximum:1e-100},{...density,maximum:0},{...density,values:[0,NaN]},
  {...density,values:[-.1,.8]},{...density,values:[.2,1.1]},
  {...density,gpu:()=>{}},{...density,dimensions:[0xffffffff,0xffffffff,2]},
 ])assert.throws(()=>sceneVolumeLayout([{...base,density:invalid as never}]),{code:'E_NATIVE_SCENE_VOLUME'});
 assert.throws(()=>sceneVolumeLayout([{...base,extinction:3e38,density:{...density,maximum:3e38}}]),{code:'E_NATIVE_SCENE_VOLUME'});
 assert.throws(()=>sceneVolumeLayout([{...base,density}],32),{code:'E_NATIVE_SCENE_VOLUME'});
});

test('density producers preserve ownership, complete-field shape, one evaluation and failure cleanup',async()=>{
 const scope=new NativeRecordingScope(),other=new NativeRecordingScope(),gpu=scope.api;
 const foreign=await other.api.createField({type:'f32',dimensions:[1,1,2],components:1,semantic:'density'});
 const baseBuffer=await gpu.createBuffer({type:'f32',length:40},new Float32Array(40));
 scope.sealInitialization();scope.beginFrame();
 const context={frame:0,time:0,dt:1/24,globalFrame:0,globalTime:0,fps:{num:24,den:1},seed:1,progress:0,durationInFrames:1};
 const plan=(producer:NonNullable<NonNullable<SceneVolume['density']>['gpu']>)=>sceneVolumeLayout([
  {...base,density:{version:1,dimensions:[1,1,2],maximum:1,gpu:producer}},
 ]);
 try {
  await assert.rejects(withGpuResources(gpu,arena=>plan(async()=>foreign).frame(gpu,arena,context,baseBuffer)),{code:'E_NATIVE_SCOPE'});
  await assert.rejects(withGpuResources(gpu,arena=>plan(async(_c,a)=>a.buffer(await gpu.createField({
   type:'f32',dimensions:[1,1,3],components:1,semantic:'density',
  }))).frame(gpu,arena,context,baseBuffer)),{code:'E_NATIVE_SCENE_VOLUME'});
  let calls=0;
  const producer:NonNullable<NonNullable<SceneVolume['density']>['gpu']>=async(_c,a)=>{
   calls++;return a.buffer(await gpu.createField({type:'f32',dimensions:[1,1,2],components:1,semantic:'density'},Float32Array.of(.2,.8)));
  };
  const medium={...base,density:{version:1 as const,dimensions:[1,1,2] as const,maximum:1,gpu:producer}};
  await withGpuResources(gpu,arena=>sceneVolumeLayout([medium,medium]).frame(gpu,arena,context,baseBuffer));
  assert.equal(calls,1);
 }finally{await gpu.dispose();await other.api.dispose();}
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('static/GPU density grids match independent optical-depth/scattering and off-axis cloud-shadow integrals',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan owner',
},async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'density-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type NativeScene3D,type SceneVolume} from '@frameweave/engine/native';
const medium:SceneVolume={bounds:{min:[-1,-1,0],max:[1,1,1]},extinction:.8,albedo:[0,0,0],
 density:{version:1,dimensions:[1,1,2],maximum:1,values:[.2,.8]}};
export const shot=defineNativeStage(async init=>{
 const kernel=await init.gpu.compileCompute({abiVersion:1,id:'test/scene-density',version:'1.0.0',
  bindings:[{type:'f32',access:'read_write'}],parameterWords:1,workgroupSize:[1,1,1],
  code:'fn compute(p:vec3u,l:vec3u,g:vec3u){if(paramF32(0u)<0.){store0(p.z,2.);return;}store0(p.z,select(.2,.8,p.z==1u)*paramF32(0u));}'});
 const gpuDensity:NonNullable<SceneVolume['density']>={version:1 as const,dimensions:[1,1,2] as const,maximum:1,
  async gpu(c,arena){
   const field=arena.buffer(await init.gpu.createField({type:'f32',dimensions:[1,1,2],components:1,semantic:'density'}));
   await init.gpu.dispatch(kernel,[field],{parameters:Float32Array.of(c.frame===8?-1:c.frame===2?.5:1),workItems:[1,1,2]});return field;
  }};
 const scene=(volumes:readonly SceneVolume[],black=false,shadow=false):NativeScene3D=>({
  geometries:{plane:{restPositions:[[-2,-2,-1],[2,-2,-1],[2,2,-1],[-2,2,-1]],indices:[0,1,2,0,2,3]}},
  materials:{m:shadow?{kind:'diffuse',color:[1,1,1]}:black?{kind:'diffuse',color:[0,0,0]}:{kind:'emissive',radiance:[2,3,4]}},
  nodes:[{id:'plane',geometry:'plane',material:'m',transform:shadow?[1,0,0,0,0,1,0,0,0,0,1,1]:undefined}],
  environment:{lower:[0,0,0],upper:[0,0,0]},
  sun:shadow?{direction:[1,0,1],radiance:[Math.PI*Math.SQRT2,Math.PI*Math.SQRT2,Math.PI*Math.SQRT2]}:
   {direction:[0,0,1],radiance:[4*Math.PI,4*Math.PI,4*Math.PI]},volumes,
  sample(){return {camera:{projection:'orthographic',position:[0,0,3],target:[0,0,0],near:.05,far:9,viewHeight:shadow?.002:1}};}
 });
 const scenes=[scene([medium]),scene([{...medium,density:gpuDensity}]),scene([{...medium,density:gpuDensity}]),
  scene([medium,{...medium,extinction:.3,density:undefined}]),
  scene([{...medium,albedo:[1,.6,.3]}],true),
  scene([{...medium,bounds:{min:[1,-1,1],max:[2,1,2]},density:{...medium.density!,values:[.5,.5]}}],true,true),
  scene([{...medium,density:{...medium.density!,maximum:2}}]),
  scene([{...medium,density:{...medium.density!,values:[0,0]}}]),
  scene([{...medium,density:gpuDensity}])];
 const paths=await Promise.all(scenes.map(s=>createNativePathTracer(init,s,{samples:32,maxBounces:0})));
 return {renderAt(c){return paths[c.frame].renderAt(c,{},{});},async dispose(){for(const p of paths)await p.dispose?.();}};
});
export default <Composition width={64} height={64} fps={24} durationInFrames={9}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:resolve(executable!),
  dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true}});
 const expected=[...[.4,.4,.2,.7].map(tau=>[2,3,4].map(c=>c*Math.exp(-tau))),
  [1,.6,.3].map(c=>c*(1-Math.exp(-.8))/2),[1,1,1].map(()=>Math.exp(-.4*Math.SQRT2)),[2,3,4].map(c=>c*Math.exp(-.4)),[2,3,4],
  [2,3,4].map((v,c)=>v*Math.exp(-.8)+(c===1?0:8)*(1-Math.exp(-.8)))];
 try {
  const images=new Map<number,Float32Array>(),samples:unknown[]=[];
  for(const frame of [5,0,4,2,1,3,6,7,8,1,5,0]) {
   const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
   assert.ok(pixels.every(Number.isFinite));
   if(images.has(frame))assert.deepEqual(pixels,images.get(frame));else images.set(frame,pixels);
   const mean=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)mean[c]+=pixels[i+c]/4096;
   const error=Math.max(...mean.map((v,c)=>Math.abs(v-expected[frame][c])));
   assert.ok(error<.018,JSON.stringify({frame,mean,expected:expected[frame],error}));
   samples.push({frame,mean,expected:expected[frame],error});
  }
  console.log(JSON.stringify({samples,stats:await renderer.nativeStats()}));
 }finally{await renderer.close();}
});
