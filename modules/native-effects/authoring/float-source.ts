import {EngineError} from '../../../src/core/errors.ts';import {linear709,assertColor,type ColorEncoding,type AlphaMode} from '../../../src/media/surface.ts';
import type {ImageSource} from './types.ts';import {authoringError,active} from './runtime.ts';
/** Exact existing immutable F32 image-input algorithm, lifted out of the
 * qualified video-roto QA adapter. No new owner or pixel-effect algorithm. */
const rawImage={abiVersion:2 as const,id:'frameweave/authoring/immutable-f32-image',version:'1.0.0',inputCount:0,dataInputs:[{type:'u32' as const}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let i=(p.y*outputSize().x+p.x)*4u;return bitcast<vec4f>(vec4u(data0(i),data0(i+1u),data0(i+2u),data0(i+3u)));}'};
export interface FloatImageResourceOptions {width?:number;height?:number;color?:ColorEncoding;alpha?:AlphaMode;format?:'rgba16float'|'rgba32float'}
/** File is tightly packed, row-major RGBA Float32 little-endian (16 bytes/pixel).
 * An explicit Node preparation API writes/validates it; Native only sees the
 * declared Resource ID. Buffer and pipeline initialize once, images are per-frame. */
export function floatImageResource(id:string,options:FloatImageResourceOptions={}):ImageSource {
  if(typeof id!=='string'||!id.length)authoringError('resource.id','expected a declared file Resource ID');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['width','height','color','alpha','format'].includes(k)))authoringError('floatResource.options','unknown option');
  const config={...options,color:options.color?{...options.color}:linear709};assertColor(config.color);if(config.color.transfer!=='linear'||config.color.reference!=='scene'||config.format!==undefined&&!['rgba16float','rgba32float'].includes(config.format)||config.alpha!==undefined&&!['premultiplied','straight','opaque'].includes(config.alpha))authoringError('floatResource.output','scene-linear F16/F32 with an explicit supported Alpha representation');
  const source:ImageSource=()=>{throw new EngineError('E_IMAGE_SOURCE_INITIALIZATION','Prepare immutable float images during Stage init',{hint:'Use imageStage(..., {source: floatImageResource(id)}), or call source.prepare(init) before renderAt.'});};
  source.prepare=async(init,control={})=>{active(control.signal);const width=config.width??init.width,height=config.height??init.height;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height*16)||width*height*4>0xffffffff)authoringError('floatResource.dimensions','positive dimensions within the existing U32 component address contract');
    const data=await init.gpu.importBufferResource({version:1,id,profile:'raw-bytes-v1',bytes:width*height*16},{signal:control.signal});let closing:Promise<void>|undefined;
    try{const kernel=await init.gpu.compile(rawImage);return {source:async frame=>{active(frame.signal);if(closing)throw new EngineError('E_IMAGE_SOURCE_CLOSED','Float image source is disposed');return init.gpu.run(kernel,[],{data:[data.buffer],output:{width,height,color:config.color,alpha:config.alpha??'premultiplied',format:config.format??'rgba32float'},signal:frame.signal});},dispose(){return closing??=init.gpu.releaseBuffer(data.buffer);}};}catch(error){await init.gpu.releaseBuffer(data.buffer);throw error;}
  };return source;
}
