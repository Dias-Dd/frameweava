import {keyframes} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {PathData,PathCommand} from '../../../../modules/graphics-contracts/types.ts';
import type {TwistPathOptions} from '../../../../modules/pro-animation/src/path-twist.ts';
export const glyphOptions={script:'Latn',fontSize:48,x:466,baseline:208} as const;
export function scenePaths(width=640,height=240):PathData[]{
 const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width,height};const point=(id:string,x:number,y:number)=>({id,x,y});
 const make=(id:string,commands:PathCommand[],fillRule:'nonzero'|'evenodd'='nonzero'):PathData=>({schema:'frameweave.path',version:1,id,coordinates,fillRule,commands});
 return [make('radial.line',[{op:'M',point:point('a',115,75)},{op:'L',point:point('b',205,75)}]),make('center.loop',[{op:'M',point:point('a',480,75)},{op:'C',control1:point('b',420,15),control2:point('c',540,15),point:point('d',480,75)},{op:'Z'}]),make('ring',[{op:'M',point:point('a',132,158)},{op:'L',point:point('b',188,158)},{op:'L',point:point('c',188,214)},{op:'L',point:point('d',132,214)},{op:'Z'},{op:'M',point:point('e',148,174)},{op:'L',point:point('f',172,174)},{op:'L',point:point('g',172,198)},{op:'L',point:point('h',148,198)},{op:'Z'}],'evenodd')];
}
export function sceneOptions(_ctx:FrameContext):TwistPathOptions[]{
 const angle=(end:number)=>keyframes<number>([{frame:0,value:0},{frame:11,value:end,easing:'easeInOut'}]);
 return [{angleDegrees:angle(200),center:[160,75],radius:50,accuracy:1e-3},{angleDegrees:angle(240),center:[480,75],accuracy:1e-3},{angleDegrees:angle(150),center:[160,186],radius:50,accuracy:1e-3},{angleDegrees:angle(-120),center:[480,186],radius:40,accuracy:1e-3}];
}
