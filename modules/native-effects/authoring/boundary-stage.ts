import {EngineError} from '../../../src/core/errors.ts';import {linear709} from '../../../src/media/surface.ts';import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {createNativeProfessionalEffects} from '../extended.ts';
import {compose,createImageTools,imageResource,exposure,type ImageFrame,type ImageEffectFactory} from './index.ts';
import type {NativeProfessionalFilters} from '../extended.ts';
async function rejects(request:()=>Promise<unknown>,code:string){try{await request();}catch(error){if(error instanceof EngineError&&error.code===code)return;throw error;}throw new EngineError('E_IMAGE_QA','Expected '+code);}
const plate={abiVersion:1 as const,id:'test/image-authoring/boundary-source',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.5,-.1,.2,.5);}'};
export const boundary=defineNativeStage(init=>{const g=init.gpu,tools=createImageTools(init);let once=false,factoryCount=0;
 const factory:ImageEffectFactory<NativeProfessionalFilters>=i=>{factoryCount++;return createNativeProfessionalEffects(i);};
 return {async renderAt(context){
  if(!once){once=true;return tools.apply(imageResource('photo',{decode:'surface-v2'}),compose(exposure(.2),()=>{throw new EngineError('E_IMAGE_QA_FAIL','Intentional callback failure after source/effect recording');}),{context});}
  const source=await g.run(await g.compile(plate),[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
  await rejects(()=>tools.apply(source,exposure({stops:Infinity}),{context}),'E_GPU_IMAGE_PARAMETER');
  let continueFirst!:()=>void;const wait=new Promise<void>(resolve=>{continueFirst=resolve;}),first=tools.apply(source,async i=>{await wait;return i;},{context});await rejects(()=>tools.apply(source,compose(),{context}),'E_IMAGE_AUTHORING_BUSY');continueFirst();await first;
  let saved:ImageFrame|undefined;await tools.apply(source,(i,frame)=>{saved=frame;return i;},{context});await rejects(async()=>{await saved!.process(factory,source,(i,f)=>f.levels(i));},'E_IMAGE_AUTHORING_FRAME');
  await tools.apply(source,async(i,frame)=>{const descriptor={version:1 as const,id:'photo',decode:'surface-v2' as const,output:{width:init.width,height:init.height,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709}};const a=await frame.resource(descriptor),b=await frame.resource(descriptor);if(a!==b)throw new EngineError('E_IMAGE_QA','Declared source was imported twice in one invocation');return i;},{context});
  await tools.apply(source,(i,frame)=>frame.process(factory,i,(s,f)=>f.levels(s)),{context});const result=await tools.apply(source,(i,frame)=>frame.process(factory,i,(s,f)=>f.levels(s)),{context});if(factoryCount!==1)throw new EngineError('E_IMAGE_QA','Factory initialized more than once');
  const borrowed=createImageTools(init);await borrowed.apply(source,compose(),{context});await borrowed.dispose();await borrowed.dispose();await rejects(()=>borrowed.apply(source,compose(),{context}),'E_IMAGE_AUTHORING_CLOSED');
  const meta=await g.createBuffer({type:'u32',length:3},Uint32Array.of(factoryCount,tools.stats().initializedFamilies,Number(tools.stats().closed)));await g.publishBuffer('meta',meta,{version:1});await g.releaseBuffer(meta);return result;
 },async dispose(){await tools.dispose();await tools.dispose();}};
});
