import {pixelsFromSurface,type ProfessionalSurface,type ColorEncoding} from '../../src/media/surface.ts';
import {transformPixels} from '../../src/media/color.ts';
import {fields,fail,type ImageEffectOptions} from './parameters.ts';
import {sameColor} from './flatten.ts';


/** Porter-Duff Plus/Lighter: PM RGB sum, coverage=min(1,A+B). No RGB clipping,
 * implicit transforms, arbitrary blend mode, weights, or opacity controls. */
export interface AddOptions extends ImageEffectOptions {}
export function resolveAdd(options:AddOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'add');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
function prepare(input:ProfessionalSurface,color:ColorEncoding,label:string){
 const raw=pixelsFromSurface(input),equal=sameColor(input.color,color);
 if(input.alpha==='premultiplied'&&!equal)for(let i=0;i<raw.length;i+=4)if(raw[i+3]===0&&(raw[i]!==0||raw[i+1]!==0||raw[i+2]!==0))fail('E_GPU_IMAGE_UNSUPPORTED',`${label}: zero-coverage PM emission requires the same working encoding`);
 const p=equal?raw:transformPixels(raw,input.color,color,input.alpha).pixels;
 for(let i=0;i<p.length;i+=4){
  const a=p[i+3];if(a!==0&&a<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED',`${label}: arithmetic coverage must be zero or normal Float32`);
  for(let c=0;c<3;c++){
   if(input.alpha!=='premultiplied')p[i+c]*=a;
   const v=p[i+c];if(!Number.isFinite(v))fail('E_MEDIA_RANGE',`${label}: non-finite prepared PM RGB`);
   if(v!==0&&Math.abs(v)<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED',`${label}: prepared RGB must be zero or normal Float32`);
  }
 }return p;
}
