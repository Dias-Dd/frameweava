// Acceptance-only F64 equations. No production Stage imports this module.
import {gamutMatrix,transformPixels} from '../../../src/media/color.ts';
import {linear709,fromHalf,toHalf,type ColorEncoding,type AlphaMode} from '../../../src/media/surface.ts';
import type {Json} from '../../../src/core/types.ts';
export const quantize=(p:ArrayLike<number>,half=false)=>Float32Array.from(p,v=>half?fromHalf(toHalf(Math.fround(v))):v);
export function statisticsReference(name:string,input:Float32Array,alpha:AlphaMode,color:ColorEncoding,o:Record<string,Json>={},half=false){
 const F=Math.fround,amount=F(typeof o.amount==='number'?o.amount:1),black=F(typeof o.outputBlack==='number'?o.outputBlack:0),white=F(typeof o.outputWhite==='number'?o.outputWhite:1),bins=typeof o.bins==='number'?o.bins:256;
 const m=gamutMatrix(color,linear709),weights=[0,1,2].map(c=>.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c]),luma=(p:readonly number[])=>p.reduce((s,v,c)=>s+v*weights[c],0),colors:number[][]=[];
 for(let at=0;at<input.length;at+=4)if(input[at+3]>0)colors.push([0,1,2].map(c=>input[at+c]/(alpha==='premultiplied'?input[at+3]:1)));
 const means=[0,1,2].map(c=>colors.reduce((s,p)=>s+p[c],0)/Math.max(1,colors.length)),lo=[0,1,2].map(c=>Math.min(...colors.map(p=>p[c]))),hi=[0,1,2].map(c=>Math.max(...colors.map(p=>p[c]))),ys=colors.map(luma),minY=Math.min(...ys),maxY=Math.max(...ys),cdfs:number[][]=[];
 if(name==='equalize')for(let c=0;c<3;c++){const hist=new Array<number>(bins).fill(0);for(const p of colors)hist[hi[c]===lo[c]?0:Math.max(0,Math.min(bins-1,Math.floor((p[c]-lo[c])/(hi[c]-lo[c])*bins)))]++;const first=hist.find(n=>n>0)??0;let sum=0;cdfs.push(hist.map(n=>{sum+=n;return colors.length>first?F(Math.max(0,sum-first)/(colors.length-first)):0;}));}
 const out=new Float32Array(input.length);for(let at=0;at<input.length;at+=4){const a=input[at+3];out[at+3]=a;for(let c=0;c<3;c++){const pm=alpha==='straight'?F(input[at+c]*a):input[at+c];if(a===0||colors.length===0){out[at+c]=pm;continue;}let value=pm/a;const low=name==='autoContrast'?minY:lo[c],high=name==='autoContrast'?maxY:hi[c];if(name==='autoColor'){if(means[c]!==0)value*=luma(means)/means[c];}else if(high>low){let coord=(value-low)/(high-low);if(name==='equalize')coord=cdfs[c][Math.max(0,Math.min(bins-1,Math.floor(coord*bins)))];value=black+coord*(white-black);}out[at+c]=pm*(1-amount)+value*a*amount;}}
 return quantize(out,half);
}
export function colorChainReference(source:Float32Array,alpha:AlphaMode,color:ColorEncoding,frame:number,half=false){let out=transformPixels(source,color,linear709,alpha).pixels;const stops=frame<=119?.3*frame/119:.3+(.1-.3)*(frame-119)/120,gain=Math.fround(2**stops);for(let at=0;at<out.length;at+=4)for(let c=0;c<3;c++)out[at+c]*=gain;out=quantize(out,half);
 out=statisticsReference('autoColor',out,alpha,linear709,{amount:.3},half);
 out=statisticsReference('autoContrast',out,'premultiplied',linear709,{amount:.25,outputBlack:-.2,outputWhite:2},half);
 out=statisticsReference('equalize',out,'premultiplied',linear709,{bins:17,amount:.2,outputBlack:-.2,outputWhite:2},half);
 out=statisticsReference('autoLevels',out,'premultiplied',linear709,{amount:.2,outputBlack:-.1,outputWhite:2},half);
 for(let at=0;at<out.length;at+=4)out[at]=out[at]+Math.fround(.02)*out[at+1];return quantize(out,half);
}
