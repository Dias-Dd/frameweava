import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {linear709} from '@frameweave/engine/native';
import {createNativeParticleRenderer} from '../../native.ts';
import {descriptor,validityDescriptor,camera} from '../../../spatial-fields/parameters.ts';
const view={projection:'orthographic' as const,position:[0,0,5] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:20,viewHeight:2};
export const proof=defineNativeStage(init=>{
 const draw=createNativeParticleRenderer(init.gpu,{width:init.width,height:init.height,camera:view}),half=createNativeParticleRenderer(init.gpu,{width:init.width,height:init.height,camera:view,format:'rgba16float'});
 return {async renderAt(c){
  const oracle=c.frame===1||c.frame===3||c.frame===7;
  if(oracle){const soft=c.frame===3,zero=c.frame===7,kernel=await init.gpu.compile({abiVersion:1,id:'frameweave/particle-proof/oracle',version:'1.0.0',inputCount:0,parameterWords:2,code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+vec2f(.5))/vec2f(outputSize());let covered=length(uv-vec2f(.5))<.065;if(!covered||paramU32(1u)==1u){return vec4f(0.);}if(paramU32(0u)==1u){return vec4f(.25,0.,1.,.625);}return vec4f(.5,0.,1.,.75);}'});return init.gpu.run(kernel,[],{parameters:Uint32Array.of(Number(soft),Number(zero)),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});}
  const near={id:0,birthTime:0,lifetime:10,radius:.2,position:[0,0,1] as [number,number,number],velocity:[0,0,0] as [number,number,number],trail:[],ink:[0,0,2] as [number,number,number],opacity:.5},far={...near,id:1,position:[0,0,0] as [number,number,number],ink:[2,0,0] as [number,number,number]};
  const frame={frame:c.frame,time:c.time,fps:c.fps,seed:c.seed,step:c.frame,contacts:[],emitted:2,particles:c.frame===9?[{...far,ink:[-1,8,2] as [number,number,number]}]:c.frame===4?[far,near]:[near,far],appearanceColor:linear709};
  const fields=c.frame===2||c.frame===5||c.frame===6;if(!fields)return (c.frame===8?half:draw).render(frame,c,{fadeWithAge:false});
  const dims=[init.width,init.height,1] as const,depth=await init.gpu.createField(descriptor('axial-depth',dims,c,{camera:camera(view,init.width,init.height).key}),new Float32Array(init.width*init.height).fill(c.frame===6?3:5.125)),validity=await init.gpu.createField(validityDescriptor(dims,c),new Float32Array(init.width*init.height).fill(c.frame===5?0:1));
  try{return await draw.render(frame,c,{fadeWithAge:false},{depth:{data:depth,validity},softDistance:.25});}finally{await init.gpu.releaseBuffer(depth);await init.gpu.releaseBuffer(validity);}
 },dispose(){draw.dispose();half.dispose();}};
});
export default Composition({width:64,height:64,fps:24,durationInFrames:10,background:'transparent',children:[Stage({id:'proof',factory:proof,outputs:{surface:'surface'}}),Layer({source:ref('proof')})]});
