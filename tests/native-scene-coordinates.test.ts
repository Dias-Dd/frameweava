import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

function expectedPbr(normal:number[]) {
 const inv=Math.SQRT1_2,light=[inv,0,inv],view=[0,0,1],h=[Math.sin(Math.PI/8),0,Math.cos(Math.PI/8)];
 const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
 const nv=dot(normal,view),nl=dot(normal,light),nh=dot(normal,h),vh=dot(view,h),rough=.2,metal=.5;
 const a2=rough**4,k=1-nh*nh+a2*nh*nh,mask=(c:number)=>2*c/(c+Math.sqrt(a2+(1-a2)*c*c));
 const dielectric=.04+(1-.04)*(1-vh)**5;
 return [.1,.6,.4].map((c,i)=>{
  const baseF0=.04*(1-metal)+c*metal,f=baseF0+(1-baseF0)*(1-vh)**5;
  return c*(1-metal)*(1-dielectric)*nl+f*a2*mask(nv)*mask(nl)/(4*nv*k*k)+[0,.6,.3][i];
 });
}
const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('independent material UV streams and per-instance tangent rotations agree with an analytic PBR reference',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');
 await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'coordinates-')),entry=join(dir,'project.tsx');
 const texels=[1,.5,.25,1, .5,1,.5,1, 0,.25,1,1, 0,.75,.5,1, 2,0,1,1, 0,3,1,1, .75,.5,1,1];
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(7,1,texels,{color:linear709,format:'rgba32float',alpha:'straight'})));
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,createNativeScene,defineNativeStage,type SceneMaterial,type NativeScene3D} from '@frameweave/engine/native';
const coords=[[0,0],[1,0],[1,1],[0,1]] as [number,number][];
const material:SceneMaterial={kind:'pbr',color:[.2,.6,.8],metallic:.5,roughness:.8,emission:[.1,.2,.3],
 colorMap:'color',metallicRoughnessMap:'parameters',emissionMap:'emission',normalMap:'normal',
 coordinates:{color:{scale:[0,0],offset:[.75,.5]},roughness:{set:'other',scale:[0,0],offset:[.25,.5]},
  emission:{set:'other',scale:[0,0],offset:[.75,.5]}}};
const scene:NativeScene3D={
 geometries:{q:{restPositions:[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],indices:[0,1,2,0,2,3],
  texCoords:coords,texCoordSets:{other:coords.map(([u,v])=>[u*2,v])}}},
 materials:{first:material,rotated:{...material,coordinates:{...material.coordinates,normal:{rotation:Math.PI/2}}}},
 nodes:[{id:'first',geometry:'q',material:'first'},
  {id:'rotated',geometry:'q',material:'rotated',transform:[1,0,0,4,0,1,0,0,0,0,1,0]}],
 textureAtlas:{resource:'atlas',width:7,height:1,decode:'surface-v2',regions:{
  color:{x:0,y:0,width:2,height:1,filter:'nearest'},parameters:{x:2,y:0,width:2,height:1,filter:'nearest'},
  emission:{x:4,y:0,width:2,height:1,filter:'nearest'},normal:{x:6,y:0,width:1,height:1}}},
 environment:{lower:[0,0,0],upper:[0,0,0]},sun:{direction:[1,0,1],radiance:[Math.PI,Math.PI,Math.PI]},
 sample(c){const x=c.frame%2*4;return {camera:{
  projection:'orthographic',position:[x,0,3],target:[x,0,0],near:.1,far:10,viewHeight:.001}};}
};
export const shot=defineNativeStage(async init=>{
 const preview=await createNativeScene(init,scene);
 const path=await createNativePathTracer(init,scene,{samples:2,maxBounces:0});
 const deformed:NativeScene3D={...scene,geometries:{q:{
  deformedNormals:true,uvTopology:{indices:[0,1,2,0,2,3],vertexCount:4,texCoords:coords,texCoordSets:{other:coords}},
  async gpu(c,a){
   const positions=a.buffer(await init.gpu.createField({type:'f32',dimensions:[4,1,1],components:3,
    semantic:'position',space:'world',units:'meter'},Float32Array.of(-1,-1,0,1,-1,0,1,1,0,-1,1,0)));
   const normals=a.buffer(await init.gpu.createBuffer({type:'f32',length:12},Float32Array.of(0,0,1,0,0,1,0,0,1,0,0,1)));
   return {positions,normals};
  }
 }}};
 const dynamicPreview=await createNativeScene(init,deformed);
 const dynamicPath=await createNativePathTracer(init,deformed,{samples:2,maxBounces:0});
 const instances=[preview,path,dynamicPreview,dynamicPath];
 return {renderAt(c){return instances[Math.floor(c.frame/2)].renderAt(c,{},{});},
  dispose:async()=>{for(const instance of instances)await instance.dispose?.();}};
});
export default <Composition width={3} height={3} fps={24} durationInFrames={8}>
 <Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try{
  const sin=1/Math.sqrt(5),cos=2/Math.sqrt(5),expected=[expectedPbr([sin,0,cos]),expectedPbr([0,-sin,cos])];
  let maxRelativeError=0;
  for(const frame of [7,0,1,6,3,4,5,2]) {
   const actual=pixelsFromSurface(await renderer.renderNativeSurface(frame)).slice(16,19);
   // The CPU reference uses F64. A one-ULP normal/half-vector difference
   // is amplified by this narrow GGX lobe. Keep an explicit F32 relative bound.
   for(let c=0;c<3;c++)maxRelativeError=Math.max(maxRelativeError,
    Math.abs(actual[c]-expected[frame%2][c])/Math.max(1,Math.abs(expected[frame%2][c])));
   assert.ok(expected[frame%2].every((value,i)=>Math.abs(value-actual[i])<Math.max(3e-5,Math.abs(value)*6e-5)),
    JSON.stringify({frame,actual:[...actual],expected:expected[frame%2]}));
  }
  console.log(JSON.stringify({expected,sharedGeometry:true,independentChannels:4,maxRelativeError}));
 }finally{await renderer.close();}
});
