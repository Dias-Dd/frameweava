// Independent scalar references. Never imported into a production Stage.
import type {FrameContext} from '../../../src/core/types.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {AlphaMode,ColorEncoding} from '../../../src/media/surface.ts';
import {linear709} from '../../../src/media/surface.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {exactOverPixel,exactScreenPixel,exactMultiplyPixel} from '../../gpu-image-effects/validation/over-reference.ts';
import {gaussian} from '../raster/reference.ts';
import {quantize} from '../color/reference.ts';
import {transformOptions,displacementOptions,mixModes} from './cases.ts';
import type {NativeBuiltinFilters} from './filters.ts';
function pm(p:Float32Array,alpha:AlphaMode,clear=false){const out=new Float32Array(p);for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)out[i+c]=clear&&p[i+3]===0?0:alpha==='straight'?p[i+c]*p[i+3]:p[i+c];return out;}
function transform(p:Float32Array,w:number,h:number,rotation:number,scale:number,opacity:number){const angle=rotation*Math.PI/180,c=Math.cos(angle)/scale,s=Math.sin(angle)/scale,out=new Float32Array(p.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=x+.5-w/2,dy=y+.5-h/2,sx=c*dx+s*dy+w/2-.5,sy=-s*dx+c*dy+h/2-.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;for(let channel=0;channel<4;channel++){let v=0;for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const px=ix+xx,py=iy+yy;if(px>=0&&py>=0&&px<w&&py<h)v+=(p[(py*w+px)*4+channel]*(xx?fx:1-fx))*(yy?fy:1-fy);}out[(y*w+x)*4+channel]=v*opacity;}}return out;}
function displacement(p:Float32Array,w:number,h:number,time:number,amount:number,frequency=9,speed=.8,seed=3){const out=new Float32Array(p.length),t=time*speed;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const wx=Math.sin(x/w*frequency*6.283+t+seed*.13),wy=Math.sin(y/h*frequency*4.2-t*.7+seed*.31),sx=Math.max(0,Math.min(w-1,Math.floor(x+amount*wy*wx+.5))),sy=Math.max(0,Math.min(h-1,Math.floor(y+amount*wx*.6+.5)));out.set(p.subarray((sy*w+sx)*4,(sy*w+sx)*4+4),(y*w+x)*4);}return out;}
function mix(back:Float32Array,front:Float32Array,mode:string,opacity:number){const out=new Float32Array(back.length);for(let i=0;i<out.length;i+=4){const a=front.subarray(i,i+4),b=back.subarray(i,i+4),value=mode==='screen'?exactScreenPixel(a,b,opacity):mode==='multiply'?exactMultiplyPixel(a,b,opacity):mode==='source-over'?exactOverPixel(a,b,opacity):Array.from(a,(v,c)=>v*opacity+b[c]);out.set(value,i);if(mode==='lighter')out[i+3]=Math.min(1,out[i+3]);}return out;}
function glow(p:Float32Array,w:number,h:number,radius:number,intensity:number,threshold:number,color:ColorEncoding){if(radius===0||intensity===0)return new Float32Array(p);const bright=new Float32Array(p.length),m=gamutMatrix(color,{...linear709,referenceWhiteNits:color.referenceWhiteNits}),weights=[0,1,2].map(c=>.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c]);for(let i=0;i<p.length;i+=4){const a=p[i+3],y=a===0?0:(p[i]*weights[0]+p[i+1]*weights[1]+p[i+2]*weights[2])/a,mask=a===0?0:Math.max(0,Math.min(1,(y-threshold)/Math.max(.001,1-threshold)));for(let c=0;c<4;c++)bright[i+c]=p[i+c]*mask;}const soft=gaussian(bright,w,h,radius);let result=new Float32Array(p);for(let amount=intensity;amount>0;amount-=1)result=mix(result,soft,'screen',Math.min(1,amount));return result;}
export function builtinReference(name:keyof NativeBuiltinFilters,a:Float32Array,b:Float32Array,w:number,h:number,alpha:AlphaMode,context:FrameContext,variant=0,half=false,defaults=false,color:ColorEncoding=linear709){let source=pm(a,alpha),out:Float32Array;
 switch(name){
 case 'blur':out=gaussian(pm(a,alpha,true),w,h,defaults?0:[.7,64,80,200][variant%4],!defaults);break;
 case 'brightness':out=new Float32Array(source);for(let i=0;i<out.length;i++)if(i%4!==3)out[i]*=defaults?1:.71300000001;break;
 case 'transform':out=transform(source,w,h,defaults?0:evaluate(transformOptions.rotation,context),defaults?1:.85,defaults?1:.71300000001);break;
 case 'mix':out=mix(source,pm(b,alpha),defaults?'screen':mixModes[variant%4],defaults?1:.71300000001);break;
 case 'glow':out=glow(source,w,h,defaults?12:.8,defaults?1.3:1.71300000001,defaults ? .45 : .4,color);break;
 case 'displacement':out=displacement(pm(a,alpha,true),w,h,context.time,defaults?7:evaluate(displacementOptions.amount,context),defaults?9:2.71,defaults ? .8 : -.31,defaults?3:2147483647);break;
 case 'cinematicGlow':source=quantize(displacement(pm(a,alpha,true),w,h,context.time,3),half);out=glow(source,w,h,14,defaults?1.3:.35,.45,color);break;
 }return quantize(out,half);
}
export function builtinChainReference(a:Float32Array,w:number,h:number,c:FrameContext,half=false){const blank=new Float32Array(a.length);let out=builtinReference('transform',a,blank,w,h,'premultiplied',c,0,half);out=quantize(Float32Array.from(out,(v,i)=>i%4===3?v:v*1.1),half);out=quantize(mix(a,out,'screen',.4),half);return builtinReference('cinematicGlow',out,blank,w,h,'premultiplied',c,0,half);}
