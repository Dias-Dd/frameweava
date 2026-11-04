import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeCompositeFilters} from './types.ts';
import {nativeCompositeNames} from './types.ts';
export type CompositeName=typeof nativeCompositeNames[number];
export const compositeOpacity=keyframes([{frame:0,value:.55},{frame:239,value:.9}]);
export function callComposite(name:CompositeName,f:NativeCompositeFilters,s:GpuPixelImage,d:GpuPixelImage){const o={opacity:compositeOpacity};switch(name){
 case 'colorDodge':return f.colorDodge(s,d,{...o,epsilon:2**-6});
 case 'colorBurn':return f.colorBurn(s,d,{...o,epsilon:2**-6});
 case 'vividLight':return f.vividLight(s,d,{...o,epsilon:2**-6});
 case 'divideBlend':return f.divideBlend(s,d,{...o,epsilon:2**-6});
 case 'dissolve':return f.dissolve(s,d,{...o,seed:0xf1234567,animated:true});
 default:return f[name](s,d,o);
}}
