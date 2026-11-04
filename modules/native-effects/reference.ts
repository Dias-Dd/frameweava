// Test-only reuse of the existing independent F64 equations. Never bundled into
// a production Stage or the effect initializer.
import * as C from '../gpu-image-effects/resident/creative/reference.ts';
import * as B from '../gpu-image-effects/resident/blends/reference.ts';
export function referenceEffect(index:number,a:C.Field,original:C.Field,frame:number,half=false):C.Field{switch(index){
 case 0:return C.brightnessContrast(a,.02,1.01+frame/10000,.5,half);
 case 1:return C.tint(a,[-.02,.01,.03],[1.1,.9,.7],.01,false,half);
 case 2:return C.tritone(a,[-.02,.01,.04],[.5,.4,.2],[1.2,.9,.6],.01,false,half);
 case 3:return C.colorBalance(a,[.01,-.01,.005],[0,.01,-.005],[.005,0,-.005],true,half);
 case 4:return C.blackAndWhite(a,[.4,.6,.4,.6,.2,.8],.02,half);
 case 5:return C.filmGrain(a,.004,37,frame,true,half);
 case 6:return C.vignette(a,[.5,.5],.75,.12,0,half);
 case 7:return C.sobelEdges(a,.005,[1,.5,.2],false,true,half);
 case 8:return C.reliefLighting(a,a,.002,35,false,true,half);
 case 9:return C.pixelate(a,[2,2],[0,0],half);
 default:{const names=['darken','lighten','difference','exclusion','overlay','hardLight','linearBurn','subtractBlend','linearLight','pinLight'] as const;return B.blend(names[index-10],original,a,index<12?.02:index<16?.01:index<19?.005:.01,half);}
}}
export function referencePixels(pixels:Float32Array,width:number,height:number,frame:number,index?:number,half=false){const original=C.sourceField(width,height,pixels);let image=original;if(index!==undefined)image=referenceEffect(index,image,original,frame,half);else for(let i=0;i<20;i++)image=referenceEffect(i,image,original,frame,half);return C.pixels(image);}
