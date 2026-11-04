import {keyframes} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {PathData,PathCommand} from '../../../../modules/graphics-contracts/types.ts';
import type {ZigzagPathOptions} from '../../../../modules/pro-animation/src/path-zigzag.ts';
export function scenePaths(width=640,height=240):PathData[]{
 const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width,height};
 const make=(id:string,commands:PathCommand[],fillRule:'nonzero'|'evenodd'='nonzero'):PathData=>({schema:'frameweave.path',version:1,id,coordinates,fillRule,commands});
 const point=(id:string,x:number,y:number)=>({id,x,y});
 const open=(x:number)=>[{op:'M' as const,point:point('a',x,55)},{op:'C' as const,control1:point('b',x+70,8),control2:point('c',x+140,105),point:point('d',x+225,55)}];
 const ring=(x:number):PathCommand[]=>[{op:'M',point:point('a',x,128)},{op:'L',point:point('b',x+120,128)},{op:'L',point:point('c',x+120,214)},{op:'L',point:point('d',x,214)},{op:'Z'},{op:'M',point:point('e',x+30,155)},{op:'L',point:point('f',x+90,155)},{op:'L',point:point('g',x+90,187)},{op:'L',point:point('h',x+30,187)},{op:'Z'}];
 return [make('corner.open',open(30)),make('smooth.open',open(360)),make('corner.ring',ring(100),'evenodd'),make('smooth.ring',ring(420),'evenodd')];
}
export function sceneOptions(_ctx:FrameContext):ZigzagPathOptions[]{
 const size=keyframes<number>([{frame:0,value:2},{frame:11,value:7,easing:'easeInOut'}]);
 return [{size,ridges:8,accuracy:1e-6},{size,ridges:8,smooth:true,accuracy:1e-6},{size,ridges:2,accuracy:1e-6},{size,ridges:2,smooth:true,accuracy:1e-6}];
}
