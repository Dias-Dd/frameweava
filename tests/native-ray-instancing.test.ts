import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;

test('1024 animated ray instances share BLAS while preserving materials and reflected transforms', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const entry = join(await mkdtemp(join(root,'instances-')),'project.tsx');
  await writeFile(entry,`
import {SphereGeometry} from 'three';
import {Composition,Layer,Stage,ref} from '@frameweave/engine';
import {createNativeScene,defineNativeStage,type SceneNode,type SceneTransform} from '@frameweave/engine/native';
const sphere=new SphereGeometry(.32,24,16);
const p=sphere.getAttribute('position');
const shape={
  restPositions:Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)] as [number,number,number]),
  indices:Array.from(sphere.index!.array),
};
sphere.dispose();
const transform=(i:number,offset:number):SceneTransform=>[
 i%2===0?1:-1,0,0,i%32+.5-16+offset, 0,1,0,16-Math.floor(i/32)-.5, 0,0,1,0
];
const nodes:SceneNode[]=Array.from({length:1024},(_,i)=>({id:'s'+i,geometry:'sphere',
  material:i%2===0?'red':'green',transform:transform(i,0)}));
export const shot=defineNativeStage(init=>createNativeScene(init,{
  geometries:{sphere:shape},
  materials:{red:{kind:'emissive',radiance:[3,0,0]},green:{kind:'emissive',radiance:[0,4,0]}},
  nodes, environment:{lower:[0,0,0],upper:[0,0,0]},
  sample({frame}){return {
    camera:{projection:'orthographic',position:[0,0,5],target:[0,0,0],near:.1,far:10,viewHeight:32},
    transforms:Object.fromEntries(nodes.map((node,i)=>[node.id,transform(i,frame/3)])),
  };},
}));
export default <Composition width={96} height={96} fps={24} durationInFrames={2}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  try{
    let first:Float32Array|undefined;
    for(const frame of [0,1,0]){
      const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
      if(frame===0){if(first)assert.deepEqual(pixels,first);first=pixels;}
      for(let i=0;i<1024;i++){
        const at=((Math.floor(i/32)*3+1)*96+(i%32)*3+1+frame)*4;
        assert.deepEqual(Array.from(pixels.slice(at,at+4)),i%2===0?[3,0,0,1]:[0,4,0,1]);
      }
    }
    const ray=(await renderer.nativeStats()).hardwareRayQuery;
    assert.equal(ray.residentInstances,1024);
    assert.equal(ray.residentBlas,1);
    assert.equal(ray.geometryBuilds,1);
    assert.equal(ray.tlasBuilds,3);
    assert.equal(ray.packedGeometryBytes,24*2*(16-1)*36);
    console.log(JSON.stringify(ray));
  }finally{await renderer.close();}
});
