import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {hangingCloth,windFlag,drapedCloth,bouncingBalls,dominoes,rigidScene,clothSheet,ballBody,boxBody,groundBody,springJoint} from 'spatial-creation-candidate';
export const verify=defineNativeStage(async init=>{
 const mesh=clothSheet({segments:[4,3]}),body=ballBody({id:'bob',radius:.18,position:[.6,-.4,0]}),anchor=boxBody({id:'anchor',size:[.1,.1,.1],position:[0,.8,0],body:{kind:'fixed'}});
 const objects=await Promise.all([hangingCloth(),windFlag({wind:[.4,.1,keyframes([{frame:0,value:1.2},{frame:100,value:2.2}])]}),drapedCloth(),bouncingBalls(),dominoes(),rigidScene({world:{bodies:[groundBody(),anchor,body],joints:[springJoint({id:'tether',between:['anchor','bob'],length:1.2,stiffness:25,damping:1})]}})]);
 return {async renderAt(c){const image=await objects[c.frame%6].renderAt(c,{},{}),view=await init.gpu.imageToBuffer!(image,{version:1});try{await init.gpu.publishBuffer('rgba',view,{version:1});}finally{await init.gpu.releaseBuffer(view);}const state=await init.gpu.createBuffer({type:'f32',length:3},Float32Array.of(c.frame%6,c.time,mesh.vertexIds.length));try{await init.gpu.publishBuffer('state',state,{version:1});}finally{await init.gpu.releaseBuffer(state);}return image;},async dispose(){for(const o of objects)await o.dispose?.();}};
});
export default Composition({id:'physics-presets-test',width:64,height:48,fps:24,durationInFrames:101,background:'#101927',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
