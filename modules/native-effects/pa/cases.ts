import type {FrameContext} from '../../../src/core/types.ts';
import {keyframes} from '../../../src/core/animation.ts';
import type {NativePaImageFilters} from './filters.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {linear709} from '../../../src/media/surface.ts';
export function coverageValues(width:number,height:number){return Float64Array.from({length:width*height},(_,i)=>(i%7)/6);}
export const ink=[2.30000000000001,-.33333333333337,.5,.71300000001] as const;
export function displacementOptions(context:FrameContext,variant=0){return {amount:keyframes([{frame:0,value:0},{frame:10,value:7.37}]),frequency:2.71,speed:-.31,seed:2147483647,time:variant===1?1e6:context.time,offset:variant===2?[-1.5,-.5] as const:[.137,-.271] as const,boundary:variant===1?'clamp' as const:'transparent' as const,sampling:variant===2?'nearest' as const:'bilinear' as const};}
export const shadowOptions={radius:.7,offset:[-1.25,1.75] as const,opacity:.71300000001,color:[2,-.25,.5] as const};
export async function callPa(name:keyof NativePaImageFilters,f:NativePaImageFilters,a:GpuPixelImage,b:GpuPixelImage,c:FrameContext,variant=0){switch(name){
 case 'blur':return f.blur(a,{radius:variant===1?0:.7,boundary:variant===2?'clamp':'transparent'});
 case 'glow':return f.glow(a,{radius:.8,intensity:variant===1?0:1.3,threshold:.4,boundary:'clamp'});
 case 'displacement':return f.displacement(a,displacementOptions(c,variant));
 case 'displaceWithMap':return f.displaceWithMap(a,b,{encoding:'rg-offset-px',scale:-.71300000001,boundary:variant===1?'clamp':'transparent'});
 case 'surfaceFromCoverage':return f.surfaceFromCoverage(coverageValues(a.info.width,a.info.height),{width:a.info.width,height:a.info.height,ink,workingColor:linear709,format:a.info.format});
 case 'innerShadow':return f.innerShadow(a,variant===1?{...shadowOptions,offset:[100000000,0]}:variant===2?{...shadowOptions,radius:0,offset:[0,0]}:shadowOptions);
 }}
