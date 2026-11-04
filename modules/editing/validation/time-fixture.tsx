import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {video,clip,at,timeline,createEditingStage,speedClip,reverseClip,freezeClip,remapClip} from '../index.ts';
const shot=clip(video('footage','./footage.mp4',{width:320,height:180}),{duration:24,fit:'stretch',sampling:'nearest'});
const cases={fast:speedClip(shot,2),slow:speedClip(shot,.5),reverse:reverseClip(shot),hold:freezeClip(shot,13,48),remap:remapClip(shot,keyframes([{frame:0,value:0},{frame:11,value:23},{frame:12,value:0},{frame:23,value:23},{frame:47,value:1}]),{duration:48})};
export const verify=defineNativeStage(async init=>{
 const stages:Record<string,Awaited<ReturnType<typeof createEditingStage>>>={};try{for(const [name,source]of Object.entries(cases))stages[name]=await createEditingStage(init,{plan:timeline({fps:24,duration:48,background:[0,0,0,0],tracks:[[at(0,source)]],format:'rgba32float'})});}catch(e){await Promise.all(Object.values(stages).map(s=>s.dispose?.()));throw e;}
 return {async renderAt(c){let result;try{for(const [name,stage]of Object.entries(stages)){const image=await stage.renderAt(c,{},{});try{const view=await init.gpu.imageToBuffer!(image,{version:1});try{const data=await init.gpu.cloneBuffer(view);try{await init.gpu.publishBuffer(name,data,{version:1});}finally{await init.gpu.releaseBuffer(data);}}finally{await init.gpu.releaseBuffer(view);}if(!result)result=image;}finally{if(result!==image)await init.gpu.release(image);}}return result!;}catch(e){if(result)await init.gpu.release(result);throw e;}},async dispose(){await Promise.all(Object.values(stages).map(s=>s.dispose?.()));}};
});
export default Composition({id:'time-numeric',width:16,height:8,fps:24,durationInFrames:48,background:'transparent',children:[Resource({id:'footage',src:'./footage.mp4',kind:'media'}),Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
