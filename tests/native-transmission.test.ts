import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface,linear709,surfaceFromPixels} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('thin PBR transmission preserves tint, fractional/data-map transmission, metal and Alpha with deterministic GPU paths',{
  skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
  const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'transmission-'));
  await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(3,1,Float32Array.of(0,1,1,1,.25,0,0,1,1,0,0,1),{color:linear709,alpha:'straight',format:'rgba32float'})));
  const entry=join(dir,'project.tsx');
  await writeFile(entry,`
import {Composition,Layer,Stage,Resource,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
const plane={restPositions:[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]] as [number,number,number][],indices:[0,1,2,0,2,3],texCoords:[[0,0],[1,0],[1,1],[0,1]] as [number,number][]};
const glass={kind:'pbr' as const,color:[.5,.8,1] as [number,number,number],metallic:0,roughness:0,transmission:1,ior:1};
const variants=[glass,{...glass,transmission:0},{...glass,metallic:1},{...glass,ior:1.5},{...glass,ior:1.5,transmission:.25},{...glass,transmissionMap:'zero'},{...glass,transmissionMap:'quarter'},{...glass,transmissionMap:'one'},{...glass,ior:1.5,roughness:.4},{...glass,opacity:0,alphaMode:'mask' as const}];
export const shot=defineNativeStage(async init=>{
 const paths=await Promise.all(variants.map(glass=>{
  const scene:NativeScene3D={geometries:{plane},materials:{glass,back:{kind:'emissive',radiance:[2,3,4]}},
   nodes:[{id:'glass',geometry:'plane',material:'glass'},{id:'back',geometry:'plane',material:'back',transform:[1,0,0,0,0,1,0,0,0,0,1,-1]}],
   environment:{lower:[0,0,0],upper:[0,0,0]},sun:{direction:[0,0,1],radiance:[0,0,0]},
   textureAtlas:{resource:'atlas',width:3,height:1,decode:'surface-v2',regions:{zero:{x:0,y:0,width:1,height:1},quarter:{x:1,y:0,width:1,height:1},one:{x:2,y:0,width:1,height:1}}},
   sample(){return {camera:{projection:'orthographic',position:[0,0,3],target:[0,0,0],near:.01,far:10,viewHeight:.5}};}};
  return createNativePathTracer(init,scene,{samples:256,maxBounces:2});
 }));
 return {renderAt(c){return paths[c.frame].renderAt(c,{},{});},async dispose(){for(const p of paths)await p.dispose?.();}};
});
export default <Composition width={8} height={4} fps={24} durationInFrames={10}><Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/></Composition>;
`);
  const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:resolve(executable!),rayQuery:true,slots:1,dynamic:'throughput',readback:'final-surface'}});
  try{
    const values=new Map<number,Float32Array>();
    for(const frame of [0,1,2,3,4,5,6,7,8,9,0,8]){
      const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));assert.ok(pixels.every(Number.isFinite));
      if(values.has(frame))assert.deepEqual(pixels,values.get(frame));values.set(frame,pixels);
      for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],1);
    }
    const means=(frame:number)=>[0,1,2].map(c=>values.get(frame)!.filter((_,i)=>i%4===c).reduce((s,v)=>s+v,0)/32);
    for(const frame of [0,7])means(frame).forEach((v,c)=>assert.ok(Math.abs(v-[1,2.4,4][c])<1e-5,JSON.stringify({frame,v,c})));
    for(const frame of [1,2,5])assert.ok(means(frame).every(v=>Math.abs(v)<1e-6),JSON.stringify({frame,means:means(frame)}));
    for(const [frame,factor] of [[3,.96],[4,.24],[6,.25]] as const)means(frame).forEach((v,c)=>assert.ok(Math.abs(v-factor*[1,2.4,4][c])<.1,JSON.stringify({frame,v,c})));
    assert.ok(means(8).every(v=>v>0&&v<4.2));
    means(9).forEach((v,c)=>assert.ok(Math.abs(v-[2,3,4][c])<1e-5));
  }finally{await renderer.close();}
});
