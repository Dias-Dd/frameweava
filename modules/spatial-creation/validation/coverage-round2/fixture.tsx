import {Composition,Stage,Layer,ref,linear709,surfaceFromPixels} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {createGpuParticleState,mapParticleProperties,particlePropertyMap,copyParticleProperties,integrateGpuParticles,renderGpuParticles} from '../../particle-mapping.ts';
import {createNativeReplay} from '../../../spatial-compute/native-replay.ts';import {positions,velocities,rgba,config} from './cases.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,state=await createGpuParticleState(g,{positions,velocities,radii:.08,colors:[1.2,.6,.2,.6]},{id:'mapping-test'}),history=await createGpuParticleState(g,{positions:[0,0,0],radii:.12,colors:[2,.5,.2,.6]},{id:'history-test'}),scratch=await g.createStateBuffer({type:'f32',length:12},undefined,{version:1,id:'history-scratch'}),replay=createNativeReplay(g,[history.buffer,scratch]);let epoch=0;
 async function mapAt(c:any){const image=await g.upload(surfaceFromPixels(1,1,[c.frame/24,0,0,1],{format:'rgba32float',alpha:'premultiplied',color:linear709}));try{const result=await mapParticleProperties(g,history,image,[particlePropertyMap({property:'velocityX',channel:'r'})],c,{},scratch);await copyParticleProperties(g,result,history);}finally{await g.release(image);}}
 return {async renderAt(c){
  await g.stateStep([state.buffer],{version:1,epoch:epoch++,step:0,reset:true});const settings=config(c.frame),format=c.frame>=12?'rgba16float' as const:'rgba32float' as const;
  if(settings.integrate)await integrateGpuParticles(g,state,c,{dt:.1});const image=await g.upload(surfaceFromPixels(2,2,rgba,{format,alpha:'premultiplied',color:linear709}));
  let candidate;try{candidate=await mapParticleProperties(g,state,image,settings.rules,c,settings.sampling);await g.publishBuffer('packed',candidate.buffer,{version:1});await g.publishBuffer('base',state.buffer,{version:1});}finally{await g.release(image);}
  try{
   const outcome=await replay.record(c,async step=>{if(step.step===1)await mapAt({...step.context,frame:0,time:0,globalFrame:0,globalTime:0});await integrateGpuParticles(g,history,step.context,{dt:step.dt});await mapAt(step.context);});if(outcome.steps===0)await mapAt(c);await g.publishBuffer('history',history.buffer,{version:1});
   const output=await renderGpuParticles(g,candidate,c,{width:init.width,height:init.height,format});const raw=await g.imageToBuffer!(output,{version:1});try{await g.publishBuffer('rgba',raw,{version:1});}finally{await g.releaseBuffer(raw);}return output;
  }finally{await g.releaseBuffer(candidate.buffer);}
 },async dispose(){await state.dispose();await history.dispose();await g.releaseBuffer(scratch);}};
});
export default Composition({id:'property-map-verify',width:96,height:64,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
