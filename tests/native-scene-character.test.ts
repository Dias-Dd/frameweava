import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('a real textured GLB uses the same GPU skin and morph in preview and path tracing', {
  skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
  const root=resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'character-')),entry=join(dir,'project.tsx');
  await promisify(execFile)(process.execPath,[
    '--import','tsx','modules/spatial-creation/scripts/import-character.ts',
    'modules/spatial-creation/examples/character-asset/greeting.glb','--output',dir,
  ]);
  const asset=JSON.parse(await readFile(join(dir,'model.character.json'),'utf8'));
  assert.equal(asset.clips[0].id,'greeting');
  assert.ok(asset.primitives.some((p:{skin?:unknown;morphs:unknown[];material:{texture?:unknown}})=>
    p.skin && p.morphs.length && p.material.texture));
  await writeFile(entry,`
import {Composition,Layer,Resource,Stage,keyframes,ref} from '@frameweave/engine';
import {attachNativeCharacter,createNativePathTracer,createNativeScene,defineNativeStage,
  type NativeScene3D} from '@frameweave/engine/native';
import character from './model.character.json';
const scene:NativeScene3D={
 geometries:{},materials:{},nodes:[],
 textureAtlas:{resource:'cloth',width:2,height:2,regions:{cloth:{x:0,y:0,width:2,height:2,wrap:'repeat'}}},
 environment:{lower:[.04,.05,.08],upper:[.08,.11,.15]},
 sun:{direction:[-1,1,2],radiance:[3,3,3]},
 sample(){return {camera:{projection:'orthographic',position:[2,1,6],target:[0,-.05,0],near:.01,far:30,viewHeight:2.7}};}
};
export const shot=defineNativeStage(async init=>{
 const actor=await attachNativeCharacter(init,scene,character,{
  id:'actor',controls:{clips:[{clip:'greeting',time:keyframes([0,.36,.72,0,.36,.72].map((value,frame)=>({frame,value})))}]},textures:{image0:'cloth'},
 });
 const preview=await createNativeScene(init,actor.scene);
 const trace=await createNativePathTracer(init,actor.scene,{samples:8,maxBounces:2,denoise:true,aovs:true,motionVectors:true});
 return {renderAt(c){return (c.frame<3?preview:trace).renderAt(c, {}, {});},
  async dispose(){try{await preview.dispose?.();await trace.dispose?.();}finally{await actor.dispose();}}};
});
export default <Composition width={128} height={72} fps={24} durationInFrames={6}>
 <Resource id="cloth" src="./image0.png" kind="image"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  console.log(JSON.stringify({project:entry,nodes:asset.nodes.length,primitives:asset.primitives.length}));
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  try {
    const frame=async(n:number)=>pixelsFromSurface(await renderer.renderNativeSurface(n));
    const difference=(a:Float32Array,b:Float32Array)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length;
    const frames=new Map<number,Float32Array>();
    for(const n of [4,0,3,1,2,5])frames.set(n,await frame(n));
    const a=frames.get(0)!,b=frames.get(1)!,c=frames.get(3)!,d=frames.get(4)!;
    assert.deepEqual(await frame(0),a);
    assert.deepEqual(await frame(4),d);
    const ticket=await renderer.submitNativeFrame(4);
    await ticket.completed;
    const motion=(await renderer.exportNativeBuffer(ticket,'shot/path-motion')).values as Float32Array;
    let valid=0,moving=0;
    for(let i=0;i<motion.length;i+=4) {
      if(!motion[i+3])continue;
      valid++;
      if(Math.hypot(motion[i],motion[i+1])>.1)moving++;
    }
    assert.ok(valid>700 && moving>200,JSON.stringify({valid,moving}));
    console.log(JSON.stringify({previewMotion:difference(a,b),pathMotion:difference(c,d),rendererDifference:difference(a,c)}));
    assert.ok(difference(a,b)>.004 && difference(c,d)>.004);
    assert.ok(difference(a,c)<.1,'both renderers must show the same placement');
    assert.ok([...a,...c].every(Number.isFinite));
    assert.ok(a.some((value,i)=>i%4!==3&&value>.2)&&c.some((value,i)=>i%4!==3&&value>.2));
  } finally {await renderer.close();}
});
