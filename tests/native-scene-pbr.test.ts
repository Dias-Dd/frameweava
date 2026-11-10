import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {linear709,surfaceFromPixels,pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('preview and traced PBR agree with analytic G/B material maps; rough glass spreads transmission', {
  skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
  const root=resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'pbr-')),entry=join(dir,'project.tsx');
  await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(1,1,[0,.75,.5,1],{color:linear709,format:'rgba32float',alpha:'straight'})));
  await writeFile(entry,`
import {BoxGeometry} from 'three';
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,createNativeScene,defineNativeStage,type NativeScene3D,type SceneTransform,type SceneGeometry} from '@frameweave/engine/native';
const box=new BoxGeometry(),p=box.getAttribute('position'),uv=box.getAttribute('uv');
const mesh:SceneGeometry={restPositions:Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),indices:Array.from(box.index!.array),
 texCoords:Array.from({length:uv.count},(_,i)=>[uv.getX(i),1-uv.getY(i)])};
box.dispose();
const pose=(x:number,y:number,z:number,sx:number,sy:number,sz:number):SceneTransform=>[sx,0,0,x,0,sy,0,y,0,0,sz,z];
const camera=(x:number,height:number)=>({projection:'orthographic' as const,position:[x,0,4] as [number,number,number],target:[x,0,0] as [number,number,number],near:.1,far:12,viewHeight:height});
const darkness={lower:[0,0,0] as const,upper:[0,0,0] as const};
const material:NativeScene3D={
 geometries:{mesh},
 materials:{coat:{kind:'pbr',color:[.2,.6,.8],metallic:.5,roughness:.8,metallicRoughnessMap:'map',emission:[.1,.2,0]}},
 nodes:[{id:'coat',geometry:'mesh',material:'coat'}],
 textureAtlas:{resource:'atlas',decode:'surface-v2',width:1,height:1,regions:{map:{x:0,y:0,width:1,height:1}}},
 sun:{direction:[0,0,1],radiance:[Math.PI,Math.PI,Math.PI]},
 environment:darkness,sample(){return {camera:camera(0,.02)};}
};
const glass:NativeScene3D={
 geometries:{mesh},
 materials:{smooth:{kind:'dielectric',ior:1.5},rough:{kind:'dielectric',ior:1.5,roughness:.48},light:{kind:'emissive',radiance:[3,2,1]}},
 nodes:[{id:'smooth',geometry:'mesh',material:'smooth',transform:pose(0,0,0,4,4,.6)},
  {id:'rough',geometry:'mesh',material:'rough',transform:pose(10,0,0,4,4,.6)},
  {id:'strip-a',geometry:'mesh',material:'light',transform:pose(0,0,-2,.18,4,.08)},
  {id:'strip-b',geometry:'mesh',material:'light',transform:pose(10,0,-2,.18,4,.08)}],
 environment:darkness,sun:{direction:[0,0,1],radiance:[0,0,0]},
 sample({frame}){return {camera:camera(frame===2?0:10,.5)};}
};
export const shot=defineNativeStage(async init=>{
 const previews=await Promise.all([createNativeScene(init,material),createNativePathTracer(init,material,{samples:4,maxBounces:0}),
  createNativePathTracer(init,glass,{samples:64,maxBounces:3})]);
 return {renderAt(c){return previews[Math.min(c.frame,2)].renderAt(c,{},{});},
  dispose:async()=>{for(const item of previews)await item.dispose?.();}};
});
export default <Composition width={64} height={16} fps={24} durationInFrames={4}>
 <Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  try{
    const metal=.25,rough=.6;
    const expected=[.2,.6,.8].map((b,i)=>b*(1-metal)*.96+(.04*(1-metal)+b*metal)/(4*rough**4)+[.1,.2,0][i]);
    for(const frame of [1,0]){
      const p=pixelsFromSurface(await renderer.renderNativeSurface(frame));
      assert.ok(expected.every((v,c)=>Math.abs(p[c]-v)<2e-5),JSON.stringify({frame,actual:[...p.slice(0,4)],expected}));
    }
    const energy=async(frame:number)=>{
      const p=pixelsFromSurface(await renderer.renderNativeSurface(frame));
      const columns=Array(64).fill(0);
      for(let y=0;y<16;y++)for(let x=0;x<64;x++)columns[x]+=p[(y*64+x)*4]/16;
      return {center:(columns[31]+columns[32])/2,halo:columns.slice(37,52).reduce((a,b)=>a+b,0)};
    };
    const smooth=await energy(2),roughened=await energy(3);
    console.log(JSON.stringify({smooth,roughened}));
    assert.ok(smooth.center>2.5 && smooth.halo===0);
    assert.ok(roughened.center>0 && roughened.center<smooth.center*.65 && roughened.halo>1);
  }finally{await renderer.close();}
});
