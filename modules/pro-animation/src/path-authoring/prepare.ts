// SPDX-License-Identifier: Apache-2.0 AND ISC
// Reuses original Clipper2 constant-width offset and unchanged Earcut, not the variable-ribbon builder.
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import type {createPathOperations,StrokePathOptions} from '../path-operations.ts';
import type {PreparedStrokeMesh} from '../stroke-animation/index.ts';
import earcut,{deviation} from '../../vendor/earcut/earcut.js';
import {fail} from './common.ts';
import {canonicalFilledFaces} from '../filled-faces.ts';
export interface PrepareSolidStrokeOptions extends Omit<StrokePathOptions,'onDiagnostic'> {pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'strokePathsStream'>&Partial<Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>>;context?:FrameContext}
/** Uniform-ink outline preparation. Curve flattening/caps/joins are delegated to
 * existing Clipper2, not approximated by new per-segment brush primitives.
 * Returned local mesh uses u=0 because no arc-length paint coordinate is invented. */
export async function prepareSolidPathStroke(input:PathData,options:PrepareSolidStrokeOptions):Promise<PreparedStrokeMesh>{
 const path=graphics.validatePathData(input),{pathOperations,context,...stroke}=options;if(typeof pathOperations?.strokePathsStream!=='function')fail('pathOperations','existing reviewed stroke-outline session');const positions:number[]=[],parameters:number[]=[],diagnostics:unknown[]=[];let faces=0,triangles=0,error=0;const check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Solid path stroke preparation cancelled');};check();
 for await(const raw of canonicalFilledFaces(pathOperations.strokePathsStream([path],{...stroke,onDiagnostic:d=>diagnostics.push(d)},context),typeof pathOperations.booleanPathsStream==='function'?pathOperations as Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>:undefined,{tolerance:options.tolerance??.01,gridSize:options.gridSize??(options.tolerance??.01)/8,signal:options.signal,onDiagnostic:d=>diagnostics.push(d)})){
  check();const face=graphics.validatePathData(raw),data:number[]=[],holes:number[]=[];let count=0,open=false;for(const c of face.commands){if(c.op==='M'){if(open)fail('face','closed preceding contour');if(count++)holes.push(data.length/2);open=true;data.push(c.point.x,c.point.y);}else if(c.op==='L'){if(!open)fail('face','M before L');data.push(c.point.x,c.point.y);}else if(c.op==='Z')open=false;else fail('face','existing flattened solid outline');}if(open)fail('face','closed contours');
  const local=data.map((v,i)=>v-data[i%2]),indices=earcut(local,holes,2),relative=deviation(local,holes,2,indices);if(!Number.isFinite(relative)||relative>1e-10||indices.length%3)throw new EngineError('E_PA_PATH_TESSELLATION','Solid outline triangle/face area differs beyond unchanged1e-10 budget',{details:{relative,vertices:data.length/2,holes:holes.length}});error=Math.max(error,relative);faces++;triangles+=indices.length/3;for(const index of indices){check();if(!Number.isSafeInteger(index)||index<0||index*2+1>=data.length)fail('indices','existing polygon vertices');positions.push(data[index*2],data[index*2+1],.5);parameters.push(0);}
 }
 const tolerance=options.tolerance??.01;return {coordinates:path.coordinates,closed:false,positions,parameters,diagnostics,preparation:{faces,triangles,maxAreaDeviation:error,roundTolerance:options.arcTolerance??tolerance/4,gridSize:options.gridSize??tolerance/8,sampleCount:0}};
}
