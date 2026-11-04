import type {FrameContext} from '../../../../src/core/types.ts';
import type {GpuPixelScope,GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import {fields,number,fail} from '../parameters.ts';
import {blendKernel} from './kernels.ts';
import {blendModes,type BlendFilters,type BlendOptions,type BlendName} from './types.ts';
export function createBlendFilters(scope:GpuPixelScope,context?:FrameContext,track:(image:GpuPixelImage)=>GpuPixelImage=v=>v,signal?:AbortSignal):BlendFilters{
 async function blend(name:BlendName,s:GpuPixelImage,b:GpuPixelImage,o:BlendOptions){fields(o,['opacity'],name);if(s.info.width!==b.info.width||s.info.height!==b.info.height)fail(name+': foreground/backdrop dimensions must match');const p=Uint32Array.of(blendModes[name],0);new Float32Array(p.buffer)[1]=number(o.opacity,1,'opacity',context,0,1);if(scope.stats().pendingPasses>=scope.capabilities().maxPendingPasses)await scope.complete({signal:o.signal??signal});return track(await scope.run(await scope.compile(blendKernel),[s,b],{parameters:p,output:{format:o.format??s.info.format,alpha:'premultiplied'},signal:o.signal??signal}));}
 return {
  async darken(s,b,o={}){return blend('darken',s,b,o);},
  async lighten(s,b,o={}){return blend('lighten',s,b,o);},
  async difference(s,b,o={}){return blend('difference',s,b,o);},
  async exclusion(s,b,o={}){return blend('exclusion',s,b,o);},
  async overlay(s,b,o={}){return blend('overlay',s,b,o);},
  async hardLight(s,b,o={}){return blend('hardLight',s,b,o);},
  async linearBurn(s,b,o={}){return blend('linearBurn',s,b,o);},
  async subtractBlend(s,b,o={}){return blend('subtractBlend',s,b,o);},
  async linearLight(s,b,o={}){return blend('linearLight',s,b,o);},
  async pinLight(s,b,o={}){return blend('pinLight',s,b,o);},
 };
}
