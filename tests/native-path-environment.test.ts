import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';
import {environmentDistribution} from '../modules/native-gpu/scene-environment.ts';

test('environment CDF uses exact spherical cell area and retains a valid zero-energy fallback',()=>{
  const cdf=environmentDistribution({width:2,height:3,luminance:Array(6).fill(1)});
  const values=new Float32Array(cdf.buffer);
  assert.deepEqual([...values.slice(2)], [.125,.25,.5,.75,.875,1]);
  assert.deepEqual(environmentDistribution({width:2,height:3,luminance:Array(6).fill(0)}),cdf);
  assert.throws(()=>environmentDistribution({width:2,height:2,luminance:[1,2,NaN,0]}),{code:'E_NATIVE_SCENE_ENVIRONMENT'});
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('HDR map MIS matches the spherical cosine integral and lowers error against surface-only sampling',{
  skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
  const root=resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'environment-')),entry=join(dir,'project.tsx');
  const width=32,height=16,luminance=Array(width*height).fill(.05),target=3*width+19;
  luminance[target]=4000;
  const atlas=luminance.flatMap(v=>[v,.6*v,.2*v,1]);
  await writeFile(join(dir,'env.json'),JSON.stringify(surfaceFromPixels(width,height,atlas,{color:linear709,format:'rgba32float',alpha:'straight'})));
  await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,createNativeScene,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
const scene:NativeScene3D={
 geometries:{floor:{restPositions:[[-10,0,-10],[-10,0,10],[10,0,10],[10,0,-10]],indices:[0,1,2,0,2,3]}},
 materials:{floor:{kind:'diffuse',color:[.4,.5,.6]}},nodes:[{id:'floor',material:'floor',geometry:'floor'}],
 textureAtlas:{resource:'env',decode:'surface-v2',width:32,height:16,
  regions:{env:{x:0,y:0,width:32,height:16,addressU:'repeat',addressV:'clamp',filter:'nearest'}}},
 environment:{lower:[0,0,0],upper:[0,0,0],map:'env',importance:{width:32,height:16,luminance:${JSON.stringify(luminance)}}},
 sun:{direction:[0,1,0],radiance:[0,0,0]},
 sample(c){return {camera:{projection:'orthographic',position:[0,4,0],target:c.frame<2?[0,0,0]:[1,4,0],
  up:c.frame<2?[0,0,-1]:[0,1,0],near:.1,far:30,viewHeight:.01}};}
};
export const shot=defineNativeStage(async init=>{
 const renderers=await Promise.all([createNativePathTracer(init,scene,{samples:8,maxBounces:1}),
  createNativePathTracer(init,scene,{samples:8,maxBounces:1,lightSampling:'mis'}),createNativeScene(init,scene)]);
 return {renderAt(c){return renderers[c.frame===3?0:c.frame].renderAt(c,{},{});},
  dispose:async()=>{for(const r of renderers)await r.dispose?.();}};
});
export default <Composition width={64} height={32} fps={24} durationInFrames={4}>
 <Resource id="env" src="./env.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  let integral=0;
  for(let y=0;y<height/2;y++)for(let x=0;x<width;x++) {
    const a=Math.PI*y/height,b=Math.PI*(y+1)/height;
    integral+=luminance[y*width+x]*(Math.sin(b)**2-Math.sin(a)**2)/width;
  }
  const expected=[.4,.5*.6,.6*.2].map(c=>c*integral);
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  try {
    const frames=new Map<number,Float32Array>();
    for(const frame of [1,0,3,2,1]) {
      const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
      if(frames.has(frame))assert.deepEqual(pixels,frames.get(frame));
      frames.set(frame,pixels);
    }
    const metrics=[0,1].map(frame=>{
      const pixels=frames.get(frame)!;let error=0,sum=0;
      for(let i=0;i<pixels.length;i+=4){
        sum+=pixels[i];
        for(let c=0;c<3;c++)error+=(pixels[i+c]-expected[c])**2;
      }
      return {mean:sum/(64*32),rmse:Math.sqrt(error/(64*32*3))};
    });
    assert.ok(Math.abs(metrics[1].mean-expected[0])/expected[0]<.035,JSON.stringify({metrics,expected}));
    assert.ok(metrics[1].rmse<metrics[0].rmse*.2,JSON.stringify(metrics));
    assert.ok(frames.get(2)!.every((value,i)=>Math.abs(value-frames.get(3)![i])<1e-6));
    const sky=frames.get(2)!;
    assert.ok(Math.abs(sky[0]-.05)<1e-6&&Math.abs(sky[1]-.03)<1e-6);
    console.log(JSON.stringify({expected,surfaceOnly:metrics[0],mis:metrics[1],project:entry}));
  }finally{await renderer.close();}
});
