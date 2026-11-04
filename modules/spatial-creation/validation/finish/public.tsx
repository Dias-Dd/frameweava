import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {ribbonScene,particleBurst,noiseTexture,lagoonScene} from 'spatial-creation-candidate';
export const verify=defineNativeStage(async init=>{
 const objects=await Promise.all([ribbonScene({ribbon:{segments:16},finish:'cinema'}),particleBurst({finish:'neon'}),noiseTexture({finish:'warm'}),lagoonScene({steps:24,finish:'cool'})]);
 return {async renderAt(c){const object=objects[c.frame%4],image=await object.renderAt(c,{},{}),view=await init.gpu.imageToBuffer!(image,{version:1});try{await init.gpu.publishBuffer('rgba',view,{version:1});}finally{await init.gpu.releaseBuffer(view);}return image;},async dispose(){for(const o of objects)await o.dispose?.();}};
});
export default Composition({id:'finish-public',width:64,height:48,fps:24,durationInFrames:101,children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
