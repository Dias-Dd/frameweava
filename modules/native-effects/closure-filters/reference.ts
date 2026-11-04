/** Independent F64 oracle. No production math/kernel/parameter helpers. */
import {fromHalf,toHalf,type AlphaMode} from '../../../src/media/surface.ts';
type Image={p:Float32Array;w:number;h:number;alpha:AlphaMode};
const F=Math.fround,clamp=(v:number)=>Math.max(0,Math.min(1,v)),weights=[.2126390058715104,.715168678767756,.0721923153607337],lum=(v:readonly number[])=>v.slice(0,3).reduce((s,x,j)=>s+x*weights[j],0),mod=(x:number,n:number)=>(x%n+n)%n;
function pm(i:Image,x:number,y:number){const q=(Math.max(0,Math.min(i.h-1,y))*i.w+Math.max(0,Math.min(i.w-1,x)))*4,v=Array.from(i.p.slice(q,q+4));return i.alpha==='straight'?v.map((x,j)=>j===3?x:x*v[3]):v;}
function color(v:readonly number[]){return v[3]>0?v.map((x,j)=>j===3?x:x/v[3]):[0,0,0,0];}
function sample(i:Image,x:number,y:number){x=Math.max(0,Math.min(i.w-1,x));y=Math.max(0,Math.min(i.h-1,y));const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=pm(i,ix,iy),b=pm(i,ix+1,iy),c=pm(i,ix,iy+1),d=pm(i,ix+1,iy+1);return a.map((v,j)=>(v*(1-fx)+b[j]*fx)*(1-fy)+(c[j]*(1-fx)+d[j]*fx)*fy);}
function random(x:number,y:number,s:number){let h=Math.imul(x,0x8da6b343)^Math.imul(y,0xd8163841)^Math.imul(s,0xcb1ab31f);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h&0xffffff)/16777216;}
export function hslEncode(c:readonly number[]){const offset=Math.min(0,...c.slice(0,3)),span=Math.max(1,...c.slice(0,3))-offset,a=c.slice(0,3).map(v=>(v-offset)/span),lo=Math.min(...a),hi=Math.max(...a),d=hi-lo,l=(hi+lo)/2,s=d===0?0:d/(1-Math.abs(2*l-1));let h=0;if(d!==0){const j=a.indexOf(hi);h=mod((j===0?(a[1]-a[2])/d:j===1?2+(a[2]-a[0])/d:4+(a[0]-a[1])/d)/6,1);}return [h,s,l,offset,span];}
export function hslDecode(v:readonly number[]){const [h,s,l,offset,span]=v,c=(1-Math.abs(2*l-1))*s,hh=mod(h,1)*6,x=c*(1-Math.abs(hh%2-1)),sector=Math.floor(hh),rgb=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][sector];return rgb.map(z=>(z+l-c/2)*span+offset);}
function quant(v:readonly number[],half=false){return v.map(x=>half?fromHalf(toHalf(F(x))):F(x));}
function map(i:Image,fn:(s:number[],c:number[],x:number,y:number)=>readonly number[],half=false):Image{const out=new Float32Array(i.p.length);for(let y=0;y<i.h;y++)for(let x=0;x<i.w;x++){const s=pm(i,x,y);out.set(quant(fn(s,color(s),x,y),half),(y*i.w+x)*4);}return {...i,p:out,alpha:'premultiplied'};}
function gauss(i:Image,sigma:number){const r=Math.ceil(sigma*3),raw=Array.from({length:r*2+1},(_,j)=>sigma===0?1:Math.exp(-.5*((j-r)/sigma)**2)),sum=raw.reduce((a,b)=>a+b,0),w=raw.map(x=>x/sum);for(const axis of [0,1]){const original=i;i=map(i,(_s,_c,x,y)=>{const v=[0,0,0,0];for(let j=-r;j<=r;j++){const q=pm(original,x+(axis===0?j:0),y+(axis===1?j:0));q.forEach((n,c)=>v[c]+=n*w[j+r]);}return v;});}return i;}
function stats(i:Image){const s=[0,0,0],sq=[0,0,0];let w=0;for(let y=0;y<i.h;y++)for(let x=0;x<i.w;x++){const p=pm(i,x,y),c=color(p);w+=p[3];for(let j=0;j<3;j++){s[j]+=c[j]*p[3];sq[j]+=c[j]**2*p[3];}}const mean=s.map(x=>w?x/w:0),variance=sq.map((x,j)=>w?Math.max(0,x/w-mean[j]**2):0);return {mean,variance};}
function residual(original:Image,blurred:Image){return map(blurred,(s,c,x,y)=>{const ref=color(pm(original,x,y));return [...ref.slice(0,3).map((v,j)=>(v-c[j])*s[3]),s[3]];});}
function convolve(i:Image,flip=false){const taps=[.25,.5,.25];return map(i,(s,_c,x,y)=>{const result=[0,0,0];for(let t=-1;t<=1;t++){const c=color(pm(i,mod(x+(flip?-t:t),i.w),y));for(let j=0;j<3;j++)result[j]+=c[j]*taps[t+1];}return [...result.map(v=>v*s[3]),s[3]];});}
export function closureReference(name:string,source:Float32Array,reference:Float32Array,w:number,h:number,frame:number,alpha:AlphaMode,refAlpha:AlphaMode,half=false){const a:Image={p:source,w,h,alpha},b:Image={p:reference,w,h,alpha:refAlpha},amount=.65+.3*frame/239;let ma=stats(a),mb=stats(b),current=a;if(name==='matchGrain'){ma=stats(residual(a,gauss(a,.6)));mb=stats(residual(b,gauss(b,.6)));}
 if(name==='motionDeblur'){for(let j=0;j<3;j++){const blurred=convolve(current),err=map(blurred,(s,c,x,y)=>[...color(pm(a,x,y)).slice(0,3).map((v,k)=>(v-c[k])*s[3]),s[3]]),gradient=convolve(err,true),prior=current;current=map(prior,(s,c,x,y)=>[...c.slice(0,3).map((v,k)=>(v+.7*(color(pm(gradient,x,y))[k]-.02*v))*s[3]),s[3]]);}}
 const calibration=[0,0,Math.floor((w-1)/2+.5),Math.floor((h-1)/2+.5),w-1,h-1],gain=[1,1,1],offset=[0,0,0];if(name==='colorStabilize'){const pairs=[];for(let j=0;j<3;j++){const s=pm(a,calibration[j*2],calibration[j*2+1]),d=pm(b,calibration[j*2],calibration[j*2+1]);if(s[3]>0&&d[3]>0)pairs.push([color(s),color(d)]);}for(let c=0;c<3;c++)if(pairs.length){const x=pairs.reduce((s,p)=>s+p[0][c],0)/pairs.length,y=pairs.reduce((s,p)=>s+p[1][c],0)/pairs.length,xx=pairs.reduce((s,p)=>s+p[0][c]**2,0)/pairs.length,xy=pairs.reduce((s,p)=>s+p[0][c]*p[1][c],0)/pairs.length;gain[c]=xx-x*x>2**-20?(xy-x*y)/(xx-x*x):1;offset[c]=y-x*gain[c];}}
 return map(a,(s,c,x,y)=>{if(name==='channelCombine'||name==='channelDecode')return s;if(name==='crossBlur'){const sigma=.6,r=2,raw=Array.from({length:5},(_,j)=>Math.exp(-.5*((j-2)/sigma)**2)),sum=raw.reduce((x,y)=>x+y,0),v=[0,0,0,0];for(let j=-r;j<=r;j++){const u=pm(a,x+j,y),z=pm(a,x,y+j);for(let k=0;k<4;k++)v[k]+=(u[k]+z[k])*.5*raw[j+r]/sum;}return s.map((q,j)=>q+(v[j]-q)*amount);}
 if(name==='fastRadialBlur'||name==='vectorBlur'){const samples=5,dx=name==='vectorBlur'?.5:x-(w-1)/2,dy=name==='vectorBlur'?-.25:y-(h-1)/2,v=[0,0,0,0],length=name==='vectorBlur'?1:.2;for(let j=0;j<samples;j++){const q=sample(a,x+dx*(j/4-.5)*length,y+dy*(j/4-.5)*length);for(let k=0;k<4;k++)v[k]+=q[k]/samples;}return s.map((q,j)=>q+(v[j]-q)*amount);}
 if(name==='noiseAlpha'){const n=random(x,y,(71^Math.imul(frame,0x9e3779b9))>>>0)*2-1,alpha=clamp(s[3]+.1*n),v=s[3]>0?[...c.slice(0,3).map(v=>v*alpha),alpha]:[...s.slice(0,3),alpha];return s.map((q,j)=>q+(v[j]-q)*amount);}
 if(s[3]===0)return s;let v=c.slice(0,3);
 switch(name){
 case 'motionDeblur':v=color(pm(current,x,y)).slice(0,3);break;
 case 'channelCalculations':v=Array(3).fill(lum(c)-color(pm(b,x,y))[2]);break;
 case 'colorNeutralize':{const probe=color(pm(a,Math.floor((w-1)/2+.5),Math.floor((h-1)/2+.5))),l=lum(probe);v=v.map((x,j)=>x*(Math.abs(probe[j])>2**-10?l/probe[j]:1));break;}
 case 'colorOffsetCycle':v=v.map((x,j)=>mod(x+[.1,.2,.3][j],1));break;
 case 'colorama':{const colors=[[-.2,.1,1.2],[1.5,-.1,.2],[.1,1.1,-.3]],at=mod(lum(c)*1.2+.1,1)*3,i=Math.floor(at),f=at-i;v=colors[i].map((x,j)=>x*(1-f)+colors[(i+1)%3][j]*f);break;}
 case 'colorMatch':v=v.map((x,j)=>mb.mean[j]+(x-ma.mean[j])*Math.sqrt(mb.variance[j]/Math.max(ma.variance[j],2**-20)));break;
 case 'colorStabilize':v=v.map((x,j)=>x*gain[j]+offset[j]);break;
 case 'matchGrain':v=v.map((z,j)=>z+Math.sqrt(Math.max(0,mb.variance[j]-ma.variance[j])*6)*(random(x,y,71+j*13)+random(x,y,78+j*13)-1));break;
 case 'noiseHls':{const seed=(71^Math.imul(frame,0x9e3779b9))>>>0,q=hslEncode(c);q[0]+=.03*(random(x,y,seed)*2-1);q[1]=clamp(q[1]+.03*(random(x,y,(seed+13)>>>0)*2-1));q[2]=clamp(q[2]+.03*(random(x,y,(seed+7)>>>0)*2-1));v=hslDecode(q);break;}
 case 'lightBurst':{const total=[0,0,0];for(let j=0;j<5;j++){const q=color(sample(a,x-(x-(w-1)/2)*j/4*.3,y-(y-(h-1)/2)*j/4*.3));for(let k=0;k<3;k++)total[k]+=q[k]/5;}v=v.map((x,j)=>x+total[j]*.2);break;}
 case 'lightSweep':{const d=Math.abs((x-(w-1)/2)*Math.SQRT1_2+(y-(h-1)/2)*Math.SQRT1_2),t=clamp(1-d/2);v=v.map(x=>x+.5*t*t);break;}
 case 'eyedropperFill':{const q=color(pm(a,Math.floor((w-1)/2+.5),Math.floor((h-1)/2+.5)));if(q[3]>0)v=q.slice(0,3);break;}
 default:throw Error('Unknown reference '+name);
 }return [...c.slice(0,3).map((x,j)=>(x+(v[j]-x)*amount)*s[3]),s[3]];
 },half).p;
}
