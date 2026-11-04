import {defineNativeStage} from '@frameweave/engine/native';
import {expr} from '@frameweave/engine';
import {video,image,clip,at,editComposition,createEditingStage} from '../index.ts';
const v=video('footage','./footage.mp4',{width:320,height:180});
const pixels=image('pixels','./input.surface.json',{width:8,height:4,decode:'surface-v2',alpha:'straight'});
export const verify=defineNativeStage(async init=>{
 const edit=await createEditingStage(init);let last:any;return {async renderAt(c,i,p){
  last={c,i,p};const pending=edit.renderAt(c,i,p);let busy=false;try{await edit.renderAt(c,i,p);}catch(e:any){busy=e.code==='E_EDIT_BUSY';}if(!busy)throw Error('Missing busy guard');
  const image=await pending;let changed=false;try{await edit.renderAt(c,i,{edit:{...(p.edit as any),duration:25}});}catch(e:any){changed=e.code==='E_EDIT_PLAN_CHANGED';}if(!changed)throw Error('Missing plan seal guard');
  const b=await init.gpu.imageToBuffer!(image,{version:1});try{await init.gpu.publishBuffer('rgba',b,{version:1});}finally{await init.gpu.releaseBuffer(b);}return image;
 },async dispose(){await edit.dispose?.();await edit.dispose?.();if(last){let closed=false;try{await edit.renderAt(last.c,last.i,last.p);}catch(e:any){closed=e.code==='E_EDIT_CLOSED';}if(!closed)throw Error('Missing close guard');}}};
});
export default editComposition({id:'numeric-edit',width:16,height:8,fps:24,duration:24,factory:verify,background:[0,0,0,0],format:'rgba16float',tracks:[
 [at(0,clip(v,{from:12,duration:8,fit:'stretch',sampling:'nearest'})),at(12,clip(v,{from:0,duration:8,fit:'stretch',sampling:'nearest'}))],
 [at(4,clip(pixels,{duration:16,fit:'stretch',sampling:'nearest',transform:{x:expr.frame}}))]
]});
