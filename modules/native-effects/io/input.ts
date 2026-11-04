// Editable deterministic INPUT fixtures, not GPU effect implementations. Static
// assets are prepared once by the Node authoring tool; inline values are explicit
// small CPU source data. Neither is an implicit effect-chain readback/fallback.
import {surfaceFromPixels,type AlphaMode,type PixelFormat} from '../../../src/media/surface.ts';
import {linear709} from '../../../src/media/surface.ts';
import {keyframes} from '../../../src/core/animation.ts';
export const redGain=keyframes([{frame:0,value:1},{frame:12,value:1.25},{frame:23,value:1}]);
export function inputPixels(width:number,height:number,alpha:AlphaMode,offset=0){const p=new Float32Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4,a=alpha==='opaque'?1:((x+3*y)%4)/3,factor=alpha==='premultiplied'?a:1;p.set(alpha==='premultiplied'&&a===0?[.2,-.1,.05,0]:[(2.5+x/width+offset)*factor,(-.25+y/height*.125)*factor,(.125+x/width*.125)*factor,a],at);}return p;}
export function inputSurface(width:number,height:number,alpha:AlphaMode='premultiplied',format:PixelFormat='rgba32float',offset=0){return surfaceFromPixels(width,height,inputPixels(width,height,alpha,offset),{format,alpha,color:linear709});}
