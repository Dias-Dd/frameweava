import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import {pixelsFromSurface,type ProfessionalSurface,type ColorEncoding} from '../../src/media/surface.ts';
import {transformPixels} from '../../src/media/color.ts';
import {fields,fail,type ImageEffectOptions} from './parameters.ts';
import {sameColor} from './flatten.ts';


/** Porter-Duff foreground over background; scene-linear PM arithmetic.
 * Opacity uses existing Signals and retains the compositor's split F64 scalar.
 * Output is native premultiplied/opaque only: the owner's PM error contract
 * cannot guarantee arbitrary straight unassociation at very low coverage. */
export interface OverOptions extends Omit<ImageEffectOptions,'alpha'> {alpha?:'premultiplied'|'opaque';opacity?:Signal<number>}
export function resolveOver(options:OverOptions={},ctx?:FrameContext){
 fields(options,['opacity','workingColor','format','alpha','maxBufferBytes','signal'],'over');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const raw=options.opacity??1;
 if(options.opacity===null||typeof raw!=='number'&&(!raw||typeof raw!=='object'||Array.isArray(raw)))fail('E_GPU_IMAGE_PARAMETER','opacity: number or Signal required');
 if(typeof raw!=='number'&&!ctx)fail('E_GPU_IMAGE_CONTEXT','Opacity Signal requires FrameContext');
 const opacity=typeof raw==='number'?raw:evaluate(raw,ctx!);
 if(typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<0||opacity>1)fail('E_GPU_IMAGE_PARAMETER','opacity must be finite in [0,1]');
 return {opacity,output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
/** Implementation identity is necessary, never a promise of all-domain
 * accuracy, GPU availability, input admission, permission or CPU fallback. */
export function requireCompensated(stats:{readonly availableBackend:string;readonly precisionProfile?:string},operation:'Source-over'|'Screen'|'Multiply'|'RGB offset'|'Matte difference'|'Crossfade'='Source-over'){
 if(stats.precisionProfile!=='compensated-f32-v1')fail('E_GPU_IMAGE_UNSUPPORTED',`${operation} requires the shipped compensated-f32-v1 compositor; this owner has no matching precision identity`);
 if(stats.availableBackend!=='webgpu')fail('E_GPU_IMAGE_BACKEND','Compensated compositor identity does not establish an available hardware GPU');
}
export function prepareBlendInput(input:ProfessionalSurface,color:ColorEncoding,label:string){
 const raw=pixelsFromSurface(input),equal=sameColor(input.color,color);
 if(input.alpha==='premultiplied'&&!equal)for(let i=0;i<raw.length;i+=4)if(raw[i+3]===0&&(raw[i]!==0||raw[i+1]!==0||raw[i+2]!==0))fail('E_GPU_IMAGE_UNSUPPORTED',`${label}: zero-coverage PM emission requires the same working encoding`);
 const p=equal?raw:transformPixels(raw,input.color,color,input.alpha).pixels;
 for(let i=0;i<p.length;i+=4){const a=p[i+3];if(a!==0&&a<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED',`${label}: arithmetic coverage must be zero or normal Float32`);
  for(let c=0;c<3;c++){if(input.alpha!=='premultiplied')p[i+c]*=a;const v=p[i+c];if(!Number.isFinite(v))fail('E_MEDIA_RANGE',`${label}: non-finite prepared PM RGB`);if(v!==0&&Math.abs(v)<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED',`${label}: prepared RGB must be zero or normal Float32`);}
 }return p;
}
