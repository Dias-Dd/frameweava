// SPDX-License-Identifier: Apache-2.0
import {matrix,multiply,type Affine} from '../../../../src/media/compositor-geometry.ts';
import type {Signal,FrameContext} from '../../../../src/core/types.ts';
import {fields,finite,number,snapshot,selector,weight,affinity,integer,fail,type GlyphSelector,type GlyphTransform,type TextGlyphUnit} from './common.ts';
type Anchor=readonly [Signal<number>,Signal<number>];
function pivot(anchor:Anchor|undefined,u:TextGlyphUnit,c:FrameContext){const a=anchor??u.anchor;if(!Array.isArray(a)||a.length!==2)fail('anchor','two pixel Signals');return [number(a[0],c,'anchor.x'),number(a[1],c,'anchor.y')] as const;}
const result=(value:Affine,opacity=1)=>({matrix:Object.freeze(value),opacity});
const identity=()=>[1,0,0,1,0,0] as Affine;
export function glyphTranslate(input:GlyphSelector,options:{x?:Signal<number>;y?:Signal<number>}):GlyphTransform{
 selector(input);fields(options,['x','y']);const p=snapshot(options);return(u,c)=>{const w=weight(input,u,c);return result([1,0,0,1,finite(number(p.x??0,c,'x')*w,'weighted x'),finite(number(p.y??0,c,'y')*w,'weighted y')]);};
}
export function glyphRotate(input:GlyphSelector,options:{rotationDegrees:Signal<number>;anchor?:Anchor}):GlyphTransform{
 selector(input);fields(options,['rotationDegrees','anchor']);const p=snapshot(options);return(u,c)=>{const w=weight(input,u,c),a=pivot(p.anchor,u,c),rotation=finite(number(p.rotationDegrees,c,'rotationDegrees')*w,'weighted rotation');if(Math.abs(rotation/360)>Number.MAX_SAFE_INTEGER)fail('rotationDegrees','resolvable Float64 angle');return result(matrix({id:'glyph',start:0,end:1,rotation:rotation%360,originX:a[0],originY:a[1]}));};
}
export function glyphScale(input:GlyphSelector,options:{scaleX:Signal<number>;scaleY?:Signal<number>;anchor?:Anchor}):GlyphTransform{
 selector(input);fields(options,['scaleX','scaleY','anchor']);const p=snapshot(options);return(u,c)=>{const w=weight(input,u,c),a=pivot(p.anchor,u,c),sx=number(p.scaleX,c,'scaleX'),sy=number(p.scaleY??p.scaleX,c,'scaleY');return result(matrix({id:'glyph',start:0,end:1,scaleX:finite(1+(sx-1)*w,'weighted scaleX'),scaleY:finite(1+(sy-1)*w,'weighted scaleY'),originX:a[0],originY:a[1]}));};
}
export function glyphOpacity(input:GlyphSelector,options:{opacity:Signal<number>}):GlyphTransform{
 selector(input);fields(options,['opacity']);const p=snapshot(options);return(u,c)=>{const target=number(p.opacity,c,'opacity');if(target<0||target>1)fail('opacity','fraction in [0,1]');return result(identity(),Math.max(0,Math.min(1,1+(target-1)*weight(input,u,c))));};
}
export function glyphTracking(input:GlyphSelector,options:{amount:Signal<number>;order?:'logical'|'visual';direction?:'auto'|'ltr'|'rtl';originIndex?:number}):GlyphTransform{
 selector(input);fields(options,['amount','order','direction','originIndex']);const p=snapshot(options),order=p.order??'logical',direction=p.direction??'auto',origin=integer(p.originIndex??0,'originIndex');if(!['logical','visual'].includes(order)||!['auto','ltr','rtl'].includes(direction))fail('order/direction','logical/visual and auto/ltr/rtl');
 return(u,c)=>{const d=direction==='auto'?u.direction:direction;if(order==='logical'&&d===undefined)fail('direction','prepared unit paragraph direction or explicit ltr/rtl');const sign=order==='logical'&&d==='rtl'?-1:1,index=order==='logical'?u.logicalIndex:u.visualIndex,x=finite((index-origin)*number(p.amount,c,'tracking amount px')*weight(input,u,c)*sign,'tracking displacement');return result([1,0,0,1,x,0]);};
}
/** Apply controls in author order using real affine composition, including nonuniform scale/pivots. */
export function composeGlyphTransforms(...controls:readonly GlyphTransform[]):GlyphTransform{
 if(controls.some(c=>typeof c!=='function'))fail('controls','pure glyph transform callbacks');const values=[...controls];return(u,c)=>{let transform=identity(),opacity=1;for(const control of values){const v=control(u,c);if(!v||typeof v!=='object')fail('transform','matrix/opacity result');const alpha=finite(v.opacity,'transform.opacity');if(alpha<0||alpha>1)fail('transform.opacity','fraction in [0,1]');transform=multiply(affinity(v.matrix),transform);opacity*=alpha;}return result(affinity(transform),opacity);};
}
