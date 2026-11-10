import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {linear709,pixelsFromSurface,surfaceFromPixels} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;
test('shared shading uses normal maps and inverse-transpose vertex normals under nonuniform transforms', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root=resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'normal-'));
  const atlas=surfaceFromPixels(1,1,[.75,.5,(1+Math.sqrt(.75))/2,1],
    {color:linear709,format:'rgba32float',alpha:'straight'});
  await writeFile(join(dir,'normal.json'),JSON.stringify(atlas));
  const entry=join(dir,'project.tsx');
  await writeFile(entry,`
import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D,type SceneGeometry,type SceneTransform} from '@frameweave/engine/native';
const card={restPositions:[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],indices:[0,1,2,0,2,3],
 texCoords:[[0,1],[1,1],[1,0],[0,0]]} satisfies SceneGeometry;
const pose=(x:number,scale=1):SceneTransform=>[scale,0,0,x,0,1,0,0,0,0,1,0];
const scene:NativeScene3D={
 geometries:{card,smooth:{...card,normals:Array.from({length:4},()=>[.6,0,.8] as const)}},
 materials:{normal:{kind:'diffuse',color:[.8,.6,.4],normalMap:'normal',normalScale:.5},
   base:{kind:'diffuse',color:[.8,.6,.4]}},
 textureAtlas:{resource:'normal',decode:'surface-v2',width:1,height:1,regions:{normal:{x:0,y:0,width:1,height:1}}},
 nodes:[
  {id:'mapped',geometry:'card',material:'normal'},
  {id:'smooth',geometry:'smooth',material:'base',transform:pose(5,2)},
  {id:'flat',geometry:'card',material:'base',transform:pose(10)},
 ],
 environment:{lower:[0,0,0],upper:[0,0,0]},
 sun:{direction:[0,0,1],radiance:[Math.PI,Math.PI,Math.PI]},
 sample({frame}){
  const x=(frame%3)*5;
  return {camera:{projection:'orthographic',position:[x,0,3],target:[x,0,0],near:.05,far:6,viewHeight:.005}};
 },
};
export const shot=defineNativeStage(async init=>{
 const preview=await createNativeScene(init,scene);
 const path=await createNativePathTracer(init,scene,{samples:4,maxBounces:0});
 return {renderAt(c){return (c.frame<3?preview:path).renderAt(c,{},{});},
   dispose:async()=>{await preview.dispose?.();await path.dispose?.();}};
});
export default <Composition width={3} height={3} fps={24} durationInFrames={6}>
 <Resource id="normal" src="./normal.json" kind="file"/>
 <Stage id="normal" factory={shot}/><Layer source={ref('normal')}/>
</Composition>;`);
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  const factors=[Math.sqrt(.75)/Math.hypot(.25,Math.sqrt(.75)),.8/Math.hypot(.3,.8),1];
  try {
    for(const frame of [4,0,3,2,1,5,3]){
      const p=pixelsFromSurface(await renderer.renderNativeSurface(frame));
      const color=[.8,.6,.4].map(v=>v*factors[frame%3]);
      assert.ok(color.every((v,c)=>Math.abs(p[16+c]-v)<.00004),
        JSON.stringify({frame,actual:[...p.slice(16,20)],expected:color}));
      assert.equal(p[19],1);
    }
  }finally{await renderer.close();}
});
