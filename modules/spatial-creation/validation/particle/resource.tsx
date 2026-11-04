/** Raw diagnostic fixture; creator code only needs the particleField call. */
import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {particleField} from 'spatial-creation-candidate';
export const resource=defineNativeStage(async init=>{
 const objects=await Promise.all((['rgba32float','rgba16float'] as const).map(format=>particleField({format,initialCount:24,rate:3,palette:[],radius:.13,color:[1,1,1],sprite:{image:{resource:'flower',size:[320,400]}}})));
 return {async renderAt(c){const image=await objects[c.frame%2].renderAt(c,{},{}),buffer=await init.gpu.imageToBuffer!(image,{version:1});try{await init.gpu.publishBuffer('rgba',buffer,{version:1});}finally{await init.gpu.releaseBuffer(buffer);}return image;},async dispose(){for(const o of objects)await o.dispose?.();}};
});
export default Composition({id:'resource-particle-atlas',width:128,height:72,fps:24,durationInFrames:24,background:'transparent',children:[
 Resource({id:'flower',kind:'image',src:'./puppet-plant.png'}),Stage({id:'resource',factory:resource,outputs:{surface:'surface'}}),Layer({source:ref('resource')}),
]});
