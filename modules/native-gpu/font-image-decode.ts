import {openFontImages} from '../font-images/codec.ts';
import {rasterGlyph} from './font-image-raster.ts';
import type {NativeFontGlyphResource} from './font-image.ts';
import {EngineError} from '../../src/core/errors.ts';

export type FontImageSession=Awaited<ReturnType<typeof openFontImages>>;
function fail(code:string,message:string):never{throw new EngineError('E_NATIVE_FONT_IMAGE_'+code,message);}
/** Recompute the exact selected glyph from the sealed parent; never accept a
 * caller's extracted bytes, offsets, temporary files or observation receipt. */
export async function decodeFontGlyph(session:FontImageSession,source:NativeFontGlyphResource,maxBytes:number,complexity:{maxNodes?:number;maxDepth?:number}={}):Promise<Float32Array>{
 const {metadata:m,data}=session.extract(source.glyphId,source.format,source.strikeIndex??0),out=source.output;
 if(!Number.isSafeInteger(out.width*out.height*16)||out.width*out.height*16>maxBytes||data.length>maxBytes)fail('BUDGET','Decoded glyph exceeds the configured byte budget');
 const pixels=new Float32Array(out.width*out.height*4),foreground=source.foreground??[0,0,0,1];
 if(source.format==='svg'){
  if(m.length!==7||m[5]!==data.length||!source.svg)fail('METADATA','Invalid SVG record metadata');
  const rgba=await rasterGlyph(data,{format:'svg',glyphId:source.glyphId,width:out.width,height:out.height,maxBytes,...complexity,svg:{...source.svg,unitsPerEm:session.unitsPerEm,foreground}});
  for(let i=0;i<rgba.length;i++)pixels[i]=rgba[i]/255;return pixels;
 }
 if(m.length!==19||m[2]!==source.strikeIndex||m[3]!==source.glyphId||m[4]!==out.width||m[5]!==out.height||m[18]!==data.length)fail('SIZE','Output dimensions must match the exact selected bitmap strike');
 const encoding=m[15];
 if(encoding===0){
  const rgba=await rasterGlyph(data,{format:'png',glyphId:source.glyphId,width:out.width,height:out.height,maxBytes});for(let i=0;i<rgba.length;i++)pixels[i]=rgba[i]/255;return pixels;
 }
 if(encoding===1){
  if(data.length<pixels.length)fail('METADATA','Invalid premultiplied BGRA byte length');
  for(let i=0;i<pixels.length;i+=4){const a=data[i+3];if(data[i]>a||data[i+1]>a||data[i+2]>a)fail('ALPHA','Invalid premultiplied BGRA color');pixels[i]=a?data[i+2]/a:0;pixels[i+1]=a?data[i+1]/a:0;pixels[i+2]=a?data[i]/a:0;pixels[i+3]=a/255;}return pixels;
 }
 if(encoding===2){
  const bpp=m[16],packed=m[17]===1;if(![1,2,4,8].includes(bpp)||![0,1].includes(m[17]))fail('METADATA','Unsupported mask bit depth/packing');
  const rowBytes=Math.ceil(out.width*bpp/8),needed=packed?Math.ceil(out.width*out.height*bpp/8):rowBytes*out.height;if(data.length<needed)fail('METADATA','Invalid bitmap mask byte length');
  for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const bit=packed?(y*out.width+x)*bpp:y*rowBytes*8+x*bpp,coverage=(data[Math.floor(bit/8)]>>>(8-bpp-bit%8))&((1<<bpp)-1),i=(y*out.width+x)*4;pixels[i]=foreground[0];pixels[i+1]=foreground[1];pixels[i+2]=foreground[2];pixels[i+3]=foreground[3]*coverage/((1<<bpp)-1);}return pixels;
 }
 return fail('UNSUPPORTED','Unsupported bitmap encoding');
}
