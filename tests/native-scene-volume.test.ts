import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;

test('GPU volume transport matches overlapping extinction and directional single-scattering integrals', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const entry = join(await mkdtemp(join(root,'volume-')),'project.tsx');
  await writeFile(entry,`
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type SceneNode,type SceneVolume} from '@frameweave/engine/native';
const plane = (id:string,x:number,material:string):SceneNode => ({
  id,geometry:'plane',material,transform:[1,0,0,x,0,1,0,0,0,0,1,-1]
});
const medium = (x:number,extinction:number,albedo:SceneVolume['albedo'],anisotropy=0):SceneVolume => ({
  bounds:{min:[x-1,-1,0],max:[x+1,1,1]},extinction,albedo,anisotropy
});
export const shot=defineNativeStage(init=>createNativePathTracer(init,{
  geometries:{plane:{restPositions:[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]],indices:[0,1,2,0,2,3]}},
  materials:{emit:{kind:'emissive',radiance:[2,3,4]},black:{kind:'diffuse',color:[0,0,0]}},
  nodes:[plane('absorption',0,'emit'),plane('scattering',5,'black'),plane('phase',10,'black')],
  environment:{lower:[0,0,0],upper:[0,0,0]},
  sun:{direction:[0,0,1],radiance:[4*Math.PI,4*Math.PI,4*Math.PI]},
  volumes:[medium(0,.3,[0,0,0]),medium(0,.5,[0,0,0]),medium(5,.8,[1,.6,.3]),medium(10,.8,[1,.6,.3],.35)],
  sample({frame}){
    const x=frame*5;
    return {camera:{projection:'orthographic',position:[x,0,3],target:[x,0,0],near:.05,far:9,viewHeight:1}};
  }
},{samples:32,maxBounces:0}));
export default <Composition width={64} height={64} fps={24} durationInFrames={3}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  const build = await buildProject(entry);
  const renderer = await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  const scatter = [1,.6,.3].map(a=>a * (1-Math.exp(-1.6)) / 2);
  const expected = [[2,3,4].map(v=>v*Math.exp(-.8)),scatter,scatter.map(v=>v*(1-.35**2)/(1+.35)**3)];
  try {
    let first: Float32Array | undefined;
    for(const frame of [1,0,2,1]){
      const pixels = pixelsFromSurface(await renderer.renderNativeSurface(frame));
      const average = [0,0,0];
      for(let i=0;i<pixels.length;i+=4) {
        for(let c=0;c<3;c++) average[c] += pixels[i+c] / (pixels.length/4);
        assert.equal(pixels[i+3],1);
      }
      assert.ok(expected[frame].every((value,c)=>Math.abs(value-average[c])<.014),
        JSON.stringify({frame,average,expected:expected[frame]}));
      if(frame===1) {
        if(first) assert.deepEqual(pixels,first);
        first=pixels;
      }
      console.log(JSON.stringify({frame,average,expected:expected[frame]}));
    }
  } finally { await renderer.close(); }
});
