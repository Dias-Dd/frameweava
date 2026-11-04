import {keyframes} from '../../../../src/core/animation.ts';
import {compose,exposure,whiteBalance,colorBalance,glow,vignette,filmGrain} from '../index.ts';
export const exposureStops=keyframes([{frame:0,value:0},{frame:6,value:.6},{frame:11,value:.1}]);
export const look=compose(
  exposure(exposureStops),
  whiteBalance(),
  colorBalance({highlights:[.02,0,-.01]}),
  glow({radius:3,threshold:1,intensity:.15,boundary:'clamp'}),
  vignette({amount:.15}),
  filmGrain({amount:.002,seed:37,animated:true}),
);
