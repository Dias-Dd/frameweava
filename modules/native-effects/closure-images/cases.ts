import {keyframes} from '../../../src/core/animation.ts';
import type {PathData,PathCommand} from '../../graphics-contracts/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {NativeClosureImageFilters} from './types.ts';
export const amount=keyframes([{frame:0,value:.65},{frame:239,value:.95}]);
export function fixturePath(w:number,h:number,curve=false):PathData{let n=0;const point=(x:number,y:number)=>({id:'p'+n++,x,y});const commands:PathCommand[]=[{op:'M',point:point(w*.1,h*.1)},{op:'L',point:point(w*.9,h*.1)},{op:'L',point:point(w*.9,h*.9)},curve?{op:'Q',control:point(w*.5,h*.65),point:point(w*.1,h*.9)}:{op:'L',point:point(w*.1,h*.9)},{op:'Z'},{op:'M',point:point(w*.4,h*.4)},{op:'L',point:point(w*.6,h*.4)},{op:'L',point:point(w*.6,h*.6)},{op:'L',point:point(w*.4,h*.6)},{op:'Z'}];return {schema:'frameweave.path',version:1,id:'fixture-path',coordinates:{spaceId:'image',unit:'px',origin:'top-left',x:'right',y:'down',width:w,height:h},fillRule:'evenodd',commands};}
export function warpControls(w:number,h:number){return {destination:[[0,0],[w,0],[w,h],[0,h],[w*.5,h*.5]],source:[[0,0],[w,0],[w,h],[0,h],[w*.53,h*.48]]} as const;}
export async function callImage(name:string,f:NativeClosureImageFilters,s:GpuPixelImage,d:GpuPixelImage,fields:{labels:GpuDataBuffer;spectrum:GpuDataBuffer;samples:GpuDataBuffer},w:number,h:number){const o={amount},from=[w*.1,h*.2] as const,to=[w*.85,h*.75] as const;switch(name){
 case 'blobbylize':return f.blobbylize(s,d,{...o,radius:.6,strength:1.3,threshold:.1});
 case 'floMotion':return f.floMotion(s,{...o,first:[w*.3,h*.4],second:[w*.7,h*.6],pull:[.2,-.1],radius:Math.max(1,Math.min(w,h)*.7),falloff:2});
 case 'pageTurn':return f.pageTurn(s,{...o,fold:[w*.65,h*.55],direction:35,radius:Math.max(.5,Math.min(w,h)*.15),lightDirection:125,backOpacity:.3,paper:[1.2,-.1,.5]});
 case 'ripplePulse':return f.ripplePulse(s,{...o,radius:Math.min(w,h)*.5,speed:4,span:2,wavelength:3.7,strength:.4});
 case 'slantWarp':return f.slantWarp(s,{...o,slant:.13,scale:[1.03,.97]});
 case 'smearWarp':return f.smearWarp(s,{...o,from,to,reach:.3,radius:Math.max(1,Math.min(w,h)*.4)});
 case 'splitWarp':return f.splitWarp(s,{...o,from,to,reach:.17,opposite:.13,radius:Math.max(1,Math.min(w,h)*.4)});
 case 'splitCorners':return f.splitCorners(s,{...o,gap:[.2,.3]});
 case 'reshapeWarp':return f.reshapeWarp(s,{...o,...warpControls(w,h)});
 case 'rollingShutterWarp':return f.rollingShutterWarp(s,{...o,top:[-.2,.1],bottom:[.3,-.1],acceleration:[.4,-.2]});
 case 'envelopeWarp':return f.envelopeWarp(s,{...o,horizontal:[.1,.3,-.1],vertical:[-.1,.2,.1]});
 case 'blockLoad':return f.blockLoad(s,{...o,cellSize:3,progress:.55,seed:71});
 case 'burnFilm':return f.burnFilm(s,{...o,progress:.35,width:.3,seed:71,color:[2,.3,.01]});
 case 'hexTile':return f.hexTile(s,{...o,radius:3.2,scale:1.1});
 case 'smoothPosterize':return f.smoothPosterize(s,{...o,levels:3.7,softness:.8});
 case 'roughenEdges':return f.roughenEdges(s,{...o,amplitude:.4,feather:1.2,threshold:.5,seed:71});
 case 'scatter':return f.scatter(s,{...o,radius:.7,seed:71});
 case 'strobe':return f.strobe(s,{...o,period:5,duration:2,color:[1.2,-.1,.5]});
 case 'objectMatte':return f.objectMatte(s,fields.labels,{...o,ids:[0xf1234567,2]});
 case 'seededMatte':return f.seededMatte(s,{...o,foreground:[[w*.2,h*.25]],background:[[w-1,h-1]],tolerance:.8});
 case 'pathMatte':return f.pathMatte(s,fixturePath(w,h,true),{...o,tolerance:1e-6,feather:1.3});
 case 'ellipseMask':return f.ellipseMask(s,{...o,feather:1.1});
 case 'gridTexture':return f.gridTexture(s,{...o,cell:[3.2,4.3],width:.7,color:[1.2,-.1,.5],background:[-.2,.1,.3]});
 case 'beam':return f.beam(s,{...o,from,to,width:.8,softness:1.2,intensity:.7,color:[1.2,-.1,.5]});
 case 'lightning':return f.lightning(s,{...o,from,to,segments:7,displacement:1.1,seed:71,width:.8,softness:1.2,intensity:.7,color:[1.2,-.1,.5]});
 case 'threadsTexture':return f.threadsTexture(s,{...o,spacing:3.2,amplitude:.7,wavelength:5.7,width:.8,phase:.2,color:[1.2,-.1,.5],background:[-.2,.1,.3]});
 case 'radioWaves':return f.radioWaves(s,{...o,spacing:3.2,width:.7,phase:.2,color:[1.2,-.1,.5]});
 case 'pathStroke':return f.pathStroke(s,fixturePath(w,h),{...o,width:1.3,start:.05,end:.9,dash:[2.7,1.1],phase:.2,color:[1.2,-.1,.5]});
 case 'paintBucket':return f.paintBucket(s,{...o,seed:[w*.2,h*.25],tolerance:.8,color:[1.2,-.1,.5],opacity:.7});
 case 'spectrumBars':return f.spectrumBars(s,fields.spectrum,{...o,gain:1.2,gap:.17,color:[1.2,-.1,.5]});
 case 'waveformTrace':return f.waveformTrace(s,fields.samples,{...o,gain:.8,width:1.3,color:[1.2,-.1,.5]});
 case 'radialShadow':return f.radialShadow(s,{...o,light:[w*.2,h*.1],length:1.7,samples:5,opacity:.6,color:[-.1,.2,.3]});
 default:throw Error('Unknown closure image '+name);
}}
