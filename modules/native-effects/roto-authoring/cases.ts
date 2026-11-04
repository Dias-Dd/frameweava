import type {NativePaintFilters,BrushStroke,Brush,Output} from './types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {nativePaintNames} from './filters.ts';
export type PaintName=typeof nativePaintNames[number];
export const fixtureStroke=(w:number,h:number):BrushStroke=>({id:'ink',points:[{id:'start',position:[w*.2,h*.3],pressure:.3},{id:'middle',position:[w*.55,h*.8],pressure:.85},{id:'end',position:[w*.85,h*.35],pressure:.6}]});
export const fixtureBrush=(frame:number):Brush=>({radius:2.3,spacing:.45,hardness:.6,roundness:.65,angle:25,flow:.35,opacity:.7,color:[1.8,-.2,.7],minimumSize:.2,flowPressure:true,amount:.6+.3*frame/239,start:.1,end:.9});
export async function callPaint(name:PaintName,f:NativePaintFilters,image:GpuPixelImage,reference:GpuPixelImage,mask:GpuPixelImage,w:number,h:number,frame:number,publish:(name:string,b:GpuDataBuffer)=>Promise<void>){const stroke=fixtureStroke(w,h),o=fixtureBrush(frame);
 switch(name){
 case 'paintStroke':return f.paintStroke(image,stroke,o);
 case 'airbrushStroke':return f.airbrushStroke(image,stroke,{...o,exposure:1.7});
 case 'bristleStroke':return f.bristleStroke(image,stroke,{...o,fibres:5,spread:.7});
 case 'dryBrushStroke':return f.dryBrushStroke(image,stroke,{...o,roughness:.3,grainSize:1.5,seed:71});
 case 'scatterStroke':return f.scatterStroke(image,stroke,{...o,scatter:.6,rotationJitter:30,sizeJitter:.2,seed:71});
 case 'cloneStroke':return f.cloneStroke(image,reference,stroke,{...o,offset:[.4,-.3]});
 case 'healStroke':return f.healStroke(image,reference,stroke,{...o,offset:[.4,-.3],sigma:.8,strength:.7});
 case 'smudgeStroke':return f.smudgeStroke(image,stroke,{...o,strength:.65});
 case 'wetMixStroke':return f.wetMixStroke(image,stroke,{...o,strength:.65,wetness:.7,pickup:.25});
 case 'eraseStroke':return f.eraseStroke(image,stroke,o);
 case 'dodgeBurnStroke':return f.dodgeBurnStroke(image,stroke,{...o,exposure:-1.3});
 case 'brushHeight':{const {amount:_,...base}=o,height=await f.brushHeight(image,stroke,{...base,height:.7});await publish('height',height.buffer);return f.paintRelief(image,height,{amount:o.amount});}
 case 'paintRelief':{const height=await f.brushHeight(image,stroke,{radius:3,spacing:.3,height:.4});return f.paintRelief(image,height,{depth:1.4,ambient:.3,diffuse:.7,specular:.2,roughness:.4,color:[1.1,.3,.1],amount:o.amount});}
 case 'traceContours':{const trace=await f.traceContours(mask,{threshold:.5});for(const n of ['vertices','edges','valid'] as const)await publish('trace-'+n,trace[n]);return f.contourStroke(image,trace,{width:1.6,feather:.8,color:[1.2,-.1,.6],opacity:.65,amount:o.amount});}
 case 'contourStroke':{const trace=await f.traceContours(mask,{threshold:.3});return f.contourStroke(image,trace,{width:2.2,feather:0,color:[.3,1.4,-.2],opacity:.7,amount:o.amount});}
 case 'autoScribble':return f.autoScribble(image,mask,{angle:30,spacing:4,width:1.2,wiggle:.7,frequency:.3,phase:.2,threshold:.3,color:[1.3,-.2,.5],opacity:.7,amount:o.amount});
 }
}
