import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {Matrix4} from 'three';import {linear709,surfaceFromPixels} from '../../../../src/media/surface.ts';import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createSkeletonRig,createNativeMeshRenderer,createNativeInstancedMeshRenderer,createNativeSkinnedRenderer,createSurfaceSampler,createTrailGeometry,createLightningGeometry,createIsosurfaceGeometry} from '../../../skeletal-effects/native.ts';
import {createNativePuppetRenderer,createNativeCharacterRenderer,createCharacterRig} from '../../../puppet-effects/native.ts';import {createNativeParticleRenderer,createImageEmitter,type ParticleFrame} from '../../native.ts';
import type {MeshData,SkeletonData} from '../../../skeletal-effects/src/types.ts';
export const camera={projection:'orthographic' as const,position:[0,0,5] as [number,number,number],target:[0,0,0] as [number,number,number],near:.1,far:20,viewHeight:2};
export const mesh:MeshData={schema:'frameweave.mesh',version:1,id:'quad',coordinates:{spaceId:'quad.local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:['a','b','c','d'],restPositions:[[-.75,-.75,0],[.75,-.75,0],[.75,.75,0],[-.75,.75,0]],indices:[0,1,2,0,2,3],uvOrigin:'top-left',uv:[[0,1],[1,1],[1,0],[0,0]]};
export const texels=[4,-1,2,.25,2,.5,-.5,0, .5,2,4,.75, 1,1,1,1, 1,3,2,1, 2,-.5,1,.5, .5,.25,3,.25, 0,2,1,.5];
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,options={width:init.width,height:init.height},skeleton:SkeletonData={schema:'frameweave.skeleton',version:1,id:'root-rig',coordinates:structuredClone(mesh.coordinates),meshId:mesh.id,bones:[{id:'root',parentId:null,bindMatrix:new Matrix4().toArray(),inverseBindMatrix:new Matrix4().toArray()}],weights:mesh.vertexIds.map(vertexId=>({vertexId,influences:[{boneId:'root',weight:1}]}))};
 const rig=await createSkeletonRig(mesh,skeleton),skin=await createNativeSkinnedRenderer(g,rig,options),unlit=await createNativeMeshRenderer(g,[mesh],{...options,shading:'unlit'}),standard=await createNativeMeshRenderer(g,[mesh],{...options,shading:'standard'}),instances=await createNativeInstancedMeshRenderer(g,[{mesh,capacity:3}],{...options,shading:'unlit'}),puppet=await createNativePuppetRenderer(g,mesh,{...options,bounds:{left:-1.5,right:1.5,bottom:-1,top:1}}),particles=createNativeParticleRenderer(g,{...options,camera});
 const character=createCharacterRig({mesh,skeleton}),texturedCharacter=await createNativeCharacterRenderer(g,{mesh,skeleton},{...options,camera,texture:'borrowed',color:[1,1,1,1]});
 // These are the existing CPU control/geometry implementations running in
 // SpiderMonkey. They do not rasterize images or request another GPU device.
 const sampler=await createSurfaceSampler(mesh),trail=createTrailGeometry({id:'trail',pointCount:3,radialSegments:4}),lightning=createLightningGeometry({id:'bolt',subdivisions:2,branchGenerations:0,radialSegments:4}),iso=createIsosurfaceGeometry({id:'iso',cells:[2,2,2],triangleCapacity:48});
 const source=surfaceFromPixels(4,2,texels,{color:linear709,alpha:'straight',format:'rgba32float'}),emitter=createImageEmitter(source,{id:'image',bounds:{left:-1,right:1,bottom:-1,top:1},sampling:'center'});
 return {async renderAt(c){return withGpuResources(g,async a=>{
  let image;const mode=c.frame%12,appearance={color:[4,.5,.25] as [number,number,number],opacity:.375};
  if(mode===0)image=await unlit.render({context:c,camera,objects:[{id:mesh.id,appearance}]});
  else if(mode===1)image=await standard.render({context:c,camera,objects:[{id:mesh.id,appearance:{...appearance,color:[.8,.5,.25],roughness:.5,metalness:.25}}],lighting:{ambient:[.1,.2,.3],directional:[{direction:[0,0,1],color:[1,.8,.5],intensity:2}]}});
  else if(mode===2)image=await instances.render({context:c,camera,objects:[{id:mesh.id,appearance,instances:{count:2,positions:Float64Array.of(-.55,0,0,.55,0,.25),uniformScale:[.5,.5,.5],colors:Float32Array.of(1,.5,1,.25,1,2)}}]});
  else if(mode===3){const pose=rig.sample(c,{deltas:[{bone:'root',translation:[.125,0,0],rotation:[0,0,.1]}]});await skin.publishPositions(pose,'positions');image=await skin.render(pose,{camera,ink:[4,.5,.25],opacity:.375});}
  else {const texture=a.image(await g.upload(source));
   if(mode===11)image=await texturedCharacter.render(character.sample(c),{texture,sampling:'linear',boundary:'zero'});
   else if(mode===4||mode===5)image=await puppet.render(mesh.restPositions,texture,{sampling:mode===4?'linear':'nearest',boundary:'zero',format:mode===5?'rgba16float':'rgba32float'});
   else {const frame:ParticleFrame={frame:c.frame,time:c.time,fps:c.fps,seed:1,step:0,contacts:[],emitted:1,particles:[{id:0,birthTime:0,lifetime:100,radius:.65,position:[0,0,0],velocity:[0,0,0],trail:[]}]};image=await particles.render(frame,c,{ink:[1,1,1],fadeWithAge:false,spriteFrame:mode===7?.5:mode===9?1:0,rotation:mode===8?Math.PI/4:0},{spriteAtlas:{source:texture,columns:2,rows:1,count:2,sampling:mode===6?'nearest':'linear',boundary:mode===10?'clamp':'zero',frameBlending:true}});}
  }
  const samples=sampler.sample(3,{seed:17}),tube=trail.sample({points:[[-1,0,0],[0,.5,0],[1,0,0]],context:c}),bolt=lightning.sample({start:[-1,0,0],end:[1,0,0],context:c}),field=iso.sampleMetaballs({balls:[{center:[0,0,0],radius:1.5}],context:c}),emission=emitter.sample(17,0);
  const controls=a.buffer(await g.createBuffer({type:'f32',length:8},Float32Array.of(samples.count,tube.stations,bolt.bolts.length,field.triangleCount,...emission.position,emission.opacity??1)));await g.publishBuffer('controls',controls,{version:1});
  a.image(image);const view=a.buffer(await g.imageToBuffer!(image,{version:1}));await g.publishBuffer('rgba',view,{version:1});return a.keep(image);
 });},async dispose(){await Promise.all([skin.dispose(),unlit.dispose(),standard.dispose(),instances.dispose(),puppet.dispose(),texturedCharacter.dispose()]);character.dispose();particles.dispose();rig.dispose();sampler.dispose();trail.dispose();lightning.dispose();iso.dispose();emitter.dispose();}};
});
export default Composition({id:'native-final-visual',width:96,height:64,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
