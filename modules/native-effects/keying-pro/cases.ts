import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {NativeProKeyFilters,RotoStroke} from './types.ts';
export const animated=keyframes([{frame:0,value:.75},{frame:239,value:1.15}]);
export const strokes=(w:number,h:number):RotoStroke[]=>[{points:[[.5,.5],[.5,h-.5]],radius:.2,label:'background'},{points:[[w-.5,.5],[w-.5,h-.5]],radius:.2,label:'foreground'}];
export const grade={hue:37,lift:[-.03,.02,.01],gamma:[.9,1.1,1.05],gain:[1.2,.9,1.1],saturation:.8,contrast:1.1,pivot:.18,exposure:.2} as const;
export async function callKey(name:string,f:NativeProKeyFilters,image:GpuPixelImage,matte:GpuPixelImage,other:GpuPixelImage,guide:GpuPixelImage,flow:GpuDataBuffer,w:number,h:number,publish:(b:GpuDataBuffer)=>Promise<void>){switch(name){
case 'screenMatte':return f.screenMatte(image,{alphaBias:[1.2,.9,1.1],gain:animated,balance:.6,preblurSigma:.4});
case 'matteClipRollback':return f.matteClipRollback(matte,{black:.15,white:.85,rollback:.3,gamma:1.1});
case 'matteTone':return f.matteTone(matte,{midpoint:.4,shadows:.8,midtones:1.2,highlights:.95});
case 'matteGarbage':return f.matteGarbage(matte,image,other,guide,{insideComponent:'inverted-luma',outsideComponent:'alpha',sourceAlpha:'normal'});
case 'matteDespot':return f.matteDespot(matte,{blackRadius:1,whiteRadius:.5});
case 'keyUnmix':return f.keyUnmix(image,matte,{screen:[.1,.9,-.1],strength:.8});
case 'keyReplace':return f.keyReplace(image,other,guide,matte,{method:'soft-color',color:[1.3,.2,-.1]});
case 'keyBias':return f.keyBias(image,{bias:[1.2,.9,1.1]});
case 'spillBias':return f.spillBias(image,{bias:[1.2,.9,1.1],screen:'green',amount:.7});
case 'foregroundGrade':return f.foregroundGrade(image,grade);
case 'edgeGrade':return f.edgeGrade(image,matte,grade);
case 'keyStatus':return f.keyStatus(matte,{epsilon:.05});
case 'keyDifference':return f.keyDifference(image,other);
case 'hairMatte':return f.hairMatte(image,other,guide,{epsilon:.001});
case 'refineBand':return f.refineBand(matte,{inside:2.3,outside:1.1});
case 'temporalMatte':return f.temporalMatte(matte,other,image,guide,flow,{amount:.7,colourTolerance:1.7,confidenceThreshold:.3});
case 'matteVectorBlur':return f.matteVectorBlur(matte,flow,{open:-.2,close:.4,samples:7});
case 'strokeTrimap':{const t=await f.strokeTrimap(image,strokes(w,h));await publish(t.buffer);return image;}
case 'randomWalkerMatte':{const t=await f.strokeTrimap(image,strokes(w,h));const solved=await f.randomWalkerMatte(image,t,{iterations:64,beta:2,priorWeight:.1,tolerance:1e-4});await publish(solved.diagnostics);return solved.image;}
case 'keyCrop':return f.keyCrop(image,{left:w>2?1:0,right:w,top:0,bottom:h>2?h-1:h,x:'reflect',y:'color',color:[1.2,-.1,.3],alpha:.3});
case 'keyAdvanced':return f.keyAdvanced(image,{black:.1,white:.9,rollback:.2,gamma:1.1,midpoint:.4,shadows:.9,midtones:1.1,highlights:1,grow:.3,softness:.4,blackRadius:.5,whiteRadius:.2,screenReplace:'soft-color',screenReplaceColor:[1.2,.3,-.1],insideReplace:'source',inside:other,outside:guide,foreground:grade,edge:{...grade,saturation:.5},edgeWidth:2.3,despill:.5,despillBias:[1,.8,.9],useAlphaBiasForDespill:false});
default:throw Error('Unknown pro key method '+name);}}
