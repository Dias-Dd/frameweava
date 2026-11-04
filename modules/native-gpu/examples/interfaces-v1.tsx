import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '../authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createStatisticsFilters} from '../../gpu-image-effects/resident/foundations/statistics.ts';
export const background=defineNativeStage(init=>({async renderAt(){
 let image=await init.gpu.importResource({version:1,id:'background',decode:'surface-v2',output:{width:16,height:8,format:'rgba32float',alpha:'premultiplied',color:linear709}});
 const filters=createStatisticsFilters(init.gpu);image=await filters.autoLevels(image);image=await filters.autoContrast(image);image=await filters.autoColor(image);return filters.equalize(image,{bins:16});
}}));
export const mesh=defineNativeStage(async init=>{
 const g=init.gpu,positions=await g.createStateField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-.625,-.625,.5,.375,-.625,.5,-.125,.625,.5),{version:1,id:'triangle'});
 const advance=await g.compileCompute({abiVersion:1,id:'example/interfaces/move',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[64,1,1],code:'fn compute(p:vec3u,l:vec3u,w:vec3u){store0(p.x*3u,load0(p.x*3u)+.03125);}'});
 let previous=-1,epoch=0;
 return {async renderAt(c){const requested=Math.floor(c.frame);if(requested<=previous){epoch++;previous=-1;}for(let step=previous+1;step<=requested;step++){await g.stateStep([positions],{version:1,epoch,step,reset:step===0});await g.dispatch(advance,[positions],{workItems:[3,1,1]});}previous=requested;await g.publishBuffer('positions',positions,{version:1});return g.drawMesh({positions,color:[4,-2,2,.75],output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});}};
});
export default <Composition width={320} height={180} fps={24} durationInFrames={4} background="transparent"><Resource id="background" src="./interfaces-v1.surface.json" kind="file"/><Stage id="background" factory={background}/><Stage id="mesh" factory={mesh}/><Layer source={ref('background')}/><Layer source={ref('mesh')}/></Composition>;
