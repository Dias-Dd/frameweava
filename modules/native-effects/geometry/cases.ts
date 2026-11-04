import {keyframes} from '../../../src/core/animation.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeGeometryFilters,Point} from './types.ts';
import {nativeGeometryNames} from './types.ts';
export const animatedTwirl=keyframes([{frame:0,value:10},{frame:239,value:50}]);
export function grid(w:number,h:number):Point[]{return Array.from({length:9},(_,i)=>[i%3*w/2+(i===4?.4:0),Math.floor(i/3)*h/2+(i===4?-.3:0)] as const);}
export function edges(w:number,h:number){return {top:[[0,0],[w/3,.3],[w*2/3,.2],[w,0]],right:[[w,0],[w-.2,h/3],[w+.1,h*2/3],[w,h]],bottom:[[w,h],[w*2/3,h-.3],[w/3,h+.2],[0,h]],left:[[0,h],[.2,h*2/3],[-.1,h/3],[0,0]],subdivisions:6} as const;}
export async function callGeometry(name:typeof nativeGeometryNames[number],f:NativeGeometryFilters,i:GpuPixelImage,frame:number,chain=false){const {width:w,height:h}=i.info,c=[w/2,h/2] as const;
 switch(name){
  case 'resample':return f.resample(i,{width:chain?w:21,height:chain?h:9,method:'lanczos3',boundary:'clamp'});
  case 'homographyWarp':return f.homographyWarp(i,{matrix:[1,.015,-.125,-.01,1,.2,.0003,-.0002,1]});
  case 'cornerPin':return f.cornerPin(i,{corners:[[.25,.25],[w-.7,.4],[w-.1,h-.3],[.4,h-.2]]});
  case 'twirl':return f.twirl(i,{angle:animatedTwirl,radius:Math.min(w,h)*.7});
  case 'spherize':return f.spherize(i,{radius:Math.min(w,h)*.47});
  case 'bulge':return f.bulge(i,{radii:[w*.6,h*.7],height:.38,taper:1.5,pinEdges:true});
  case 'waveWarp':return f.waveWarp(i,{height:.375,wavelength:7.3,direction:31,phase:13,speed:.1,time:frame/24,pin:'all'});
  case 'ripple':return f.ripple(i,{radius:Math.max(w,h)*.6,height:.2,wavelength:4.3,phase:18,speed:.1,time:frame/24,asymmetric:true});
  case 'mirrorWarp':return f.mirrorWarp(i,{angle:23});
  case 'offset':return f.offset(i,{offset:[-.375,.625]});
  case 'polarCoordinates':return f.polarCoordinates(i,{amount:.38});
  case 'turbulentDisplace':return f.turbulentDisplace(i,{amount:.2,size:4.3,octaves:3.5,evolution:frame/240,seed:17});
  case 'opticsCompensation':return f.opticsCompensation(i,{fieldOfView:40});
  case 'magnify':return f.magnify(i,{radius:Math.min(w,h)*.4,magnification:1.3,feather:1,opacity:.8});
  case 'meshWarp':return f.meshWarp(i,{columns:2,rows:2,destination:grid(w,h),subdivisions:2});
  case 'bezierWarp':return f.bezierWarp(i,edges(w,h));
  case 'bend':return f.bend(i,{start:[w/2,1],end:[w/2,h-1],angle:12});
  case 'lensWarp':return f.lensWarp(i,{radius:w*.55,convergence:1.2});
  case 'tiler':return f.tiler(i,{scale:[.87,1.13],rotation:11});
  case 'griddler':return f.griddler(i,{tileSize:6,scale:[1.2,.8],rotation:12,gap:.1});
  case 'lensDistortion':return f.lensDistortion(i,{radial:[.02,-.003,.0002],tangential:[.001,-.002]});
  case 'liquify':return f.liquify(i,{brushes:[{kind:'push',center:c,radius:6,amount:.4,offset:[.5,-.25]},{kind:'twirl',center:c,radius:5,amount:5},{kind:'pinch',center:c,radius:4,amount:.15}]});
  case 'kaleidoscope':return f.kaleidoscope(i,{segments:5,rotation:17});
  case 'cylinderWarp':return f.cylinderWarp(i,{radius:w*.7,angle:5});
 }
}
