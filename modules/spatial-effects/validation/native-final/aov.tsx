import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {Matrix4} from 'three';
import {createNativeSpatialDataRenderer} from '../../../spatial-data-effects/native.ts';import {releaseSpatialField} from '../../../spatial-fields/index.ts';import {createNativeParticleRenderer,type ParticleFrame} from '../../native.ts';import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';import {mesh,camera} from './visual.tsx';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,data=await createNativeSpatialDataRenderer(g,{width:init.width,height:init.height,meshes:[mesh]}),particles=createNativeParticleRenderer(g,{width:init.width,height:init.height,camera});
 return {renderAt:c=>withGpuResources(g,async a=>{
  const previous=Math.max(0,c.frame-1),context=(frame:number)=>({frame,time:frame/24,fps:c.fps}),sample=(frame:number,old=false)=>({context:context(frame),camera,objects:[{id:mesh.id,model:new Matrix4().makeTranslation(frame*.125,0,old&&c.frame===3?6:-frame*.125).toArray()}]}),fields=await data.capture(sample(c.frame),sample(previous,true));
  for(const [name,field]of Object.entries({depth:fields.depth,normal:fields.normal,motion:fields.motion})){a.adopt(field,v=>releaseSpatialField(g,v));await g.publishBuffer(name,field.data,{version:1});await g.publishBuffer(name+'-valid',field.validity,{version:1});}
  const frame:ParticleFrame={frame:c.frame,time:c.time,fps:c.fps,seed:1,step:0,contacts:[],emitted:1,particles:[{id:0,birthTime:0,lifetime:100,radius:.45,position:[0,0,0],velocity:[0,0,0],trail:[]}]},image=a.image(await particles.render(frame,c,{ink:[2,1,.5],fadeWithAge:false},{depth:fields.depth,softDistance:.25})),view=a.buffer(await g.imageToBuffer!(image,{version:1}));await g.publishBuffer('rgba',view,{version:1});return a.keep(image);
 }),async dispose(){await data.dispose();particles.dispose();}};
});
export default Composition({id:'native-resident-aov-to-particles',width:96,height:64,fps:24,durationInFrames:4,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
