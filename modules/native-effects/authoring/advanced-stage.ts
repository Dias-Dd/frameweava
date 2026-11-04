import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createImageTools} from './index.ts';
import {cases,other} from './advanced-cases.ts';
import {publish} from '../composite/stage.ts';
const plate={abiVersion:1 as const,id:'test/advanced-authoring/plate',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let u=vec2f(p)/vec2f(outputSize());let a=select(.55+u.y*.4,0.,p.x==0u);return vec4f(.2+u.x*1.8,-.2+u.y*.3,1.4-u.x,a);}'};
export const advancedNumeric=defineNativeStage(async init=>{
  const g=init.gpu,tools=createImageTools(init);let preparations=0,evaluations=0,releases=0;
  const tracked:typeof other=()=>{throw Error('Source must be prepared');};
  tracked.prepare=async(init,options)=>{preparations++;const source=await other.prepare!(init,options);return {source:async frame=>{evaluations++;return source.source(frame);},async dispose(){releases++;await source.dispose?.();}};};
  await tools.prepareSources([other,tracked,tracked]);
  return {async renderAt(context){
    const half=context.frame>=100,which=context.frame%100,c=cases[which];if(!c)throw Error('Unknown advanced case');
    const source=await g.run(await g.compile(plate),[],{output:{width:init.width,height:init.height,format:half?'rgba16float':'rgba32float',color:linear709,alpha:'premultiplied'}});
    const actual=await tools.apply(source,c.effect,{context});await publish(g,'actual',actual);
    const direct=await tools.apply(source,c.direct,{context});await publish(g,'direct',direct);
    await tools.apply(source,async(i,frame)=>{const a=await frame.input(tracked),b=await frame.input(tracked);if(a!==b)throw Error('Same auxiliary source evaluated twice');return i;},{context});
    if(preparations!==1||releases!==0)throw Error('Prepared source lifecycle changed during frames');
    const metadata=await g.createBuffer({type:'u32',length:3},Uint32Array.of(preparations,evaluations,tools.stats().preparedSources));await g.publishBuffer('meta',metadata,{version:1});await g.releaseBuffer(metadata);
    return direct;
  },async dispose(){await tools.dispose();await tools.dispose();if(preparations!==1||releases!==1)throw Error('Prepared source not released exactly once');}};
});
