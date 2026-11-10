import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;

test('emitter sampling and MIS match the finite-area integral and honor animated blockers', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'emitter-')),entry=join(dir,'project.tsx');
  await writeFile(join(dir,'emission.json'),JSON.stringify(surfaceFromPixels(1,1,[2,.5,.25,1],{color:linear709,alpha:'straight',format:'rgba32float'})));
  await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type NativeScene3D,type SceneTransform} from '@frameweave/engine/native';
const pose=(x:number,z:number,scale=1):SceneTransform=>[scale,0,0,x,0,scale,0,0,0,0,1,z];
const scene:NativeScene3D={
  geometries:{quad:{restPositions:[[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]],indices:[0,1,2,0,2,3],texCoords:[[0,0],[1,0],[1,1],[0,1]]}},
  materials:{white:{kind:'diffuse',color:[1,1,1]},black:{kind:'diffuse',color:[0,0,0]},light:{kind:'emissive',radiance:[8,6,4]}},
  nodes:[
    {id:'receiver',geometry:'quad',material:'white',transform:pose(0,0,1)},
    {id:'emitter',geometry:'quad',material:'light',transform:pose(1.5,2)},
    {id:'occluder',geometry:'quad',material:'black',transform:pose(-20,1)},
    {id:'behind-light',geometry:'quad',material:'black',transform:pose(2.25,3)},
  ],
  environment:{lower:[0,0,0],upper:[0,0,0]},
  sun:{direction:[0,0,1],radiance:[0,0,0]},
  sample({frame}){
    return {camera:{projection:'orthographic',position:[0,0,4],target:[0,0,0],near:.05,far:8,viewHeight:.001},
     transforms:{occluder:pose(frame%4===3?.75:-20,1,.66)}};
  },
};
export const picture=defineNativeStage(async init=>{
  const pbr:NativeScene3D={...scene,materials:{...scene.materials,light:{kind:'pbr',color:[.1,.2,.3],roughness:.9,emission:[8,6,4],emissionMap:'map'}},
   textureAtlas:{resource:'emission',width:1,height:1,decode:'surface-v2',regions:{map:{x:0,y:0,width:1,height:1}}}};
  const methods=await Promise.all([
    createNativePathTracer(init,scene,{samples:8,maxBounces:1}),
    createNativePathTracer(init,scene,{samples:8,maxBounces:0,lightSampling:'mis'}),
    createNativePathTracer(init,scene,{samples:8,maxBounces:1,lightSampling:'mis'}),
    createNativePathTracer(init,pbr,{samples:8,maxBounces:1}),
    createNativePathTracer(init,pbr,{samples:8,maxBounces:0,lightSampling:'mis'}),
    createNativePathTracer(init,pbr,{samples:8,maxBounces:1,lightSampling:'mis'}),
  ]);
  return {renderAt(c){return methods[Math.min(c.frame%4,2)+(c.frame>=4?3:0)].renderAt(c,{},{});},
    dispose:async()=>{for(const method of methods) await method.dispose?.();}};
});
export default <Composition width={64} height={64} fps={24} durationInFrames={8}>
 <Resource id="emission" src="./emission.json" kind="file"/>
 <Stage id="path" factory={picture}/><Layer source={ref('path')}/>
</Composition>;`);
  const build = await buildProject(entry);
  const renderer = await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  let integral=0;
  for(let y=0;y<200;y++) for(let x=0;x<200;x++){
    const a=1+(x+.5)/200,b=-.5+(y+.5)/200;
    integral+=4/((a*a+b*b+4)**2)/Math.PI/40000;
  }
  const expected=8*integral;
  const rmse=new Map<number,number>();
  let first:Float32Array|undefined;
  try{
    for(const frame of [2,0,1,3,2,6,4,5,7,6]){
      const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
      let average=0,error=0;
      const target=frame%4===3?0:expected*(frame>=4?2:1);
      for(let i=0;i<pixels.length;i+=4){
        average+=pixels[i]/4096;
        error+=(pixels[i]-target)**2/4096;
        assert.equal(pixels[i+3],1);
      }
      console.log(JSON.stringify({frame,average,expected:target,rmse:Math.sqrt(error)}));
      assert.ok(Math.abs(average-target)<(frame%4===0?.035:.004)*(frame>=4?2:1));
      rmse.set(frame,Math.sqrt(error));
      if(frame===2){if(first)assert.deepEqual(pixels,first);first=pixels;}
    }
    assert.ok(rmse.get(2)!<rmse.get(0)!*.35);
    assert.ok(rmse.get(6)!<rmse.get(4)!*.35);
  }finally{await renderer.close();}
});
