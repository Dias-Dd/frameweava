import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createFeedbackParticles,createNativeParticleRenderer} from '../../native.ts';
import {descriptor,validityDescriptor,camera} from '../../../spatial-fields/parameters.ts';
const view={projection:'orthographic' as const,position:[0,1,8] as [number,number,number],target:[0,1,0] as [number,number,number],near:.01,far:20,viewHeight:4};
export const particles=defineNativeStage(init=>{
 const simulation=createFeedbackParticles({fps:24,seed:55,substeps:4,rate:14,lifetime:.8,origin:[0,2.6,0],positionJitter:[.5,.1,.45],velocity:[0,-3,0],velocityJitter:[.8,.2,.3],radius:.055,forces:[{kind:'acceleration',value:[0,-8,0]}],colliders:[{id:'floor',kind:'plane',normal:[0,1,0],offset:0,restitution:.65}],trailPoints:9,
 subEmitters:[{id:'birth-halo',on:'birth',from:['root'],count:1,lifetime:.3,radius:.11,ink:[.2,.6,3],inheritVelocity:.3},{id:'impact-sparks',on:'collision',from:['root'],count:8,lifetime:.45,radius:.025,velocityJitter:[2.2,1.4,1.3],normalSpeed:2.2,inheritVelocity:.2,ink:[4,1,.1]},{id:'death-dust',on:'death',from:['root'],count:3,lifetime:.35,radius:.065,velocity:[0,.3,0],velocityJitter:[.4,.3,.6],inheritVelocity:0,ink:[1,.2,3]}]});
 const draw=createNativeParticleRenderer(init.gpu,{width:init.width,height:init.height,camera:view});
 return {async renderAt(c){
  // Actual geometric opaque sloped plane: positive axial depth, not RGBA ink.
  // Produced directly in resident buffers; no image-to-compute bridge involved.
  const dims=[init.width,init.height,1] as const,key=camera(view,init.width,init.height).key;
  const depth=await init.gpu.createField(descriptor('axial-depth',dims,c,{camera:key})),validity=await init.gpu.createField(validityDescriptor(dims,c));
  const field=await init.gpu.compileCompute({abiVersion:1,id:'frameweave/example/particle-occluder',version:'1.0.0',bindings:[{type:'f32',access:'read_write'},{type:'f32',access:'read_write'}],workgroupSize:[8,8,1],parameterWords:2,code:'fn compute(g:vec3u,l:vec3u,w:vec3u){let width=paramU32(0u);let height=paramU32(1u);let i=g.y*width+g.x;let u=(f32(g.x)+.5)/f32(width);let v=(f32(g.y)+.5)/f32(height);store0(i,7.5+1.5*u);store1(i,select(0.,1.,v>.42&&v<.92));}'});
  await init.gpu.dispatch(field,[depth,validity],{workItems:dims,parameters:Uint32Array.of(init.width,init.height)});
  try{return await draw.render(simulation.sample(c),c,{fadeWithAge:true,trailOpacity:.3,overLife:{radiusScale:[{age:0,value:.6},{age:.2,value:1.3},{age:1,value:.1}]}},{depth:{data:depth,validity},softDistance:.25});}
  finally{await init.gpu.releaseBuffer(depth);await init.gpu.releaseBuffer(validity);}
 },reset(){simulation.reset();},dispose(){draw.dispose();}};
});
export default Composition({id:'native-particle-creation',width:640,height:360,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'particles',factory:particles,seek:'fixed-step',outputs:{surface:'surface'}}),Layer({source:ref('particles')})]});
