import {evaluate,parseColor} from '../../src/core/animation.ts';
import {EngineError} from '../../src/core/errors.ts';
import {transformPixels} from '../../src/media/color.ts';
import {srgb,linear709} from '../../src/media/surface.ts';
import type {Signal,FrameContext} from '../../src/core/types.ts';
import type {AnimatedVec3} from './types.ts';

/** Strings are encoded sRGB; numeric components remain working-linear Rec709. */
export type StaticCreationColor=string|readonly [number,number,number];
export type CreationColor=AnimatedVec3|Signal<string>;
/** Pure control-color adapter over Core; never reads or transforms an image. */
export function linearColor(value:StaticCreationColor):[number,number,number]{
 if(Array.isArray(value)){
  if(value.length!==3||value.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new EngineError('E_CREATION_COLOR','Linear color requires three finite numbers');
  return [...value] as [number,number,number];
 }
 if(typeof value!=='string')throw new EngineError('E_CREATION_COLOR','Use an sRGB color string or three linear numeric components');
 const encoded=parseColor(value.trim());
 if(!encoded||encoded.some(v=>!Number.isFinite(v))||encoded.slice(0,3).some(v=>v<0||v>255))throw new EngineError('E_CREATION_COLOR','Unsupported sRGB color: use #rgb, #rrggbb, Core named colors or rgb(r,g,b) with channels0..255');
 if(encoded[3]!==1)throw new EngineError('E_CREATION_COLOR','A creator RGB color must be opaque; set opacity separately instead of embedding Alpha');
 const p=transformPixels(Float32Array.of(encoded[0]/255,encoded[1]/255,encoded[2]/255,1),srgb,linear709,'straight').pixels;
 return [p[0],p[1],p[2]];
}
/** Exact Core time/interpolation; numeric paths preserve their previous precision and errors. */
export function creationColor(value:CreationColor,c:FrameContext,name:string):[number,number,number]{
 if(Array.isArray(value)){
  if(value.length!==3)throw new EngineError('E_CREATION_PARAMETER',name+' requires three scalar Signals');
  return value.map((v,i)=>{const x=evaluate(v,c);if(typeof x!=='number'||!Number.isFinite(x))throw new EngineError('E_CREATION_PARAMETER',name+'['+i+'] must evaluate to a finite number in [-Infinity, Infinity]');return x;}) as [number,number,number];
 }
 const resolved=evaluate(value,c);if(typeof resolved!=='string')throw new EngineError('E_CREATION_COLOR',name+' must evaluate to an sRGB string or use three numeric Core Signals',{frame:c.frame,details:{parameter:name}});
 try{return linearColor(resolved);}catch(e){const error=e as {code?:string;message?:string};throw new EngineError(error.code??'E_CREATION_COLOR',name+': '+(error.message??String(e)),{frame:c.frame,details:{parameter:name}});}
}
