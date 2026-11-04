import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {surfaceFromPixels,linear709} from '../../../../src/media/surface.ts';import {heightFog,gravitationalLensing} from '../../native-library.ts';import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
export const controls=defineNativeStage(init=>{const gpu=init.gpu,imageToBuffer=gpu.imageToBuffer?.bind(gpu);if(!imageToBuffer)throw Error('Native imageToBuffer required');return {async renderAt(c){return withGpuResources(gpu,async a=>{
 const values=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const alpha=x%5/4;values.set([2*alpha+.25,-.25*alpha-.25,.5*alpha,alpha],(y*init.width+x)*4);}
 const format=c.frame===5?'rgba16float' as const:'rgba32float' as const,input=a.image(await gpu.upload(surfaceFromPixels(init.width,init.height,values,{format,alpha:'premultiplied',color:linear709})));let output=input;
 if(c.frame===1||c.frame===4||c.frame===5)output=a.image(await gravitationalLensing(gpu,input,c,{einsteinRadius:c.frame===4?1e-40:0,occluderRadius:0,format}));
 if(c.frame===2)output=a.image(await heightFog(gpu,input,c,{density:0}));
 if(c.frame===3)output=a.image(await heightFog(gpu,input,c,{density:.2,distance:2,falloff:0,color:[.3,.5,.8]}));
 const view=a.buffer(await imageToBuffer(output,{version:1}));await gpu.publishBuffer('rgba',view,{version:1});return a.keep(output);
 });}};});
export default Composition({id:'native-image-controls',width:33,height:19,fps:24,durationInFrames:6,background:'transparent',children:[Stage({id:'controls',factory:controls,outputs:{surface:'surface'}}),Layer({source:ref('controls')})]});
