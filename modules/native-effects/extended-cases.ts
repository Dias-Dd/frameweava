// Acceptance fixtures only: typed calls paired with existing independent oracles.
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {NativeProfessionalFilters} from './extended.ts';
import {cases as foundationCases} from '../gpu-image-effects/resident/foundations/cases.ts';
import {evaluate,quantize} from '../gpu-image-effects/resident/foundations/reference.ts';
import * as R from '../gpu-image-effects/resident/validation/reference.ts';
import * as M from '../gpu-image-effects/resident/validation/matte-reference.ts';
import {noise as uintNoise} from '../gpu-image-effects/resident/creative/reference.ts';
import {unavailableNativeImageMethods} from './extended.ts';
interface Case {name:string;apply:(image:GpuPixelImage,fx:NativeProfessionalFilters)=>Promise<GpuPixelImage>;reference:(pixels:Float32Array,w:number,h:number)=>Float32Array}
const alpha=(p:Float32Array)=>Float32Array.from({length:p.length/4},(_,i)=>p[i*4+3]);

export const extendedCases:readonly Case[]=[
 ...foundationCases.filter(c=>!unavailableNativeImageMethods.some(n=>n===c.name)).map(c=>({name:c.name,apply:(i:GpuPixelImage,fx:NativeProfessionalFilters)=>c.apply(i,fx,i),reference:(pixels:Float32Array,width:number,height:number)=>quantize(evaluate(c.name,{pixels,width,height},c.options))})),
 {name:'channelMix',apply:(i,f)=>f.channelMix(i,{matrix:[[1,.2,-.1],[0,1,0],[-.3,0,2]],offset:[.1,0,-.2]}),reference:p=>R.mapPixels(p,v=>R.mix(v,[[1,.2,-.1],[0,1,0],[-.3,0,2]],[.1,0,-.2]))},
 {name:'levels',apply:(i,f)=>f.levels(i,{outputWhite:[1.2,.9,1.1],gamma:[1.1,1,1.2]}),reference:p=>R.mapPixels(p,v=>R.level(v,[1.2,.9,1.1],[1.1,1,1.2]))},
 {name:'curves',apply:(i,f)=>f.curves(i,{red:[[0,0],[.5,.55],[1,1]]}),reference:p=>R.mapPixels(p,R.curve)},
 {name:'unsharpMask',apply:(i,f)=>f.unsharpMask(i,{radius:.8,amount:1.25}),reference:(p,w,h)=>R.unsharp(p,w,h,.8,1.25)},
 {name:'lumaKey',apply:(i,f)=>f.lumaKey(i,{low:.05,high:.8}),reference:p=>R.mapPixels(p,v=>R.key(v,'luma',.05,.8))},
 {name:'chromaKey',apply:(i,f)=>f.chromaKey(i,{inner:.1,outer:1.5}),reference:p=>R.mapPixels(p,v=>R.key(v,'chroma',.1,1.5))},
 {name:'despill',apply:(i,f)=>f.despill(i,{amount:.5}),reference:p=>R.mapPixels(p,v=>R.spill(v))},
 {name:'extractMatte',apply:(i,f)=>f.extractMatte(i),reference:p=>M.maskPixels(alpha(p))},
 {name:'morphology',apply:(i,f)=>f.morphology(i,{operation:'close',radius:1.5}),reference:(p,w,h)=>M.maskPixels(M.morphology(alpha(p),w,h,1.5,'close'))},
 {name:'featherMatte',apply:(i,f)=>f.featherMatte(i,{radius:1.1}),reference:(p,w,h)=>M.maskPixels(M.feather(alpha(p),w,h,1.1))},
 {name:'matteLevels',apply:(i,f)=>f.matteLevels(i,{black:.1,white:.9,gamma:1.2,invert:true}),reference:p=>M.maskPixels(M.levels(alpha(p),.1,.9,1.2,true))},
 {name:'applyMatte',apply:(i,f)=>f.applyMatte(i,i),reference:p=>M.apply(p,alpha(p))},
];
export function extendedChainReference(pixels:Float32Array,width:number,height:number,frame:number,half:boolean){
 const q=(p:ArrayLike<number>)=>quantize(p,half),foundation=(name:string,p:Float32Array,o:Parameters<typeof evaluate>[2])=>q(evaluate(name,{pixels:p,width,height},o));
 let p=foundation('exposure',pixels,{stops:.15});p=q(R.mapPixels(p,v=>R.mix(v,[[1,.02,0],[0,1,0],[0,0,1]])));p=q(R.mapPixels(p,v=>R.level(v))); // identity curves are an explicit publication
 p=q(p);p=q(R.unsharp(p,width,height,.8,.3));p=q(R.mapPixels(p,v=>R.spill(v,.2)));
 // The old foundation oracle treats every numeric option as F32; a frame-XOR
 // uint32 seed must not pass through that helper (large seeds lose low bits).
 const seed=(17^Math.imul(frame,0x85ebca6b))>>>0,previous=p;
 p=q(Float32Array.from(previous,(v,i)=>i%4===3?v:Math.fround(v+Math.fround((uintNoise(Math.floor(i/4)%width,Math.floor(i/4/width),seed)*2-1)*Math.fround(.001))*previous[i-i%4+3])));
 p=foundation('videoLimiter',p,{black:-2,white:4});
 const extracted=q(M.maskPixels(alpha(p))),closed=q(M.maskPixels(M.morphology(alpha(extracted),width,height,1.5,'close'))),soft=q(M.maskPixels(M.feather(alpha(closed),width,height,.8)));
 return q(M.apply(p,alpha(soft)));
}
