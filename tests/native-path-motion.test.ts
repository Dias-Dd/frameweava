import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {previousPathContext} from '../modules/native-gpu/path-motion.ts';
import type {FrameContext} from '../src/core/types.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';

test('motion contexts preserve affine Stage time, including reverse and fractional rates',()=>{
  const context:FrameContext={frame:8.5,globalFrame:5,time:8.5/24,globalTime:5/24,dt:-.5/24,
    progress:.5,durationInFrames:11,fps:{num:24,den:1},seed:123};
  assert.deepEqual(previousPathContext(context),{
    ...context,frame:9,globalFrame:4,time:9/24,globalTime:4/24,progress:.4,
  });
  assert.equal(previousPathContext({...context,progress:0}),undefined);
  assert.equal(previousPathContext({...context,globalFrame:0}),undefined);
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('motion follows camera, parent transforms and GPU deformation, independent of render order',{
  skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
  const root=resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'motion-')),entry=join(dir,'project.tsx');
  await writeFile(entry,`
import {Composition,Layer,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type NativeScene3D,type SceneTransform} from '@frameweave/engine/native';
const pose=(x:number,y=0):SceneTransform=>[1,0,0,x,0,1,0,y,0,0,1,0];
const positions:[number,number,number][]=[[-.45,-.4,.1],[.45,-.4,.1],[0,.5,.1]];
export const shot=defineNativeStage(async init=>{
 const deform=await init.gpu.compileCompute({abiVersion:1,id:'test/motion/deform',version:'1.0.0',
  bindings:[{type:'f32',access:'read_write'}],parameterWords:1,workgroupSize:[1,1,1],
  code:'fn compute(p:vec3u,l:vec3u,g:vec3u){store0(p.x*3u+1u,load0(p.x*3u+1u)+paramF32(0u));}'});
 const scene:NativeScene3D={
  geometries:{
   rigid:{restPositions:positions,indices:[0,1,2]},
   dynamic:{deformedNormals:true,uvTopology:{indices:[0,1,2],vertexCount:3},async gpu(c,a){
    const positions=a.buffer(await init.gpu.createField({type:'f32',dimensions:[3,1,1],components:3,
      semantic:'position',space:'world',units:'meter'},Float32Array.of(-.45,-.4,.1,.45,-.4,.1,0,.5,.1)));
    const normals=a.buffer(await init.gpu.createBuffer({type:'f32',length:9},Float32Array.of(0,0,1,0,0,1,0,0,1)));
    await init.gpu.dispatch(deform,[positions],{workItems:[3,1,1],parameters:Float32Array.of(c.frame*.1)});
    return {positions,normals};
   }},
  },
  materials:{paint:{kind:'emissive',radiance:[2,1,.5]}},
  nodes:[{id:'parent'}, {id:'rigid',parent:'parent',geometry:'rigid',material:'paint'},
   {id:'deformed',geometry:'dynamic',material:'paint',transform:pose(.9)}],
  sample(c){const x=.1*c.frame;return {
   camera:{projection:'orthographic',position:[x,0,4],target:[x,0,0],near:.1,far:10,viewHeight:2},
   transforms:{parent:pose(-.8+.2*c.frame)}
  };}
 };
 return createNativePathTracer(init,scene,{aovs:true,motionVectors:true,samples:2,maxBounces:0});
});
export default <Composition width={80} height={40} fps={24} durationInFrames={3}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  try {
    const render=async(frame:number)=>{
      const ticket=await renderer.submitNativeFrame(frame);
      await ticket.completed;
      return (await renderer.exportNativeBuffer(ticket,'shot/path-motion')).values as Float32Array;
    };
    const samples=new Map<number,Float32Array>();
    for(const frame of [2,0,1,2]) {
      const motion=await render(frame);
      if(samples.has(frame))assert.deepEqual(motion,samples.get(frame));
      samples.set(frame,motion);
      if(!frame){assert.ok(motion.every(value=>value===0));continue;}
      for(const [x,dx,dy] of [[26,-2,0],[56,2,2]]) {
        const value=motion.slice((20*80+x)*4,(20*80+x)*4+4);
        assert.ok(Math.abs(value[0]-dx)<2e-5 && Math.abs(value[1]-dy)<2e-5 &&
          Math.abs(value[2]-3.8)<2e-5 && value[3]===1,JSON.stringify({frame,x,actual:[...value],expected:[dx,dy,3.8,1]}));
      }
    }
    console.log(JSON.stringify({project:entry,rigidPixelsPerFrame:[-2,0],deformedPixelsPerFrame:[2,2],repeat:'byte-identical'}));
  }finally{await renderer.close();}
});
