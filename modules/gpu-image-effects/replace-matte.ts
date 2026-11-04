import {pixelsFromSurface,type ProfessionalSurface,type ColorEncoding} from '../../src/media/surface.ts';
import {transformPixels} from '../../src/media/color.ts';
import {fields,fail,type ImageEffectOptions} from './parameters.ts';
import {sameColor} from './flatten.ts';


/** Replace coverage with mask Alpha, preserving recoverable straight colour.
 * PM output=C*maskAlpha, straight output=C; old coverage is not multiplied in. */
export interface ReplaceMatteOptions extends ImageEffectOptions {}
export function resolveReplaceMatte(options:ReplaceMatteOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'replaceMatte');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
/** Standard input Alpha association/colour preparation, not matte arithmetic.
 * Recover before colour conversion so straight hidden RGB at A=0 is retained. */
function colour(input:ProfessionalSurface,working:ColorEncoding){
 const p=pixelsFromSurface(input);
 for(let i=0;i<p.length;i+=4){const a=p[i+3];for(let c=0;c<3;c++){
  if(input.alpha==='premultiplied'){
   if(a===0&&p[i+c]!==0)fail('E_GPU_IMAGE_UNSUPPORTED','Zero-coverage PM emission has no recoverable straight colour; use explicit straight pixels for replacement');
   p[i+c]=a===0?0:p[i+c]/a;
  }
  if(!Number.isFinite(p[i+c]))fail('E_MEDIA_RANGE','Recovered source colour is not finite Float32');
 }p[i+3]=1;}
 const out=sameColor(input.color,working)?p:transformPixels(p,input.color,working,'opaque').pixels;
 for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++){const v=out[i+c];if(!Number.isFinite(v))fail('E_MEDIA_RANGE','Non-finite working source colour');if(v!==0&&Math.abs(v)<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED','Prepared source colour must be zero or normal Float32');}
 return out;
}
