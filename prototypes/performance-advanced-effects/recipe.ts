import type {FrameContext} from '../../src/core/types.ts';
import type {GpuPixelScope,GpuPixelImage} from '../../modules/gpu-effects/pixel-types.ts';
import {smokePlume,waterCaustics,heightFog,gravitationalLensing} from '../../modules/spatial-vfx/index.ts';
import {createGpuPixelEffects} from '../../modules/gpu-effects/pixel-effects.ts';
import {createCreativeFilters} from '../../modules/gpu-image-effects/resident/creative/filters.ts';

/** Frozen workload /1. Real shipped algorithms, never copies or substitute shaders.
 * F32 scene-linear Rec.709, PM Alpha, fixed raymarch quality at every resolution. */
export const names=['smokePlume','waterCaustics','over','heightFog','gravitationalLensing','brightnessContrast','colorBalance','tint','filmGrain','vignette','pixelate','sobelEdges'];
export async function recipe(g:GpuPixelScope,c:FrameContext,width:number,height:number){
 const images=new Set<GpuPixelImage>(),own=(i:GpuPixelImage)=>{images.add(i);return i;};
 const drop=async(i:GpuPixelImage)=>{await g.release(i);images.delete(i);};
 const fx=createCreativeFilters(g,c,own),base={width,height,format:'rgba32float' as const,steps:32,maxWork:128e9};
 try{
  const smoke=own(await smokePlume(g,c,{...base,octaves:3,opacity:.8,color:[1.5,.55,.2]}));
  const water=own(await waterCaustics(g,c,{...base,exposure:2,color:[.1,.8,2]}));
  let image=own(await createGpuPixelEffects(g).over(smoke,water));
  await drop(smoke);await drop(water);
  const step=async(fn:(previous:GpuPixelImage)=>Promise<GpuPixelImage>)=>{const previous=image;image=own(await fn(previous));await drop(previous);};
  await step(i=>heightFog(g,i,c,{...base,density:.08,distance:3}));
  await step(i=>gravitationalLensing(g,i,c,{...base,einsteinRadius:.08,occluderRadius:.01}));
  await step(i=>fx.brightnessContrast(i,{brightness:.025,contrast:1.05}));
  await step(i=>fx.colorBalance(i,{shadows:[.04,-.01,.02],midtones:[.02,0,-.01],highlights:[.01,.02,0]}));
  await step(i=>fx.tint(i,{black:[-.03,.01,.02],white:[1.2,.9,.6],amount:.08}));
  await step(i=>fx.filmGrain(i,{amount:.012,seed:37,animated:true,colored:true}));
  await step(i=>fx.vignette(i,{amount:.25,radius:.65}));
  await step(i=>fx.pixelate(i,{blockSize:[2,2]}));
  await step(i=>fx.sobelEdges(i,{strength:.04,color:[1,.5,.2],mode:'overlay'}));
  return {image,release:async()=>{for(const image of images)await g.release(image);images.clear();}};
 }catch(e){for(const image of images)await g.release(image);throw e;}
}
