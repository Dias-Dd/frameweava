import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import * as compute from '../../../spatial-compute/native.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {linear709} from '../../../../src/media/surface.ts';
import {cases} from './compute-fixtures.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,clear=await g.compile({abiVersion:1,id:'frameweave/validation/native-final-clear',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(.05,.1,.2,1.);}'});
 return {renderAt:async c=>withGpuResources(g,async a=>{
  const f=cases[c.frame],input=[];for(const data of f.inputs)input.push(a.buffer(await g.createField(data.descriptor as any,Float32Array.from(data.values))));
  const result=f.name==='flockParticles'?await compute.flockParticles(g,{positions:input[0],velocities:input[1]},c,f.options):await (compute[f.name as keyof typeof compute] as Function)(g,...input,c,f.options),values=f.name==='flockParticles'?[result.positions,result.velocities]:[result];
  for(let i=0;i<values.length;i++){a.buffer(values[i]);await g.publishBuffer('value-'+i,values[i],{version:1});}
  return g.run(clear,[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
 })};
});
export default Composition({id:'native-final-compute',width:64,height:36,fps:24,durationInFrames:10,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
