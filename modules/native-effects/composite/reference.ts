/** Independent scalar F64 definitions. No production shader/control helpers. */
import {toHalf,fromHalf,type AlphaMode} from '../../../src/media/surface.ts';
import type {CompositeName} from './cases.ts';
type RGB=readonly number[];
const F=Math.fround,clamp=(x:number)=>Math.max(0,Math.min(1,x)),lum=(v:RGB)=>v[0]*.2126390058715104+v[1]*.715168678767756+v[2]*.0721923153607337,sat=(v:RGB)=>Math.max(...v)-Math.min(...v);
function setSat(v:RGB,s:number){const span=sat(v),lo=Math.min(...v);return span===0?[0,0,0]:v.map(v=>(v-lo)*s/span);}
function setLum(v:RGB,l:number){const d=l-lum(v);return v.map(v=>v+d);}
export function dissolveHash(x:number,y:number,seed:number,frame:number){let h=Math.imul(x,0x8da6b343)^Math.imul(y,0xd8163841)^Math.imul(seed,0xcb1ab31f)^Math.imul(frame,0x9e3779b9);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h&0xffffff)/16777216;}
function colorBlend(name:CompositeName,s:RGB,d:RGB,epsilon:number){const denominator=(x:number)=>Math.abs(x)<epsilon?(x<0?-epsilon:epsilon):x,dodge=(d:number,s:number)=>d/denominator(1-s),burn=(d:number,s:number)=>1-(1-d)/denominator(s);switch(name){
 case 'hueBlend':return setLum(setSat(s,sat(d)),lum(d));
 case 'saturationBlend':return setLum(setSat(d,sat(s)),lum(d));
 case 'colorBlend':return setLum(s,lum(d));
 case 'luminosityBlend':return setLum(d,lum(s));
 case 'lighterColor':return lum(s)>lum(d)?s:d;
 case 'darkerColor':return lum(s)<lum(d)?s:d;
 default:return s.map((v,c)=>{const b=d[c];switch(name){
  case 'softLight':{if(v<=.5)return b-(1-2*v)*b*(1-b);const a=Math.abs(b),g=(b<0?-1:1)*(a<=.25?((16*a-12)*a+4)*a:Math.sqrt(a));return b+(2*v-1)*(g-b);}
  case 'colorDodge':return dodge(b,v);
  case 'colorBurn':return burn(b,v);
  case 'vividLight':return v<=.5?burn(b,2*v):dodge(b,2*v-1);
  case 'hardMix':return Number(b+v>=1);
  case 'divideBlend':return b/denominator(v);
  case 'negationBlend':return 1-Math.abs(1-v-b);
  case 'phoenixBlend':return Math.min(v,b)-Math.max(v,b)+1;
  case 'linearDodgeBlend':return v+b;
  default:throw Error('Not a color mode '+name);
 }});
}}
export function compositePixel(name:CompositeName,source:RGB,destination:RGB,sourceAlpha:AlphaMode,destinationAlpha:AlphaMode,opacity:number,x=0,y=0,frame=0,epsilon=2**-6,seed=0xf1234567):number[]{const rawS=source.slice(0,3),rawD=destination.slice(0,3),a=source[3],b=destination[3],s=sourceAlpha==='straight'?rawS.map(v=>v*a):rawS,d=destinationAlpha==='straight'?rawD.map(v=>v*b):rawD,sa=a*opacity,sp=s.map(v=>v*opacity),is=1-sa,id=1-b;let out:number[],alpha:number;switch(name){
 case 'destinationOver':out=d.map((v,c)=>v+sp[c]*id);alpha=b+sa*id;break;
 case 'sourceOut':out=sp.map(v=>v*id);alpha=sa*id;break;
 case 'sourceAtop':out=sp.map((v,c)=>v*b+d[c]*is);alpha=b;break;
 case 'destinationAtop':out=d.map((v,c)=>v*sa+sp[c]*id);alpha=sa;break;
 case 'xorComposite':out=sp.map((v,c)=>v*id+d[c]*is);alpha=sa*id+b*is;break;
 case 'saturateComposite':{const factor=sa>0?Math.min(1,id/sa):1;out=sp.map((v,c)=>v*factor+d[c]);alpha=sa*factor+b;break;}
 default:{out=sp.map((v,c)=>v+d[c]*is);alpha=sa+b*is;const cs=sourceAlpha==='straight'?rawS:a>0?s.map(v=>v/a):[0,0,0],cd=destinationAlpha==='straight'?rawD:b>0?d.map(v=>v/b):[0,0,0];if(name==='dissolve'){if(sa>0){if(dissolveHash(x,y,seed,frame)<sa){out=cs;alpha=1;}else{out=d;alpha=b;}}break;}if(sa>0&&b>0){const blend=colorBlend(name,cs,cd,epsilon);out=out.map((v,c)=>v+sa*b*(blend[c]-cs[c]));}break;}
 }return [...out,clamp(alpha)];}
export function compositeReference(name:CompositeName,s:Float32Array,d:Float32Array,w:number,h:number,frame:number,sa:AlphaMode,da:AlphaMode,half=false){const output=new Float32Array(s.length),opacity=.55+(.9-.55)*frame/239;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(y*w+x)*4,p=compositePixel(name,[...s.slice(n,n+4)],[...d.slice(n,n+4)],sa,da,opacity,x,y,frame);for(let c=0;c<4;c++){const v=F(p[c]);output[n+c]=half?fromHalf(toHalf(v)):v;}}return output;}
export function compositeChainReference(s:Float32Array,d:Float32Array){const a=new Float32Array(s.length),b=new Float32Array(s.length),out=new Float32Array(s.length);for(let j=0;j<s.length;j+=4){a.set(compositePixel('softLight',[...s.slice(j,j+4)],[...d.slice(j,j+4)],'opaque','opaque',.8).map(F),j);b.set(compositePixel('colorBlend',[...a.slice(j,j+4)],[...d.slice(j,j+4)],'premultiplied','opaque',.65).map(F),j);out.set(compositePixel('sourceAtop',[...b.slice(j,j+4)],[...d.slice(j,j+4)],'premultiplied','opaque',.9).map(F),j);}return out;}
