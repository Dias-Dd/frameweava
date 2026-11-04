import {keyframes} from '../../../src/core/animation.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeBuiltinFilters} from './filters.ts';
export const transformOptions={rotation:keyframes([{frame:0,value:0},{frame:10,value:37},{frame:239,value:-10}]),scale:.85,opacity:.71300000001};
export const displacementOptions={amount:keyframes([{frame:0,value:0},{frame:10,value:7.37}]),frequency:2.71,speed:-.31,seed:2147483647};
export const mixModes=['screen','source-over','multiply','lighter'] as const;
export function callBuiltin(name:keyof NativeBuiltinFilters,f:NativeBuiltinFilters,a:GpuPixelImage,b:GpuPixelImage,c:FrameContext,variant=0,defaults=false){switch(name){
 case 'blur':return f.blur(a,defaults?{}:{radius:[.7,64,80,200][variant%4],boundary:'clamp'});
 case 'brightness':return f.brightness(a,defaults?{}:{amount:.71300000001});
 case 'transform':return f.transform(a,defaults?{}:transformOptions);
 case 'mix':return f.mix(a,b,defaults?{}:{mode:mixModes[variant%4],opacity:.71300000001});
 case 'glow':return f.glow(a,defaults?{}:{radius:.8,intensity:1.71300000001,threshold:.4});
 case 'displacement':return f.displacement(a,defaults?{}:displacementOptions);
 case 'cinematicGlow':return f.cinematicGlow(a,defaults?{}:{intensity:.35,color:'#abcdef'});
}}
