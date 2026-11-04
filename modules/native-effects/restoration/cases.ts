import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeDepthField} from './types.ts';
import {nativeRestorationNames} from './types.ts';
import type {NativeRestorationRecipeFilters} from './filters.ts';
export type RestoreName=typeof nativeRestorationNames[number];
export const denoiseAmount=keyframes([{frame:0,value:.7},{frame:239,value:1}]);
// Small synthetic sensor makes CoC nontrivial in the 17x13 numerical fixture.
export const fixtureLens={focalLengthMm:35,fStop:5.6,focusDistanceM:3,sensorWidthMm:.2} as const;
export async function callRestore(name:Exclude<RestoreName,'circleOfConfusion'>,f:NativeRestorationRecipeFilters,i:GpuPixelImage,guide:GpuPixelImage,depth:NativeDepthField,frame:number){switch(name){
 case 'nonLocalMeans':return f.nonLocalMeans(i,{radius:1,patchRadius:1,strength:.25,noiseSigma:.03,amount:denoiseAmount});
 case 'guidedDenoise':return f.guidedDenoise(i,{radius:1,epsilon:.004});
 case 'atrousDenoise':return f.atrousDenoise(i,{levels:2,rangeSigma:.15});
 case 'anisotropicDiffusion':return f.anisotropicDiffusion(i,{iterations:3,step:.2,conductance:.15,model:frame%2?'reciprocal':'exponential'});
 case 'totalVariationDenoise':return f.totalVariationDenoise(i,{iterations:3,regularization:.04,step:.125});
 case 'kuwahara':return f.kuwahara(i,{radius:1});
 case 'anisotropicKuwahara':return f.anisotropicKuwahara(i,{radius:2,tensorRadius:1,anisotropy:.7,hardness:8});
 case 'sigmaDenoise':return f.sigmaDenoise(i,{radius:1,sigma:1.5,minimumFraction:.5});
 case 'wienerDenoise':return f.wienerDenoise(i,{radius:1,noiseVariance:.01});
 case 'leeDenoise':return f.leeDenoise(i,{radius:1,noiseVariance:.04});
 case 'jointBilateral':return f.jointBilateral(i,guide,{radius:1,spatialSigma:1.3,rangeSigma:.2});
 case 'rollingGuidance':return f.rollingGuidance(i,{radius:1,spatialSigma:1.3,rangeSigma:.2,iterations:2,initialSigma:.6});
 case 'chromaDenoise':return f.chromaDenoise(i,{radius:1,spatialSigma:1.3,rangeSigma:.2});
 case 'impulseDenoise':return f.impulseDenoise(i,{radius:1,sigma:2.5,noiseFloor:.01});
 case 'bokehBlur':return f.bokehBlur(i,{radius:2.3,blades:frame%2?5:0,rotation:17,roundness:.3});
 case 'depthOfField':return f.depthOfField(i,depth,{...fixtureLens,blades:frame%2?5:0,rotation:17,roundness:.3});
 case 'tiltShift':return f.tiltShift(i,{radius:1.7,center:[i.info.width*.5,i.info.height*.45],angle:17,inFocusWidth:2,transition:3,samples:16,blades:0});
 case 'splitDiopter':return f.splitDiopter(i,depth,{...fixtureLens,secondFocusDistanceM:6,split:0,transition:.2,angle:0,blades:frame%2?5:0,rotation:17,roundness:.3});
 case 'depthBilateral':return f.depthBilateral(i,depth,{radius:1,spatialSigma:1.3,rangeSigma:.2});
 case 'focusPeaking':return f.focusPeaking(i,{threshold:.05,softness:.03,color:[1.2,-.1,.2]});
}}
