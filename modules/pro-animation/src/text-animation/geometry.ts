// SPDX-License-Identifier: Apache-2.0 AND ISC
// Canonical fill faces come from the existing Clipper2 adapter; unchanged Earcut triangulates them.
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData,TextLayoutData} from '../../../graphics-contracts/types.ts';
import type {ShapedRun} from '../font-shaping.ts';
import {createGlyphAnimator} from '../glyph-animation.ts';
import type {createPathOperations} from '../path-operations.ts';
import earcut,{deviation} from '../../vendor/earcut/earcut.js';
import {finite,fields,fail,type TextGlyphUnit} from './common.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import {canonicalFilledFaces} from '../filled-faces.ts';

export interface PreparedGlyphGeometry {
 readonly layout:TextLayoutData;readonly units:readonly TextGlyphUnit[];
 /** Local call result, NOT a new Graphics/TVG wire schema. */
 readonly positions:readonly number[];readonly vertexUnits:readonly number[];
 readonly diagnostics:readonly unknown[];readonly fontInstance:ShapedRun['fontInstance'];
 readonly preparation:Readonly<{tolerancePixels:number;gridSizePixels:number;faces:number;triangles:number;maxAreaDeviation:number}>;
}
export interface PrepareGlyphOptions {
 pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>;
 tolerance?:number;gridSize?:number;unit?:'cluster'|'glyph';order?:'logical'|'visual';signal?:AbortSignal;
}
function rings(face:PathData){
 const result:number[][]=[];let ring:number[]|undefined;
 for(const command of face.commands){
  if(command.op==='M'){if(ring)fail('fill face','closed preceding contour');ring=[command.point.x,command.point.y];}
  else if(command.op==='L'){if(!ring)fail('fill face','M before L');ring.push(command.point.x,command.point.y);}
  else if(command.op==='Z'){if(!ring||ring.length<6)fail('fill face','nondegenerate closed polygon');result.push(ring);ring=undefined;}
  else fail('fill face','flattened canonical solid face from existing pathOperations');
 }
 if(ring||!result.length)fail('fill face','one outer contour with zero or more closed holes');return result;
}
/** Expensive once-per-layout preparation; borrows the caller's existing geometry session.
 * Fonts/shaping are never fetched or executed during a draw. Caller disposes pathOperations. */
export type PreparedGlyphDrawData=Pick<PreparedGlyphGeometry,'layout'|'units'|'positions'|'vertexUnits'>;
/** Internal canonical-data adapter shared with mixed-font paragraphs; no new wire schema. */
export interface GlyphMeshLayoutInput {layout:TextLayoutData;units:readonly TextGlyphUnit[];glyphPaths:readonly {glyphIndex:number;path:PathData}[];diagnostics:readonly unknown[]}
function preparationOptions(options:PrepareGlyphOptions){
 fields(options,['pathOperations','tolerance','gridSize','unit','order','signal']);const tolerance=finite(options.tolerance??.02,'tolerance px'),grid=finite(options.gridSize??tolerance/8,'gridSize px');if(tolerance<=0||grid<=0||typeof options.pathOperations?.booleanPathsStream!=='function')fail('preparation','positive tolerance/grid and existing pathOperations');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('signal','AbortSignal');if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Glyph mesh preparation cancelled before publication');return {tolerance,grid};
}
export async function prepareLayoutGlyphMeshes(input:GlyphMeshLayoutInput,options:PrepareGlyphOptions){
 const {tolerance,grid}=preparationOptions(options),check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Glyph mesh preparation cancelled before publication');};const layout=graphics.validateTextLayoutData(input.layout),units=input.units,indices=new Map<number,number>();for(const [i,u]of units.entries())for(const g of u.glyphIndices){if(indices.has(g))fail('glyphIndex','unique prepared unit');indices.set(g,i);}
 const geometry=graphics.createTextLayoutGeometry(layout),positions:number[]=[],vertexUnits:number[]=[],diagnostics=[...structuredClone(input.diagnostics)];let faces=0,triangles=0,maxAreaDeviation=0;
 for(const item of input.glyphPaths){
  check();const unit=indices.get(item.glyphIndex);if(unit===undefined)fail('glyphIndex','one existing shaped unit');
  for await(const raw of canonicalFilledFaces(options.pathOperations.booleanPathsStream([geometry.orientGlyphPath(item.glyphIndex,item.path)],{operation:'union',tolerance,gridSize:grid,signal:options.signal,onDiagnostic:d=>diagnostics.push(d)}),options.pathOperations,{tolerance,gridSize:grid,signal:options.signal,onDiagnostic:d=>diagnostics.push(d)})){
   check();const face=graphics.validatePathData(raw),contours=rings(face),data:number[]=[],holes:number[]=[];
   for(const [i,contour]of contours.entries()){if(i)holes.push(data.length/2);for(const value of contour)data.push(value);}
   const mesh=earcut(data,holes,2),error=deviation(data,holes,2,mesh);if(!Number.isFinite(error)||error>1e-10||mesh.length%3!==0)fail('tessellation.area','canonical fill/triangle area deviation <= 1e-10',{error,glyphIndex:item.glyphIndex});maxAreaDeviation=Math.max(maxAreaDeviation,error);faces++;triangles+=mesh.length/3;
   for(const vertex of mesh){if(!Number.isSafeInteger(vertex)||vertex<0||vertex*2+1>=data.length)fail('tessellation.indices','existing polygon vertices');positions.push(data[vertex*2],data[vertex*2+1],.5);vertexUnits.push(unit);}
  }
 }
 return {layout,units,positions,vertexUnits,diagnostics,preparation:Object.freeze({tolerancePixels:tolerance,gridSizePixels:grid,faces,triangles,maxAreaDeviation})};
}
export async function prepareGlyphMeshes(run:ShapedRun,options:PrepareGlyphOptions):Promise<PreparedGlyphGeometry>{
 preparationOptions(options);
 const animator=createGlyphAnimator(graphics,run),layout=graphics.validateTextLayoutData(run.layout),paragraphs=new Map(layout.paragraphs.map(p=>[p.id,p.direction])),lines=new Map(layout.lines.map(l=>[l.id,l.paragraphId])),units=animator.units({unit:options.unit,order:options.order}).map(u=>Object.freeze({...u,direction:paragraphs.get(lines.get(u.lineId)!)!}));
 return {...await prepareLayoutGlyphMeshes({layout,units,glyphPaths:run.glyphPaths,diagnostics:run.diagnostics},options),fontInstance:structuredClone(run.fontInstance)};
}
