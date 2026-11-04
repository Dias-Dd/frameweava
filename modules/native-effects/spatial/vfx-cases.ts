import type {FrameContext} from '../../../src/core/types.ts';
import type {GpuPixelScope,GpuPixelImage,GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import * as V from '../../spatial-vfx/index.ts';
import type {NativeSpatialFrame} from './frame.ts';
import {linear709} from '../../../src/media/surface.ts';
export async function inputImage(g:GpuPixelScope,width:number,height:number,format:'rgba16float'|'rgba32float'){
 const source:GpuPixelKernelSourceV1={abiVersion:1,id:'fixture/spatial-native-input',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let a=array<f32,4>(0.,.125,.5,1.)[(p.x+3u*p.y)%4u];return vec4f(2.0+f32(p.x%5u)*.25,-.25,.5,a);}'};
 return g.run(await g.compile(source),[],{output:{width,height,format,alpha:'premultiplied',color:linear709}});
}
/** Independent old entry binding for the original Web GPU numerical reference;
 * no new device/renderer. Both layouts use the frozen case options below. */
export function originalVfxFrame(g:GpuPixelScope,c:FrameContext):NativeSpatialFrame['vfx']{return {
 mandelbulb:o=>V.mandelbulb(g,c,o),mengerSponge:o=>V.mengerSponge(g,c,o),gyroidSurface:o=>V.gyroidSurface(g,c,o),voronoiCrystal:o=>V.voronoiCrystal(g,c,o),terrainRaymarch:o=>V.terrainRaymarch(g,c,o),metaballVolume:o=>V.metaballVolume(g,c,o),planetAtmosphere:o=>V.planetAtmosphere(g,c,o),heightFog:(i,o)=>V.heightFog(g,i,c,o),volumetricSpotlight:o=>V.volumetricSpotlight(g,c,o),smokePlume:o=>V.smokePlume(g,c,o),flameVolume:o=>V.flameVolume(g,c,o),waterCaustics:o=>V.waterCaustics(g,c,o),starfield:o=>V.starfield(g,c,o),orbitalTrails:o=>V.orbitalTrails(g,c,o),gravitationalLensing:(i,o)=>V.gravitationalLensing(g,i,c,o),
};}
export function vfxCase(index:number,f:NativeSpatialFrame['vfx'],input:GpuPixelImage,width:number,height:number,format:'rgba16float'|'rgba32float'){
 const options={width,height,format,steps:index===4?512:48,seed:73,rotation:0,exposure:index===10?.25:1};
 switch(index){case 0:return f.mandelbulb(options);case 1:return f.mengerSponge(options);case 2:return f.gyroidSurface(options);case 3:return f.voronoiCrystal(options);case 4:return f.terrainRaymarch(options);case 5:return f.metaballVolume(options);case 6:return f.planetAtmosphere(options);case 7:return f.heightFog(input,{...options,density:.1});case 8:return f.volumetricSpotlight(options);case 9:return f.smokePlume(options);case 10:return f.flameVolume(options);case 11:return f.waterCaustics(options);case 12:return f.starfield({...options,starRadius:.1});case 13:return f.orbitalTrails(options);case 14:return f.gravitationalLensing(input,{...options,einsteinRadius:.08,occluderRadius:.01});default:throw Error('Invalid VFX case');}
}
