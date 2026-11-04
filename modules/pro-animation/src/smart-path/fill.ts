// SPDX-License-Identifier: Apache-2.0 AND ISC
// Existing Clipper2 -> unchanged Earcut -> existing shared-owner Native mesh raster.
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import type {createPathOperations,PathOperationOptions} from '../path-operations.ts';
import {canonicalFilledFaces} from '../filled-faces.ts';
import earcut,{deviation} from '../../vendor/earcut/earcut.js';
import {drawPathMesh} from '../path-authoring/native.ts';
import {solidStrokeInk,type PreparedStrokeMesh,type NativeStrokeEnvironment,type NativeStrokeOptions,type StrokeColor} from '../stroke-animation/index.ts';
export interface PathFillOptions extends PathOperationOptions {pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>}
export interface PreparedPathFill extends PreparedStrokeMesh {readonly fill:'canonical-nonzero'}
/** Explicit union/flattening on the original integer grid; yields one outer+holes per face. */
export async function* normalizePathFill(inputs:Iterable<PathData>,options:PathFillOptions):AsyncGenerator<PathData>{
 if(typeof options.pathOperations?.booleanPathsStream!=='function')throw new EngineError('E_PA_FILL_NORMALIZER','Use the reviewed existing path operations client');
 const {pathOperations,...settings}=options;yield* canonicalFilledFaces(pathOperations.booleanPathsStream(inputs,{...settings,operation:'union'}),pathOperations,{...settings,tolerance:settings.tolerance??.01,gridSize:settings.gridSize??(settings.tolerance??.01)/8});
}
/** CPU geometry only: flatten/solve original fill, translate for Earcut stability,
 * require the unchanged 1e-10 area budget, then retain scene-pixel F64 coordinates.
 * u=0 is uniform ink, never an invented arclength gradient for a filled shape. */
export async function preparePathFillMesh(inputs:Iterable<PathData>,options:PathFillOptions):Promise<PreparedPathFill>{
 const positions:number[]=[],parameters:number[]=[],diagnostics:unknown[]=[];let coordinates:PathData['coordinates']|undefined,faces=0,triangles=0,maxAreaDeviation=0;
 const check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Path fill preparation cancelled');};check();
 function* operands(){for(const input of inputs){const path=graphics.validatePathData(input);coordinates??=path.coordinates;yield path;}}
 for await(const input of normalizePathFill(operands(),{...options,onDiagnostic:d=>{diagnostics.push(d);options.onDiagnostic?.(d);}})){
  check();const face=graphics.validatePathData(input);coordinates??=face.coordinates;const data:number[]=[],holes:number[]=[];let contours=0;
  for(const command of face.commands){if(command.op==='M'){if(contours++)holes.push(data.length/2);data.push(command.point.x,command.point.y);}else if(command.op==='L')data.push(command.point.x,command.point.y);else if(command.op!=='Z')throw new EngineError('E_PA_FILL_FACE','Original flattened canonical fill faces required');}
  const local=data.map((v,i)=>v-data[i%2]),indices=earcut(local,holes,2),error=deviation(local,holes,2,indices);
  if(!Number.isFinite(error)||error>1e-10||indices.length%3)throw new EngineError('E_PA_FILL_TESSELLATION','Canonical fill triangle/face area exceeds unchanged 1e-10 budget',{details:{relative:error,vertices:data.length/2,holes:holes.length}});
  for(const index of indices){check();if(!Number.isSafeInteger(index)||index<0||index*2+1>=data.length)throw new EngineError('E_PA_FILL_FACE','Valid original triangulation indices required');positions.push(data[index*2],data[index*2+1],.5);parameters.push(0);}faces++;triangles+=indices.length/3;maxAreaDeviation=Math.max(maxAreaDeviation,error);
 }
 // An empty geometric result is legitimate (e.g. fully cancelling winding).
 if(!coordinates)throw new EngineError('E_PA_FILL_INPUT','At least one explicit canonical path required');
 return {fill:'canonical-nonzero',coordinates,closed:false,positions,parameters,diagnostics,preparation:{faces,triangles,maxAreaDeviation,roundTolerance:options.tolerance??.01,gridSize:options.gridSize??(options.tolerance??.01)/8,sampleCount:0}};
}
/** Solid scene-linear signed/HDR ink, Native F16/F32 only. Reuses mesh/alpha/owner
 * validation and transforms; no new rasterizer, image upload or CPU pixel path. */
export function drawPathFill(environment:NativeStrokeEnvironment,mesh:PreparedPathFill,context:FrameContext,options:Omit<NativeStrokeOptions,'ink'>&{color?:StrokeColor}={}){
 if(mesh.fill!=='canonical-nonzero'||mesh.parameters.some(u=>u!==0))throw new EngineError('E_PA_FILL_MESH','Prepare the canonical uniform-ink fill mesh first');const {color=[1,1,1,1],...settings}=options;return drawPathMesh(environment,mesh,context,{...settings,ink:solidStrokeInk(color)});
}
