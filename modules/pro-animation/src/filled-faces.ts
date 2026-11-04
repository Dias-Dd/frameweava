// SPDX-License-Identifier: Apache-2.0
// Reuses the existing Clipper2 fill solver for anomalous returned face winding.
// No polygon parser/tessellator/renderer or new public wire schema.
import {EngineError} from '../../../src/core/errors.ts';
import type {Diagnostic} from '../../../src/core/types.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {createPathOperations,PathOperationOptions} from './path-operations.ts';
type Operations=Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>;
export function filledContourAreas(face:PathData):number[]{
 const result:number[]=[];let ring:{x:number;y:number}[]=[];
 for(const c of face.commands){if(c.op==='M'){if(ring.length)throw new EngineError('E_PA_FILL_FACE','Closed preceding polygon contour required');ring=[c.point];}else if(c.op==='L')ring.push(c.point);else if(c.op==='Z'){if(ring.length<3)throw new EngineError('E_PA_FILL_FACE','Three polygon points required');const [origin]=ring;let sum=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];sum+=(a.x-origin.x)*(b.y-origin.y)-(b.x-origin.x)*(a.y-origin.y);}if(!Number.isFinite(sum)||sum===0)throw new EngineError('E_PA_FILL_FACE','Resolvable nonzero polygon area required');result.push(sum/2);ring=[];}else throw new EngineError('E_PA_FILL_FACE','Use the existing flattened Clipper2 fill faces');}
 if(ring.length||!result.length)throw new EngineError('E_PA_FILL_FACE','Complete closed polygon faces required');return result;
}
function anomalous(face:PathData){const areas=filledContourAreas(face);return face.fillRule!=='nonzero'||areas.slice(1).some(v=>Math.sign(v)===Math.sign(areas[0]));}
/** Drain the original iterator before a second operation on the SAME client.
 * Ordinary faces stream unchanged; only anomalous face values are deferred.
 * Mesh callers already own aggregate XYZ arrays. No hidden store/queue/cache.
 * No loops are dropped/reclassified by hand, and no grid is silently coarsened. */
export async function* canonicalFilledFaces(source:AsyncIterable<PathData>,operations:Operations|undefined,options:Pick<PathOperationOptions,'tolerance'|'gridSize'|'signal'|'onDiagnostic'>):AsyncGenerator<PathData>{
 const check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Fill normalization cancelled');};check();const deferred:PathData[]=[];for await(const face of source){check();if(anomalous(face))deferred.push(face);else yield face;}
 for(const face of deferred){
  if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Fill normalization cancelled');
  if(typeof operations?.booleanPathsStream!=='function')throw new EngineError('E_PA_FILL_NORMALIZER','An anomalous NonZero face requires the existing boolean solver; no unsafe Earcut hole guess is made');
  const diagnostic:Diagnostic={code:'W_PA_FILL_RENORMALIZED',severity:'warning',message:'A returned face contained same-winding child contours; resolving its declared NonZero fill again with the existing explicit integer grid',details:{gridSize:options.gridSize,tolerance:options.tolerance,normalizationPasses:2,scope:'Existing quantized Boolean semantics, not exact unquantized topology/Hausdorff certification'}};
  options.onDiagnostic?.(diagnostic);
  for await(const normalized of operations.booleanPathsStream([face],{...options,operation:'union'})){if(anomalous(normalized))throw new EngineError('E_PA_FILL_CANONICAL','Existing fill solver did not return Earcut-compatible winding; result rejected rather than weakening the area budget');yield normalized;}
 }
}
