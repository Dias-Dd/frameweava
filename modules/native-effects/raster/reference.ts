// Acceptance-only independent scalar arithmetic. Never imported by a Stage.
import {fromHalf,toHalf,type AlphaMode,linear709} from '../../../src/media/surface.ts';
import {gamutMatrix,transformPixels} from '../../../src/media/color.ts';
import {exactOverPixel,exactScreenPixel,exactMultiplyPixel,exactCrossfadePixel,exactMatteDifference,exactOffsetPixel} from '../../gpu-image-effects/validation/over-reference.ts';
import {repeatPhase,repeatPeriod} from '../../gpu-image-effects/tile-parameters.ts';
import type {RasterName} from './cases.ts';
const F=Math.fround;
export const defaultAlpha=(name:RasterName,alpha:AlphaMode):AlphaMode=>['alphaToRGB','flattenBlack'].includes(name)?'opaque':['blur','glow','fill','applyMatte','reframe'].includes(name)?alpha==='opaque'?'premultiplied':alpha:['exposure','invert','tile','modulate','offsetRGB'].includes(name)?alpha:'premultiplied';
export function associate(p:Float32Array,alpha:AlphaMode,canonical=false){const out=new Float32Array(p);for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)out[i+c]=canonical&&p[i+3]===0?0:alpha==='premultiplied'?p[i+c]:p[i+c]*p[i+3];return out;}
export function gaussian(p:Float32Array,w:number,h:number,sigma:number,clamp=false){const r=Math.ceil(3*sigma),weights=sigma===0?[1]:Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum;
 const axis=(input:Float32Array,vertical:boolean)=>{const out=new Float32Array(input.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){let v=0;for(let k=-r;k<=r;k++){let xx=x+(vertical?0:k),yy=y+(vertical?k:0);if(clamp){xx=Math.max(0,Math.min(w-1,xx));yy=Math.max(0,Math.min(h-1,yy));}if(xx>=0&&yy>=0&&xx<w&&yy<h)v+=input[(yy*w+xx)*4+c]*weights[k+r];}out[(y*w+x)*4+c]=v;}return out;};return axis(axis(p,false),true);}
