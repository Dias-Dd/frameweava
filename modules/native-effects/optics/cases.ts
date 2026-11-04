import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeOpticalRecipeFilters} from './filters.ts';
import {nativeOpticalNames} from './types.ts';
export type OpticalName=typeof nativeOpticalNames[number];
export const opticalAmount=keyframes([{frame:0,value:.6},{frame:239,value:1}]);
export async function callOptical(name:OpticalName,f:NativeOpticalRecipeFilters,i:GpuPixelImage,dirt:GpuPixelImage){const hi={threshold:.3,knee:.15,intensity:.7};switch(name){
 case 'bloomPyramid':return f.bloomPyramid(i,{...hi,levels:Math.min(3,1+Math.ceil(Math.log2(Math.max(i.info.width,i.info.height)))),radius:.7,scatter:.65,amount:opticalAmount});
 case 'anamorphicBloom':return f.anamorphicBloom(i,{...hi,radius:.7,squeeze:2});
 case 'streakGlare':return f.streakGlare(i,{...hi,length:3.2,angle:23,decay:2,samples:9});
 case 'diffractionGlare':return f.diffractionGlare(i,{...hi,length:3.2,rotation:17,decay:2,samples:9,arms:3});
 case 'lensGhosts':return f.lensGhosts(i,{...hi,count:3,spacing:.45,falloff:2,dispersion:.015});
 case 'lensHalo':return f.lensHalo(i,{...hi,radius:3.2,width:1.5,dispersion:.3});
 case 'lensDirt':return f.lensDirt(i,dirt,{...hi,radius:.7,dirtGain:1.3});
 case 'lensFlare':return f.lensFlare(i,{...hi,ghosts:3,spacing:.45,haloRadius:3.2,haloWidth:1.5,streakLength:3.2,dispersion:.015});
 case 'lightRays':return f.lightRays(i,{...hi,samples:9,density:.8,decay:.9});
 case 'occludedLightRays':return f.occludedLightRays(i,dirt,{...hi,samples:9,density:.8,decay:.9,opticalDensity:3});
 case 'chromaticAberration':return f.chromaticAberration(i,{scales:[.05,0,-.03],offset:[.2,.1]});
 case 'axialChromaticAberration':return f.axialChromaticAberration(i,{radii:[.7,0,1]});
 case 'spectralDispersion':return f.spectralDispersion(i,{dispersion:.08,samples:9});
 case 'halation':return f.halation(i,{...hi,radius:.6,spread:2,red:1.2,green:.2});
 case 'softFocus':return f.softFocus(i,{radius:.7,strength:.6,highlightBias:.2});
 case 'diffusionFilter':return f.diffusionFilter(i,{radius:.6,spread:2,strength:.4,haloFraction:.3});
 case 'airyDiffraction':return f.airyDiffraction(i,{radius:2,firstZero:1.5});
 case 'lightLeak':return f.lightLeak(i,{width:3.5,angle:17,intensity:.4,color:[1,.2,.04],ripple:.3});
 case 'opticalVignette':return f.opticalVignette(i,{focalLengthMm:25,sensorWidthMm:36,squeeze:1.2});
 case 'veilingGlare':return f.veilingGlare(i,{strength:.12});
}}
