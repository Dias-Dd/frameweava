import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeStylizeFilters} from './types.ts';
import {nativeStylizeNames} from './types.ts';
export type StyleName=typeof nativeStylizeNames[number];
export const styleAmount=keyframes([{frame:0,value:.6},{frame:239,value:1}]);
export const fixturePalette=[[-.2,.4,1.5],[.4,-.1,.2],[2,.5,-.2]] as const;
export async function callStyle(name:StyleName,f:NativeStylizeFilters,i:GpuPixelImage,height:GpuPixelImage){const ink={ink:[-.15,.1,.05] as const,paper:[1.6,.8,.5] as const},relief={strength:3,azimuth:135,elevation:40,ambient:.3,diffuse:.7,specular:.4,shininess:5};switch(name){
 case 'mosaicMean':return f.mosaicMean(i,{blockSize:3});
 case 'adaptiveMosaic':return f.adaptiveMosaic(i,{blockSize:3,variance:.012});
 case 'crystallize':return f.crystallize(i,{cellSize:3.1,jitter:.8,seed:0xf1234567});
 case 'stainedGlass':return f.stainedGlass(i,{cellSize:3.1,jitter:.8,seed:0xf1234567,edgeWidth:.7});
 case 'pointillism':return f.pointillism(i,{cellSize:3.1,jitter:.8,seed:0xf1234567});
 case 'lumaHalftone':return f.lumaHalftone(i,{period:4.7,angle:21});
 case 'colorHalftone':return f.colorHalftone(i,{period:4.7,angles:[15,45,75]});
 case 'crosshatch':return f.crosshatch(i,{...ink,period:4.3,lineWidth:.4,strength:.8});
 case 'engraving':return f.engraving(i,{...ink,period:3.7,lineWidth:.8,angle:17,strength:.7});
 case 'pencilSketch':return f.pencilSketch(i,{...ink,radius:.6,epsilon:.003,strength:.9});
 case 'charcoal':return f.charcoal(i,{...ink,radius:.6,grain:.08,strength:1.3,seed:71});
 case 'lineArt':return f.lineArt(i,{...ink,threshold:.03,softness:.05,strength:1.4});
 case 'cartoon':return f.cartoon(i,{ink:ink.ink,threshold:.04,softness:.03,levels:4,strength:1.1});
 case 'oilPaint':return f.oilPaint(i,{radius:1,bins:6});
 case 'watercolor':return f.watercolor(i,{radius:.6,bleed:.5,granulation:.1,edgeRetention:.06,seed:71});
 case 'brushStrokes':return f.brushStrokes(i,{cellSize:3,length:3.2,samples:7,angle:23,angleJitter:17,jitter:.8,coverage:.7,seed:71});
 case 'glassRelief':return f.glassRelief(i,height,{...relief,refraction:2.5});
 case 'plasticRelief':return f.plasticRelief(i,relief);
 case 'solarize':return f.solarize(i,{threshold:.5,amount:styleAmount});
 case 'paletteQuantize':return f.paletteQuantize(i,{colors:fixturePalette});
}}