function alphaImage(p:Float32Array){const out=new Float32Array(p.length);for(let i=3;i<p.length;i+=4)out[i]=p[i];return out;}
function publish(p:Float32Array,from:AlphaMode,to:AlphaMode,half:boolean){const out=new Float32Array(p);if(from!==to&&from!=='opaque'&&to!=='opaque')for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++)out[i+c]=to==='premultiplied'?out[i+c]*out[i+3]:out[i+3]===0?0:out[i+c]/out[i+3];if(half)for(let i=0;i<out.length;i++)out[i]=fromHalf(toHalf(out[i]));return out;}
export function rasterReference(name:RasterName,a:Float32Array,b:Float32Array,w:number,h:number,alpha:AlphaMode,half=false):Float32Array{
 let out=new Float32Array(a.length),representation:AlphaMode=alpha;const pm=associate(a,alpha),bm=associate(b,alpha),opacity=.71300000001;
 if(name==='blur'){out=gaussian(associate(a,alpha,true),w,h,.7);representation='premultiplied';}
 else if(name==='glow'){const source=associate(a,alpha,true),bright=new Float32Array(a.length),m=gamutMatrix(linear709,linear709),weights=[0,1,2].map(c=>.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c]);for(let i=0;i<a.length;i+=4){const y=source[i+3]===0?0:(source[i]*weights[0]+source[i+1]*weights[1]+source[i+2]*weights[2])/source[i+3];if(y>.4)for(let c=0;c<4;c++)bright[i+c]=source[i+c]*(1-.4/y);}const soft=gaussian(bright,w,h,.8,true);for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)out[i+c]=source[i+c]+soft[i+c]*1.3;out[i+3]=source[i+3]+(1-source[i+3])*Math.max(0,Math.min(1,soft[i+3]*1.3));}representation='premultiplied';}
 else if(name==='feather'){out=gaussian(alphaImage(a),w,h,.7,true);representation='premultiplied';}
 else if(name==='dropShadow'){const halo=Math.ceil(3*.7)+2,pw=w+2*halo,ph=h+2*halo,padded=new Float32Array(pw*ph*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)padded[((y+halo)*pw+x+halo)*4+3]=a[(y*w+x)*4+3];const soft=gaussian(padded,pw,ph,.7);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=x+halo+1.25,sy=y+halo-1.75,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;let value=0;for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)if(ix+xx>=0&&iy+yy>=0&&ix+xx<pw&&iy+yy<ph)value+=soft[((iy+yy)*pw+ix+xx)*4+3]*(xx?fx:1-fx)*(yy?fy:1-fy);out.set([2*value*opacity,-.25*value*opacity,.5*value*opacity,value*opacity],(y*w+x)*4);}representation='premultiplied';}
 else if(name==='reframe'){const p=associate(a,alpha,true);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=-2+w-1-x,sy=1+h-1-y;if(sx>=0&&sy>=0&&sx<w&&sy<h)out.set(p.subarray((sy*w+sx)*4,(sy*w+sx)*4+4),(y*w+x)*4);}representation='premultiplied';}
 else if(name==='tile'){for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sx=repeatPhase(x,Number.MAX_SAFE_INTEGER,repeatPeriod(w,'mirror')),sy=repeatPhase(y,-Number.MAX_SAFE_INTEGER,repeatPeriod(h,'mirror'));if(sx>=w)sx=2*w-1-sx;if(sy>=h)sy=2*h-1-sy;out.set(a.subarray((sy*w+sx)*4,(sy*w+sx)*4+4),(y*w+x)*4);}}
 else for(let i=0;i<a.length;i+=4){const av=a.subarray(i,i+4),bv=b.subarray(i,i+4),p=pm.subarray(i,i+4),q=bm.subarray(i,i+4);let v:number[]|readonly number[];
  switch(name){
   case 'fill':{const value=av[3]*opacity;v=[3*value,-.5*value,.75*value,value];representation='premultiplied';break;}
   case 'applyMatte':{const value=bv[3]*opacity;v=[p[0]*value,p[1]*value,p[2]*value,p[3]*value];representation='premultiplied';break;}
   case 'mergeMatte':v=[0,0,0,bv[3]+av[3]*(1-bv[3])];representation='premultiplied';break;
   case 'alphaToRGB':v=[3*av[3],-.5*av[3],.75*av[3],1];representation='opaque';break;
   case 'flattenBlack':v=[p[0],p[1],p[2],1];representation='opaque';break;
   case 'exposure':{const gain=F(2**.7);v=[av[0]*gain,av[1]*gain,av[2]*gain,av[3]];break;}
   case 'invert':{const coverage=alpha==='premultiplied'?av[3]:1;v=[coverage-av[0],coverage-av[1],coverage-av[2],av[3]];break;}
   case 'add':v=[p[0]+q[0],p[1]+q[1],p[2]+q[2],Math.min(1,F(p[3]+q[3]))];representation='premultiplied';break;
   case 'invertMatte':v=[0,0,0,1-av[3]];representation='premultiplied';break;
   case 'replaceMatte':v=[0,1,2].map(c=>F(alpha==='premultiplied'?av[3]===0?0:av[c]/av[3]:av[c])*bv[3]).concat(bv[3]);representation='premultiplied';break;
   case 'modulate':v=[av[0]*bv[0],av[1]*bv[1],av[2]*bv[2],av[3]];break;
   case 'over':v=exactOverPixel(p,q,opacity);representation='premultiplied';break;
   case 'screen':v=exactScreenPixel(p,q,opacity);representation='premultiplied';break;
   case 'multiply':v=exactMultiplyPixel(p,q,opacity);representation='premultiplied';break;
   case 'offsetRGB':v=exactOffsetPixel(av,[F(.37),F(-.25),F(1.125)],alpha==='premultiplied');break;
   case 'subtractMatte':v=[0,0,0,exactMatteDifference(av[3],bv[3])];representation='premultiplied';break;
   case 'crossfade':v=exactCrossfadePixel(p,q,opacity);representation='premultiplied';break;
   default:throw Error('Uncovered raster reference '+name);
  }out.set(v,i);
 }
 return publish(out,representation,defaultAlpha(name,alpha),half);
}
export function chainReference(a:Float32Array,b:Float32Array,w:number,h:number,alpha:AlphaMode,half:boolean){let v=rasterReference('exposure',a,b,w,h,alpha,half);v=rasterReference('offsetRGB',v,b,w,h,alpha,half);v=rasterReference('screen',v,b,w,h,alpha,half);return rasterReference('crossfade',v,associate(b,alpha),w,h,'premultiplied',half);}
export {transformPixels};
