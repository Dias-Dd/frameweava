// SPDX-License-Identifier: Apache-2.0
// Per-dimension weights compose the existing original Matrix/Quaternion controls, never another renderer.
import type {Signal} from '../../../../src/core/types.ts';
import {fields,fail,type GlyphSelector} from '../text-animation/common.ts';
import {composeGlyph3D,glyphTranslate3D,glyphScale3D,glyphRotateX,glyphRotateY,glyphRotateZ3D} from '../live-text/controls.ts';
export interface DimensionInfluence {dimension(index:number):GlyphSelector}
const checked=(input:DimensionInfluence)=>{if(!input||typeof input.dimension!=='function')fail('influence','per-dimension selector');return input;};
export function glyphTranslateDimensions(input:DimensionInfluence,options:{x?:Signal<number>;y?:Signal<number>;z?:Signal<number>}){checked(input);fields(options,['x','y','z']);return composeGlyph3D(glyphTranslate3D(input.dimension(0),{x:options.x??0}),glyphTranslate3D(input.dimension(1),{y:options.y??0}),glyphTranslate3D(input.dimension(2),{z:options.z??0}));}
export function glyphScaleDimensions(input:DimensionInfluence,options:{x?:Signal<number>;y?:Signal<number>;z?:Signal<number>;anchor?:readonly[number,number,number]}){checked(input);fields(options,['x','y','z','anchor']);return composeGlyph3D(glyphScale3D(input.dimension(0),{x:options.x??1,y:1,z:1,anchor:options.anchor}),glyphScale3D(input.dimension(1),{x:1,y:options.y??1,z:1,anchor:options.anchor}),glyphScale3D(input.dimension(2),{x:1,y:1,z:options.z??1,anchor:options.anchor}));}
export function glyphRotateDimensions(input:DimensionInfluence,options:{x?:Signal<number>;y?:Signal<number>;z?:Signal<number>;anchor?:readonly[number,number,number]}){checked(input);fields(options,['x','y','z','anchor']);return composeGlyph3D(glyphRotateX(input.dimension(0),{degrees:options.x??0,anchor:options.anchor}),glyphRotateY(input.dimension(1),{degrees:options.y??0,anchor:options.anchor}),glyphRotateZ3D(input.dimension(2),{degrees:options.z??0,anchor:options.anchor}));}
