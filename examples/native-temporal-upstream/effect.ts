import {defineNativeStage} from '@frameweave/engine/native';
export const sample=defineNativeStage(async init=>{
 const source=await init.temporal!.bindSource({version:1,profile:'declared-input-v1',input:'image',clock:'consumer-local'});
 return {renderAt(context){const time=context.time+.5*context.fps.den/context.fps.num;return source.window(context,{},at=>at({index:0,time,weight:1,context:{...context,time,frame:context.frame+.5}}));},dispose:()=>source.dispose()};
});
