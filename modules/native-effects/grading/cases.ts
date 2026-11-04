import {keyframes} from '../../../src/core/animation.ts';
import {defineLut,cubeLut} from './control.ts';
import type {NativeGradingRecipeFilters} from './filters.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {LutEncoding,Curve} from './types.ts';
import {nativeGradingNames} from './types.ts';
export type GradeName=typeof nativeGradingNames[number];
export const animatedAmount=keyframes([{frame:0,value:.7},{frame:239,value:1}]);
export const lumaPoints=[[-4,-3],[-.1,-.08],[.18,.2],[1,1.1],[4,3.8]] as const;
export const huePoints=[[0,0],[90,15],[180,-10],[270,20],[360,0]] as const;
export const hueGain=[[0,1],[90,.8],[180,1.2],[270,.9],[360,1]] as const;
export const saturationPoints=[[0,0],[.2,.25],[.8,.9],[4,3.8]] as const;
export const luminanceGain=[[-4,.8],[0,.9],[.18,1.1],[1,1],[4,.85]] as const;
export const saturationGain=[[0,1],[.2,1.1],[1,.8],[4,.9]] as const;
export function lookTables(encoding:LutEncoding='linear'){
 const lo=encoding==='linear'?-1:-.2,hi=encoding==='linear'?3:1.2,rows=Array.from({length:5},(_,i)=>{const x=lo+(hi-lo)*i/4;return [x*.98+.01*x*x,x*1.02-.005*x*x,x*.99+.008*x*x];}),text=`TITLE "Frameweave editable look"\nLUT_1D_SIZE 5\nDOMAIN_MIN ${lo} ${lo} ${lo}\nDOMAIN_MAX ${hi} ${hi} ${hi}\n`+rows.map(r=>r.join(' ')).join('\n'),one=cubeLut(text,{inputEncoding:encoding,outputEncoding:encoding}),values:number[]=[];
 for(let b=0;b<3;b++)for(let g=0;g<3;g++)for(let r=0;r<3;r++){const x=lo+(hi-lo)*r/2,y=lo+(hi-lo)*g/2,z=lo+(hi-lo)*b/2;values.push(x*.98+.01*y*z,y*1.01-.005*x*z,z*.99+.008*x*y);}
 return {one,three:defineLut({kind:'3d',size:3,domainMin:[lo,lo,lo],domainMax:[hi,hi,hi],values},{inputEncoding:encoding,outputEncoding:encoding})};
}
export async function callGrade(name:GradeName,f:NativeGradingRecipeFilters,image:GpuPixelImage,frame:number,tables:ReturnType<typeof lookTables>){switch(name){
 case 'lut1D':return f.lut1D(image,tables.one,{interpolation:frame%3===2?'nearest':'linear',domain:frame%2?'clamp':'extend',amount:animatedAmount});
 case 'lut3D':return f.lut3D(image,tables.three,{interpolation:(['tetrahedral','linear','nearest'] as const)[frame%3],domain:frame%2?'clamp':'extend',amount:animatedAmount});
 case 'cdl':return f.cdl(image,{slope:[1.02,.98,1.01],offset:[.01,-.02,.005],power:[1.05,.95,1.02],saturation:.9,direction:frame%2?'inverse':'forward',style:frame%3===2?'clamp':'no-clamp'});
 case 'whiteBalance':return f.whiteBalance(image,{sourceWhite:[.3127,.329],targetWhite:[.34567,.3585]});
 case 'liftGammaGain':return f.liftGammaGain(image,{lift:[.01,-.02,.015],gamma:[1.05,.95,1.1],gain:[1.02,.98,1.01]});
 case 'printerLights':return f.printerLights(image,{points:[.5,-.25,.125],pointsPerStop:12});
 case 'contrastPivot':return f.contrastPivot(image,{contrast:1.1,pivot:.18});
 case 'logContrast':return f.logContrast(image,{contrast:1.05,pivot:.18,toe:.03});
 case 'lumaCurve':return f.lumaCurve(image,{points:lumaPoints});
 case 'hueVsHue':return f.hueVsHue(image,{points:huePoints});
 case 'hueVsSaturation':return f.hueVsSaturation(image,{points:hueGain});
 case 'hueVsLuminance':return f.hueVsLuminance(image,{points:hueGain});
 case 'saturationVsSaturation':return f.saturationVsSaturation(image,{points:saturationPoints});
 case 'luminanceVsSaturation':return f.luminanceVsSaturation(image,{points:luminanceGain});
 case 'saturationVsLuminance':return f.saturationVsLuminance(image,{points:saturationGain});
 case 'colorWheels':return f.colorWheels(image,{shadows:[.05,-.025,.02],midtones:[-.02,.04,.01],highlights:[.03,.01,-.02],white:1.5});
 case 'splitTone':return f.splitTone(image,{shadows:[.02,-.01,.03],highlights:[.03,.01,-.02],balance:.2,width:1.2});
 case 'highlightRolloff':return f.highlightRolloff(image,{threshold:.8,softness:2.1});
 case 'shadowRolloff':return f.shadowRolloff(image,{threshold:.1,softness:.3});
 case 'gamutCompress':return f.gamutCompress(image,{threshold:[.7,.8,.75],limit:[1.3,1.2,1.4],power:2});
 case 'bleachBypass':return f.bleachBypass(image,{saturation:.4,pivot:.8,amount:.15});
}}
