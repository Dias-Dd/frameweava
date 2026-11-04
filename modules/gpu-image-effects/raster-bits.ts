import {fail} from './parameters.ts';

/** Private transport, not a TVG/Surface schema. Four raw IEEE32 words occupy
 * six exact unsigned 24-bit integers in two opaque RGB32F data planes. The
 * compositor sees no payload Alpha, signed zero, subnormal, or HDR arithmetic. */
export const rasterBitsEncoding='f32-rgba-in-rgb24/1' as const;
export type DataPlane=0|1;
export function packRasterRegion(words:Uint32Array,sourceWidth:number,x:number,y:number,width:number,height:number,plane:DataPlane):Float32Array {
 const sourceHeight=words.length/(sourceWidth*4);
 if(![sourceWidth,x,y,width,height,sourceHeight].every(Number.isSafeInteger)||sourceWidth<1||width<1||height<1||x<0||y<0||x+width>sourceWidth||y+height>sourceHeight)fail('E_GPU_IMAGE_ENCODING','Invalid source bit-plane rectangle');
 const out=new Float32Array(width*height*4);
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const at=((row+y)*sourceWidth+x+col)*4,i=(row*width+col)*4,r=words[at],g=words[at+1],b=words[at+2],a=words[at+3];
  if(plane===0){out[i]=r&0xffffff;out[i+1]=(r>>>24)|((g&0xffff)<<8);out[i+2]=(g>>>16)|((b&0xff)<<16);}
  else{out[i]=b>>>8;out[i+1]=a&0xffffff;out[i+2]=a>>>24;}
  out[i+3]=1;
 }
 return out;
}
function integer(value:number,max:number){if(!Number.isSafeInteger(value)||value<0||value>max)fail('E_GPU_IMAGE_ENCODING','GPU returned a corrupt RGB24 data word');return value;}
/** Guard each closed intermediate before it can be reused. Its physical Alpha
 * is Boolean data coverage, never the original image's Alpha or a blend mask. */
export function assertPackedRaster(p:Float32Array,width:number,height:number,filledWidth:number,filledHeight:number,plane:DataPlane):void {
 if(p.length!==width*height*4)fail('E_GPU_IMAGE_ENCODING','Wrong data-plane length');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,inside=x<filledWidth&&y<filledHeight;
  if(p[i+3]!==Number(inside))fail('E_GPU_IMAGE_ENCODING','GPU data coverage must be a filled binary rectangle');
  for(let c=0;c<3;c++){integer(p[i+c],plane===1&&c===2?0xff:0xffffff);if(!inside&&p[i+c]!==0)fail('E_GPU_IMAGE_ENCODING','Nonzero payload outside data coverage');}
 }
}
/** Reassemble GPU-returned data only; no spatial mapping/reference fallback. */
export function unpackRasterPixel(first:Float32Array,second:Float32Array,at:number,target:Uint32Array,to:number):void {
 const a=integer(first[at],0xffffff),b=integer(first[at+1],0xffffff),c=integer(first[at+2],0xffffff),d=integer(second[at],0xffffff),e=integer(second[at+1],0xffffff),f=integer(second[at+2],0xff);
 if(first[at+3]!==1||second[at+3]!==1)fail('E_GPU_IMAGE_ENCODING','GPU tiling left a data-plane hole');
 target[to]=(a|((b&0xff)<<24))>>>0;target[to+1]=((b>>>8)|((c&0xffff)<<16))>>>0;target[to+2]=((c>>>16)|(d<<8))>>>0;target[to+3]=(e|(f<<24))>>>0;
}
