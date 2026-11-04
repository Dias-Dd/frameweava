import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {ImageEffectOptions,BlurOptions} from './parameters.ts';
import {fail,fields} from './parameters.ts';

export type Rgb=readonly [Signal<number>,Signal<number>,Signal<number>];
export interface FeatherOptions extends BlurOptions {}
export interface FillOptions extends ImageEffectOptions {color?:Rgb;opacity?:Signal<number>}
export interface ApplyMatteOptions extends ImageEffectOptions {channel?:'alpha';opacity?:Signal<number>}
/** Two-mask coverage union: b + a*(1-b), not max(a,b) or clipped addition. */
export interface MergeMatteOptions extends ImageEffectOptions {}
/** Shift Alpha to working RGB (optionally scaled by color); coverage stays one. */
export interface AlphaToRgbOptions extends ImageEffectOptions {color?:Rgb}
/** Returns only the shadow, in the original canvas bounds; place the original separately. */
export interface DropShadowOptions extends ImageEffectOptions {color?:Rgb;opacity?:Signal<number>;radius?:Signal<number>;offset?:readonly [Signal<number>,Signal<number>]}
export type MatteKind='feather'|'fill'|'applyMatte'|'dropShadow'|'mergeMatte'|'alphaToRGB';
export interface ResolvedMatte {kind:MatteKind;color:readonly [number,number,number];opacity:number;radius:number;offset:readonly [number,number];boundary:'transparent'|'clamp'}
function number(value:Signal<number>|undefined,fallback:number,name:string,min:number,max:number,ctx?:FrameContext){
 if(value!==undefined&&typeof value!=='number'&&!ctx)fail('E_GPU_IMAGE_CONTEXT',`${name}: a Signal requires FrameContext`);
 const n=value===undefined?fallback:typeof value==='number'?value:evaluate(value,ctx!);
 if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail('E_GPU_IMAGE_PARAMETER',`${name}: finite [${min},${max}] required`);return n;
}
export function resolveMatte(kind:MatteKind,options:FeatherOptions|FillOptions|ApplyMatteOptions|DropShadowOptions|MergeMatteOptions|AlphaToRgbOptions={},ctx?:FrameContext){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal',...kind==='feather'?['radius','boundary']:kind==='fill'?['color','opacity']:kind==='applyMatte'?['channel','opacity']:kind==='alphaToRGB'?['color']:kind==='mergeMatte'?[]:['color','opacity','radius','offset']],kind);
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const feather=options as FeatherOptions,fill=options as FillOptions,shadow=options as DropShadowOptions,matte=options as ApplyMatteOptions;
 if(kind==='feather'&&feather.boundary!==undefined&&feather.boundary!=='transparent'&&feather.boundary!=='clamp')fail('E_GPU_IMAGE_PARAMETER','Unknown feather boundary');
 if(kind==='applyMatte'&&matte.channel!==undefined&&matte.channel!=='alpha')fail('E_GPU_IMAGE_PARAMETER','This checkpoint supports alpha matte only');
 if(fill.color!==undefined&&(!Array.isArray(fill.color)||fill.color.length!==3))fail('E_GPU_IMAGE_PARAMETER','color requires three working-space RGB components');
 if(shadow.offset!==undefined&&(!Array.isArray(shadow.offset)||shadow.offset.length!==2))fail('E_GPU_IMAGE_PARAMETER','offset requires [x,y] physical pixels');
 const color:[number,number,number]=[0,1,2].map(c=>number(fill.color?.[c],kind==='fill'||kind==='alphaToRGB'?1:0,`color[${c}]`,-Number.MAX_VALUE,Number.MAX_VALUE,ctx)) as [number,number,number];
 if(color.some(c=>!Number.isFinite(Math.fround(c))))fail('E_GPU_IMAGE_PARAMETER','color must fit finite Float32; no implicit clipping');
 const resolved:ResolvedMatte={kind,color,opacity:number(fill.opacity,kind==='dropShadow'?.5:1,'opacity',0,1,ctx),radius:kind==='feather'||kind==='dropShadow'?number(feather.radius,kind==='feather'?1:4,'radius (sigma px)',0,64,ctx):0,offset:[0,1].map(c=>number(shadow.offset?.[c],kind==='dropShadow'?4:0,`offset[${c}]`,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,ctx)) as [number,number],boundary:kind==='feather'?feather.boundary??'transparent':'transparent'};
 return {resolved,output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
