import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeKeyingRecipeFilters} from './filters.ts';
import {plannedKeyingNames} from './types.ts';
export const keyGain=keyframes([{frame:0,value:.85},{frame:239,value:1.15}]),keyThreshold=keyframes([{frame:0,value:.25},{frame:239,value:.75}]);
export type KeyName=typeof plannedKeyingNames[number];
export async function callKey(name:Exclude<KeyName,'matteDistance'>,f:NativeKeyingRecipeFilters,image:GpuPixelImage,background:GpuPixelImage,inner:GpuPixelImage,outer:GpuPixelImage,frame:number){const {width:w,height:h}=image.info;
 switch(name){
  case 'colorKey':return f.colorKey(image,{color:[0,1,0],tolerance:.1,softness:.2});
  case 'colorRangeKey':return f.colorRangeKey(image,frame%3===1?{space:'lab',minimum:[70,-120,50],maximum:[100,-40,140],softness:3.5}:frame%3===2?{space:'yuv',minimum:[.45,-.5,-.7],maximum:[.95,-.15,-.2],softness:.1}:{space:'rgb',minimum:[0,.7,-.1],maximum:[.2,1.3,.2],softness:.2});
  case 'extractKey':return f.extractKey(image,{channel:(['luma','red','green'] as const)[frame%3],black:.15,blackSoftness:.2,white:1.1,whiteSoftness:.3});
  case 'differenceMatte':return f.differenceMatte(image,background,{tolerance:.1,softness:.4,preblurSigma:.6,compare:frame%2?'luma':'rgb'});
  case 'colorDifferenceKey':return f.colorDifferenceKey(image,{screen:frame%2?'blue':'green',balance:.43,tolerance:.02,softness:.8});
  case 'screenKey':return f.screenKey(image,{color:[0,1,0],gain:keyGain,balance:.43,clipBlack:.03,clipWhite:.95,gamma:1.1,despill:.4,preblurSigma:.55});
  case 'advancedSpillSuppressor':return f.advancedSpillSuppressor(image,{channel:(['auto','blue','green'] as const)[frame%3],amount:.75,balance:.4,preserveLuma:frame%2===0,tint:[1,.85,1.15]});
  case 'unmult':return f.unmult(image,{background:frame%2?'white':'black',strength:.8});
  case 'innerOuterKey':return f.innerOuterKey(image,inner,outer,{edgeSigma:.5,edgeContrast:1.1});
  case 'keyCleaner':return f.keyCleaner(image,{radius:1.3,smoothAmount:.35,edgeContrast:1.12,preserveDetail:.4,colorRecovery:.5});
  case 'matteChoker':return f.matteChoker(image,{choke:frame%2?-.6:.75,softenSigma:.55,contrast:1});
  case 'refineMatte':return f.refineMatte(image,{radius:2,epsilon:.005,mode:frame%2?'hard':'soft',choke:-.25,contrast:1,decontaminate:.3});
  case 'edgeDecontaminate':return f.edgeDecontaminate(image,{radius:1.7,amount:.6,edgeWidth:.8});
  case 'edgeExtend':return f.edgeExtend(image,{radius:1.25,alphaThreshold:.7});
  case 'lightWrap':return f.lightWrap(image,background,{sigma:.7,amount:.45,edgeWidth:.8,mode:frame%2?'screen':'add'});
  case 'distanceFeather':return f.distanceFeather(image,{radius:1.3,offset:.2});
  case 'matteOutline':return f.matteOutline(image,{width:2.4,position:(['inside','outside','center'] as const)[frame%3],color:[2.1,-.2,.5],opacity:.8});
  case 'matteBevel':return f.matteBevel(image,{width:2.5,height:1.1,azimuth:38,elevation:42,ambient:.2,strength:.9});
  case 'matteGradient':return f.matteGradient(image,{radius:.75,boundary:frame%2?'clamp':'transparent'});
  case 'matteMedian':return f.matteMedian(image,{radius:frame%3,boundary:frame%2?'clamp':'transparent'});
  case 'matteThreshold':return f.matteThreshold(image,{threshold:keyThreshold,invert:frame%2===1});
  case 'matteQuantize':return f.matteQuantize(image,{levels:5,dither:.7,seed:0xfffffffd});
  case 'wireRemove':return f.wireRemove(image,{start:[.5,1.25],end:[w-1.25,h-2.5],width:1.8,feather:1.7});
 }
}
