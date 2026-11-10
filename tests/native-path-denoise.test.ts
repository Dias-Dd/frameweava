import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;

test('guided GPU denoising lowers HDR sequence error without crossing a moving object boundary', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir = await mkdtemp(join(root,'denoise-'));
  const frameOrder = [2,0,1,2];
  const results: Float32Array[][] = [];
  for (const denoise of [false,true,'temporal']) {
    const entry = join(dir,denoise==='temporal'?'temporal.tsx':denoise?'filtered.tsx':'raw.tsx');
    await writeFile(entry,`
import {Composition,Layer,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage} from '@frameweave/engine/native';
export const picture=defineNativeStage(init=>createNativePathTracer(init,{
  geometries:{quad:{restPositions:[[0,-2,0],[2,-2,0],[2,2,0],[0,2,0]],indices:[0,1,2,0,2,3]}},
  materials:{warm:{kind:'emissive',radiance:[2,3,7]},cool:{kind:'emissive',radiance:[7,2,1]}},
  nodes:[
    {id:'warm',geometry:'quad',material:'warm',transform:[1,0,0,-2,0,1,0,0,0,0,1,0]},
    {id:'cool',geometry:'quad',material:'cool'},
  ],
  environment:{lower:[0,0,0],upper:[0,0,0]},
  sun:{direction:[0,0,1],radiance:[0,0,0]},
  volumes:[{bounds:{min:[-3,-3,.5],max:[3,3,1.5]},extinction:.65,albedo:[0,0,0]}],
  sample({frame}){
    const x=frame*.125;
    return {camera:{projection:'orthographic',position:[x,0,3],target:[x,0,0],near:.05,far:6,viewHeight:1}};
  }
},{samples:4,maxBounces:0,denoise:${denoise==='temporal'?'{levels:3,colorSigma:4,temporal:true}':denoise?'{levels:3,colorSigma:4}':'false'}}));
export default <Composition width={64} height={32} fps={24} durationInFrames={3}>
 <Stage id="path" factory={picture}/><Layer source={ref('path')}/>
</Composition>;`);
    const build = await buildProject(entry);
    const renderer = await Renderer.create(build,{nativeGpu:{
      executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
    }});
    try {
      const frames = [];
      for (const frame of frameOrder) frames.push(pixelsFromSurface(await renderer.renderNativeSurface(frame)));
      assert.deepEqual(frames[0],frames[3]);
      results.push(frames);
    } finally { await renderer.close(); }
  }
  const tau = Math.exp(-.65);
  const errors = [0,0,0];
  const temporalEdges=[0,0];
  const edgeChannel = [0,0];
  for (let step=0; step<3; step++) {
    const boundary = 32 - frameOrder[step]*4;
    for (let y=0;y<32;y++) for (let x=0;x<64;x++) {
      const offset = (y*64+x)*4;
      const expected = (x<boundary?[2,3,7]:[7,2,1]).map(v=>v*tau);
      for (let variant=0;variant<3;variant++) {
        const image = results[variant][step];
        for (let c=0;c<3;c++) errors[variant]+=(image[offset+c]-expected[c])**2;
        assert.equal(image[offset+3],1);
      }
      if(x===boundary-1 || x===boundary) {
        edgeChannel[Number(x===boundary)] += results[1][step][offset];
        temporalEdges[Number(x===boundary)] += results[2][step][offset];
      }
    }
  }
  const rmse = errors.map(value=>Math.sqrt(value/(3*64*32*3)));
  const edge = edgeChannel.map(value=>value/(32*3));
  const temporalBoundary=temporalEdges.map(value=>value/(32*3));
  console.log(JSON.stringify({rawRmse:rmse[0],filteredRmse:rmse[1],temporalRmse:rmse[2],boundaryR:edge,temporalBoundaryR:temporalBoundary}));
  assert.ok(rmse[1]<rmse[0]*.55,JSON.stringify(rmse));
  assert.ok(edge[1]-edge[0]>2.1,JSON.stringify(edge));
  assert.ok(rmse[2]<rmse[1]*.92,JSON.stringify(rmse));
  assert.ok(temporalBoundary[1]-temporalBoundary[0]>2.1,JSON.stringify(temporalBoundary));
});
