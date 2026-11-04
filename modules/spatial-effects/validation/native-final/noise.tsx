import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeNoiseTextureRenderer} from '../../native.ts';import {noiseCases,noiseStyle} from './noise-fixtures.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,renderer=await createNativeNoiseTextureRenderer(g,{width:init.width,height:init.height});
 return {async renderAt(c){return withGpuResources(g,async a=>{const item=noiseCases[c.frame],image=a.image(await renderer.render({...noiseStyle,noise:item.noise,dimensions:item.dimensions},c,item.format)),view=a.buffer(await g.imageToBuffer!(image,{version:1}));await g.publishBuffer('rgba',view,{version:1});return a.keep(image);});},dispose:()=>renderer.dispose()};
});
export default Composition({id:'native-final-noise',width:17,height:11,fps:24,durationInFrames:noiseCases.length,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
