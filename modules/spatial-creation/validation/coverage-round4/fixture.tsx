import {Composition,Stage,Layer,ref,linear709,surfaceFromPixels} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {createWaveWorld,renderWaveWorld} from '../../wave-world.ts';import {renderHeightCaustics} from '../../height-caustics.ts';import {W,H,waves,pixels,configuration} from './cases.ts';
export const verify=defineNativeStage(async init=>{const g=init.gpu,simulations:Awaited<ReturnType<typeof createWaveWorld>>[]=[];for(const o of waves)simulations.push(await createWaveWorld(init,o));
 return {async renderAt(c){for(let i=0;i<simulations.length;i++){await simulations[i].record(c);await g.publishBuffer('wave'+i,simulations[i].state,{version:1});await g.publishBuffer('depth'+i,simulations[i].depth,{version:1});}
  const format=c.frame>=12?'rgba16float':'rgba32float',values=pixels(c.frame),surface=await g.upload(surfaceFromPixels(W,H,values.surface,{format,alpha:'premultiplied',color:linear709})),bottom=await g.upload(surfaceFromPixels(W,H,values.bottom,{format,alpha:'premultiplied',color:linear709}));
  try{const image=await renderHeightCaustics(init,c,{surface,bottom,sky:c.frame%8===7?bottom:undefined},{...configuration(c.frame),format}),view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer('caustics',view,{version:1});}finally{await g.releaseBuffer(view);}
   const map=await renderWaveWorld(init,simulations[2],c,{format,view:c.frame%3===0?'height':c.frame%3===1?'normal':'depth'});try{const raw=await g.imageToBuffer!(map,{version:1});try{await g.publishBuffer('wave-image',raw,{version:1});}finally{await g.releaseBuffer(raw);}}finally{await g.release(map);}return image;
  }finally{await g.release(surface);await g.release(bottom);}
 },async dispose(){await Promise.all(simulations.map(s=>s.dispose()));}};
});
export default Composition({id:'water-verify',width:W,height:H,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
