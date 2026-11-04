// SPDX-License-Identifier: Apache-2.0
import {hasExtendedInfluence} from '../text-controls/weight.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {GlyphAnimationUnit} from '../glyph-animation.ts';
import type {Affine} from '../../../../src/media/compositor-geometry.ts';
export type TextGlyphUnit=GlyphAnimationUnit&{readonly direction?:'ltr'|'rtl'};
export type GlyphSelector=(unit:TextGlyphUnit,context:FrameContext)=>number;
export interface GlyphTransformValue {readonly matrix:Readonly<Affine>;readonly opacity:number}
export type GlyphTransform=(unit:TextGlyphUnit,context:FrameContext)=>GlyphTransformValue;
export interface TextSourceRange {readonly start:number;readonly end:number}
export function fail(path:string,expected:string,details?:unknown):never{throw new EngineError('E_PA_TEXT_ANIMATION',`${path}: expected ${expected}`,{details,hint:'Use the documented typed selector/transform; times are Stage-local seconds and coordinates are physical px.'});}
export function finite(value:number,path:string){if(typeof value!=='number'||!Number.isFinite(value))fail(path,'finite number');return value;}
export function integer(value:number,path:string){if(!Number.isSafeInteger(value)||value<0)fail(path,'nonnegative safe integer');return value;}
export function fields(o:object,names:readonly string[]){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!names.includes(k)))fail('options','documented fields only');}
export function number(v:Signal<number>,c:FrameContext,path:string){return finite(evaluate(v,c),path);}
export function snapshot<T>(v:T):T{try{return structuredClone(v);}catch{return fail('options','cloneable existing Signal values');}}
export function selector(s:GlyphSelector){if(typeof s!=='function')fail('selector','pure (unit, context) => weight callback');return s;}
export function weight(s:GlyphSelector,u:GlyphAnimationUnit,c:FrameContext){const w=finite(s(u,c),'selector.weight');if(!hasExtendedInfluence(s)&&(w<0||w>1))fail('selector.weight','fraction in [0,1], or an explicit signed glyph influence');return w;}
export function range(text:string,r:TextSourceRange){if(typeof text!=='string')fail('text','original Unicode string');if(!r||typeof r!=='object')fail('range','UTF16 start/end');integer(r.start,'range.start');integer(r.end,'range.end');if(r.start>r.end||r.end>text.length)fail('range','ordered indices within original UTF16 text');for(const i of [r.start,r.end])if(i>0&&i<text.length&&text.charCodeAt(i)>=0xdc00&&text.charCodeAt(i)<=0xdfff&&text.charCodeAt(i-1)>=0xd800&&text.charCodeAt(i-1)<=0xdbff)fail('range','Unicode scalar boundary; do not split a surrogate pair');return {start:r.start,end:r.end};}
export function affinity(matrix:readonly number[]){if(!Array.isArray(matrix)||matrix.length!==6)fail('transform.matrix','six finite affine coefficients');return matrix.map((v,i)=>finite(v,`transform.matrix[${i}]`)) as Affine;}
