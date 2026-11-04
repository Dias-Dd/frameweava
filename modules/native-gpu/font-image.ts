import {EngineError} from '../../src/core/errors.ts';
import type {GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
export interface NativeFontGlyphResource {
 version:1;id:string;decode:'font-glyph-v1';faceIndex?:number;glyphId:number;
 format:'sbix'|'cbdt'|'ebdt'|'svg';strikeIndex?:number;
 /** Font-unit y-down crop; original SVG viewport transform is preserved inside it. */
 svg?:{viewBox:readonly [number,number,number,number]};
 /** Explicit straight sRGB text color for mask/currentColor glyph artwork. */
 foreground?:readonly [number,number,number,number];
 output:Omit<GpuPixelImageInfo,'version'>;
}
export function fontGlyphResource(source:NativeFontGlyphResource):NativeFontGlyphResource{
 const bad=()=>{throw new EngineError('E_NATIVE_FONT_IMAGE_SCHEMA','Expected a declared font Resource, face/glyph/format/exact strike and explicit float output; no authored paths, offsets or pixels');};
 const uint=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
 if(!source||source.version!==1||source.decode!=='font-glyph-v1'||typeof source.id!=='string'||!source.id||source.id.includes('\0')||Object.keys(source).some(k=>!['version','id','decode','faceIndex','glyphId','format','strikeIndex','svg','foreground','output'].includes(k)))bad();
 if(!uint(source.faceIndex??0)||!uint(source.glyphId)||!['sbix','cbdt','ebdt','svg'].includes(source.format))bad();
 if(source.format==='svg'){
  if(source.strikeIndex!==undefined&&source.strikeIndex!==0||!source.svg||Object.keys(source.svg).some(k=>k!=='viewBox'))bad();
  const v=source.svg!.viewBox;if(!Array.isArray(v)||v.length!==4||v.some(n=>!Number.isFinite(n))||v[2]<=0||v[3]<=0)bad();
 }else if(!uint(source.strikeIndex)||source.svg!==undefined)bad();
 const f=source.foreground;if(f!==undefined&&(!Array.isArray(f)||f.length!==4||f.some(n=>!Number.isFinite(n)||n<0||n>1)))bad();
 if(!source.output||!['rgba16float','rgba32float'].includes(source.output.format))bad();
 return Object.freeze({...source,faceIndex:source.faceIndex??0,...source.format==='svg'?{strikeIndex:0,svg:Object.freeze({viewBox:Object.freeze([...source.svg!.viewBox]) as unknown as readonly [number,number,number,number]})}:{},...f?{foreground:Object.freeze([...f]) as unknown as readonly [number,number,number,number]}:{},output:Object.freeze({...source.output,color:Object.freeze({...source.output.color})})});
}
