import {defineNativeStage} from '../../native-gpu/authoring.ts';import {linear709} from '../../../src/media/surface.ts';import {publish} from '../composite/stage.ts';import type {NativeVideoResource} from '../../native-gpu/resources.ts';
import {createImageTools,videoResource,compose,exposure,offsetRGB,glow} from './index.ts';
const look=compose(exposure(1),offsetRGB({offset:[-.15,-.15,-.15]}),glow({radius:1,intensity:.1}));
export const videoNumeric=defineNativeStage(init=>{const tools=createImageTools(init);return {async renderAt(context){let output;for(const format of ['rgba32float','rgba16float']as const)for(let mode=0;mode<3;mode++){
 const request:NativeVideoResource={version:1,id:'clip',decode:'video',decoder:'cpu',boundary:mode===0?'error':mode===1?'clamp':'loop',position:mode===0?{num:context.frame,den:24}:mode===1?{frame:context.frame}:{num:1001*(context.frame+1),den:300},interpretation:{...linear709,transfer:'rec709',reference:'display'},metadataPolicy:'validate',output:{width:init.width,height:init.height,format,alpha:'opaque',color:linear709},cacheBytes:320*180*16*4};
 const source=videoResource('clip',{format,boundary:request.boundary,...mode===0?{}:{position:mode===1?{frame:context.frame}:()=>({num:1001*(context.frame+1),den:300})},cacheBytes:request.cacheBytes});
 const actual=await tools.apply(source,look,{context});await publish(init.gpu,format+'-'+mode+'-actual',actual);
 const direct=await tools.apply(await init.gpu.importResource(request),look,{context});await publish(init.gpu,format+'-'+mode+'-direct',direct);output=direct;
 }if(!output)throw Error('Missing video output');return output;},dispose:()=>tools.dispose()};});
