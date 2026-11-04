// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import * as graphics from '../../../graphics-contracts/index.ts';import type {PathData,TextLayoutData} from '../../../graphics-contracts/types.ts';
import type {ShapedRun} from '../font-shaping.ts';import {createGlyphAnimator} from '../glyph-animation.ts';
import {createBidiAnimator,type BidiAnimationSource} from '../bidi-animation.ts';import type {TextGlyphUnit} from '../text-animation/common.ts';
import {extrudePathGeometry,type ExtrusionOptions,type ExtrudedGeometry,type ExtrusionPart} from './geometry.ts';
export interface ExtrusionUnit {id:string;index:number;count:number;anchor:readonly[number,number];glyph?:TextGlyphUnit}
export interface PreparedExtrusion {units:readonly ExtrusionUnit[];parts:readonly (ExtrusionPart&{unitIndex:number})[];layout?:TextLayoutData;diagnostics:readonly unknown[];geometry:readonly ExtrudedGeometry['metrics'][];unitsPerPixel:number}
export type UnitExtrusionOptions=Omit<ExtrusionOptions,'anchor'|'id'>|((unit:TextGlyphUnit,context:FrameContext)=>Omit<ExtrusionOptions,'anchor'|'id'>);
/** Ordinary source geometry, without requiring a fabricated text/glyph identity. */
export async function preparePathExtrusion(paths:Iterable<PathData>,options:ExtrusionOptions,services:Parameters<typeof extrudePathGeometry>[2],context?:FrameContext):Promise<PreparedExtrusion>{
 const geometry=await extrudePathGeometry(paths,options,services,context),unit={id:options.id??'path',index:0,count:1,anchor:geometry.metrics.anchor};
 return {units:[unit],parts:geometry.parts.map(p=>({...p,unitIndex:0})),diagnostics:geometry.diagnostics,geometry:[geometry.metrics],unitsPerPixel:geometry.metrics.unitsPerPixel};
}
/** Existing cluster units preserve ligatures/marks and original source. Positioned
 * paths are oriented once through the shared Core interpreter before extrusion. */
export async function prepareTextExtrusion(input:ShapedRun|BidiAnimationSource,options:UnitExtrusionOptions,services:Parameters<typeof extrudePathGeometry>[2],context:FrameContext):Promise<PreparedExtrusion>{
 const layout=graphics.validateTextLayoutData(input.layout);if(layout.coordinates.unit!=='px')throw new EngineError('E_PA_EXTRUSION','Canonical pixel text required');
 if('colorGlyphs'in input&&input.colorGlyphs?.length)throw new EngineError('E_PA_EXTRUSION_PAINT','Color font paints need an explicit vector silhouette; no fabricated monochrome extrusion');
 const directions=new Map(layout.paragraphs.map(p=>[p.id,p.direction])),lines=new Map(layout.lines.map(l=>[l.id,l.paragraphId])),animator='fontInstances'in input?createBidiAnimator(graphics,input):createGlyphAnimator(graphics,input),glyphUnits=animator.units({unit:'cluster',order:'visual'}).map(u=>({...u,direction:directions.get(lines.get(u.lineId)!)})),units=glyphUnits.map(u=>({id:'unit.'+u.index,index:u.index,count:u.count,anchor:u.anchor,glyph:u})),byGlyph=new Map(glyphUnits.flatMap((u,i)=>u.glyphIndices.map(g=>[g,i]as const))),paths:PathData[][]=units.map(()=>[]),geometry=graphics.createTextLayoutGeometry(layout);
 for(const item of input.glyphPaths){const unit=byGlyph.get(item.glyphIndex);if(unit===undefined)throw new EngineError('E_PA_EXTRUSION','Original glyph geometry has no existing cluster owner');paths[unit].push(geometry.orientGlyphPath(item.glyphIndex,item.path));}
 const parts:PreparedExtrusion['parts'][number][]=[],metrics:ExtrudedGeometry['metrics'][]=[],diagnostics:unknown[]=[...input.diagnostics];let scale:number|undefined;
 // Resolve all parameter callbacks before awaiting geometry; they must be pure.
 const parameters=glyphUnits.map(u=>{const {signal,onDiagnostic,...value}=typeof options==='function'?options(u,context):options;return {...structuredClone(value),signal,onDiagnostic};});
 for(const [i,unit]of units.entries()){
  if(!paths[i].length)continue;const params=parameters[i],out=await extrudePathGeometry(paths[i],{...params,anchor:unit.anchor,id:unit.id},services,context);if(scale!==undefined&&scale!==out.metrics.unitsPerPixel)throw new EngineError('E_PA_EXTRUSION','All text units require the same explicit pixel/world unit conversion');scale=out.metrics.unitsPerPixel;parts.push(...out.parts.map(p=>({...p,unitIndex:i})));metrics.push(out.metrics);diagnostics.push(...out.diagnostics);
 }
 return {units,parts,layout,diagnostics,geometry:metrics,unitsPerPixel:scale??(typeof options==='function'?parameters[0]?.unitsPerPixel:options.unitsPerPixel)??.01};
}
