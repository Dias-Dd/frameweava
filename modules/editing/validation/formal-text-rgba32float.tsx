import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeParagraphRenderer,type NativeParagraphHandle} from '../../pro-animation/src/text-layout/native.ts';
import {constantImage} from '../../spatial-creation/composition-core.ts';
import {createEditingStage,timeline,at,clip,type TextAsset} from '../index.ts';
import {captionTracks} from '../examples/captions-formal-prepared.ts';
const captions=captionTracks[0].map(p=>({...p,clip:{...p.clip,asset:{...p.clip.asset,plate:undefined,ink:[-.12,1.8,3.1,.75]}as TextAsset}}));
export const verify=defineNativeStage(async init=>{
 const format='rgba32float' as const,edit=await createEditingStage(init,{plan:timeline({fps:24,duration:24,background:[0,0,0,0],format,tracks:[captions]})}),reference=createNativeParagraphRenderer(init),handles:NativeParagraphHandle[]=[];
 try{for(const p of captions)handles.push(await reference.prepare((p.clip.asset as TextAsset).paragraph));}catch(e){await edit.dispose?.();await reference.dispose();throw e;}
 return {async renderAt(c){const output=await edit.renderAt(c,{},{});let expected;
  try{const index=c.frame<8?0:c.frame>=9&&c.frame<16?1:c.frame>=17?2:-1;
   if(index<0)expected=await constantImage(init,[0,0,0,0],format);else{const asset=captions[index].clip.asset as TextAsset;expected=await reference.at(c).draw(handles[index],{format,ink:asset.ink,transform:()=>({matrix:[1,0,0,1,0,asset.offsetY],opacity:1})});}
   for(const [id,image]of [['actual',output],['reference',expected]]as const){const view=await init.gpu.imageToBuffer!(image,{version:1});try{const copy=await init.gpu.cloneBuffer(view);try{await init.gpu.publishBuffer(id,copy,{version:1});}finally{await init.gpu.releaseBuffer(copy);}}finally{await init.gpu.releaseBuffer(view);}}
   return output;
  }catch(e){await init.gpu.release(output);throw e;}finally{if(expected)await init.gpu.release(expected);}
 },async dispose(){await edit.dispose?.();await reference.dispose();}};
});
export default Composition({id:'caption-numeric',width:640,height:360,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify}),Layer({source:ref('verify')})]});
