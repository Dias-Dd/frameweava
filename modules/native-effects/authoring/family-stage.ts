import {defineNativeStage} from '../../native-gpu/authoring.ts';import {linear709} from '../../../src/media/surface.ts';import {publish} from '../composite/stage.ts';
import {createImageTools,withImageSources,type ImageSource} from './index.ts';import {cases,other} from './family-cases.ts';import {textureCases} from './texture-cases.ts';
const plate={abiVersion:1 as const,id:'test/family-authoring/plate',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let u=vec2f(p)/vec2f(outputSize());return vec4f(.2+1.8*u.x,-.2+.3*u.y,1.4-u.x,select(.5+.4*u.y,0.,p.x==0u));}'};
export const families=defineNativeStage(async init=>{const tools=createImageTools(init),g=init.gpu;await tools.prepareSources([other,...textureCases.flatMap(c=>[c.full,c.half]),...cases.flatMap(c=>c.effect.sources??[]),...cases.flatMap(c=>c.direct.sources??[])]);await tools.prepareAssets([...cases.flatMap(c=>c.effect.assets??[]),...cases.flatMap(c=>c.direct.assets??[])]);
 return {async renderAt(context){const half=context.frame>=256,index=context.frame%256,output={width:init.width,height:init.height,color:linear709,alpha:'premultiplied' as const,format:half?'rgba16float' as const:'rgba32float' as const};
  if(index<cases.length){const c=cases[index],source=await g.run(await g.compile(plate),[],{output}),actual=await tools.apply(source,c.effect,{context});await publish(g,'actual',actual);const direct=await tools.apply(source,c.direct,{context});await publish(g,'direct',direct);return direct;}
  const c=textureCases[index-cases.length];if(!c)throw Error('Unknown family case');const source=half?c.half:c.full;
  return tools.apply(source,withImageSources(async(image,frame)=>{if(await frame.input(source)!==image)throw Error('Primary and auxiliary source caches differ');await publish(g,'actual',image);const direct=await c.direct(frame,half);await publish(g,'direct',direct);return image;},source),{context});
 },async dispose(){await tools.dispose();await tools.dispose();}};
});
