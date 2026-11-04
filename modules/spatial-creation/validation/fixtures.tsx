import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {ribbonScene,silkRibbon,particles,particleBurst,particleFountain,particleRain,vortexParticles,noiseTexture,characterMotion,puppetCard,rigidScene,ropeScene,clothScene,orbitalScene,crystalScene,emberScene,lagoonScene,retainedPost,ownedPost} from 'spatial-creation-candidate';
import {createNativeImageEffects} from '../../native-effects/images.ts';
import {createPostChain} from '../lifecycle.ts';
import {linear709,surfaceFromPixels} from '../../../src/media/surface.ts';
import type {MeshData,SkeletonData} from '@frameweave/engine/graphics-contracts';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] as any;
const mesh:MeshData={schema:'frameweave.mesh',version:1,id:'card',coordinates:{spaceId:'card.local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:['a','b','c','d'],restPositions:[[-.65,-.65,0],[.65,-.65,0],[.65,.65,0],[-.65,.65,0]],indices:[0,1,2,0,2,3],uvOrigin:'top-left',uv:[[0,1],[1,1],[1,0],[0,0]]};
const skeleton:SkeletonData={schema:'frameweave.skeleton',version:1,id:'rig',meshId:'card',coordinates:mesh.coordinates,bones:[{id:'root',parentId:null,bindMatrix:identity,inverseBindMatrix:identity}],weights:mesh.vertexIds.map(vertexId=>({vertexId,influences:[{boneId:'root',weight:1}]}))};
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,managed=createNativeImageEffects(init);
 // Calls are ordinary named R1 constructor calls, not private-loader bypasses.
 const objects=await Promise.all([
  ribbonScene({ribbon:{segments:24}}),silkRibbon({segments:24}),particles(),particleBurst(),particleFountain(),particleRain(),vortexParticles(),noiseTexture(),
  characterMotion({asset:{mesh,skeleton},controls:{deltas:[{bone:'root',rotation:[0,0,keyframes([{frame:0,value:0},{frame:100,value:.4}])]}]}}),
  puppetCard({mesh,textureInput:'image',pins:{a:[-.65,-.65],b:[.65,-.65],c:[keyframes([{frame:0,value:.65},{frame:100,value:.9}]),.65]},constraints:{foldovers:'reject'}}),
  rigidScene(),ropeScene({radialSegments:4}),clothScene({mesh,simulation:{fixedVertices:['c','d']}}),orbitalScene({steps:32}),crystalScene({steps:32,glow:false}),emberScene({steps:32}),lagoonScene({steps:32}),
 ]);
 return {async renderAt(c){const mode=c.frame%17,owned=[] as any[];try{
  const texture=await g.upload(surfaceFromPixels(2,2,[3,.5,.2,.5, 1,2,.2,1, 0,2,1,0, 2,.3,3,.75],{format:'rgba32float',alpha:'straight',color:linear709}));owned.push(texture);
  let image=await objects[mode].renderAt(c,{image:texture},{});owned.push(image);
  // Real retained processor: first result is revoked on the next invocation.
  const safe=createPostChain(init,[retainedPost((input,ctx)=>managed.processImage(input,async(i,f)=>f.brightnessContrast(i,{brightness:.1}),{context:ctx})),retainedPost((input,ctx)=>managed.processImage(input,async(i,f)=>f.vignette(i,{amount:.2}),{context:ctx})),ownedPost(input=>input)]);
  const result=await safe(image,c);if(result!==image)owned.push(result);
  const buffer=await g.imageToBuffer!(result,{version:1});try{await g.publishBuffer('rgba',buffer,{version:1});}finally{await g.releaseBuffer(buffer);}
  const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.frame,c.time,g.stats().activeImages));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}
  owned.splice(owned.indexOf(result),1);return result;
 }finally{for(const image of owned)await g.release(image);}},async dispose(){for(const o of objects)await o.dispose?.();await managed.dispose();}};
});
export default Composition({id:'spatial-creation-verify',width:64,height:48,fps:24,durationInFrames:101,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
