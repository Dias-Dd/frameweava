// SPDX-License-Identifier: Apache-2.0
import {validateMeshData} from '../../graphics-contracts/validate.ts';import type {MeshData} from '../../graphics-contracts/types.ts';
import {object,array,finite,integer,normalizeDeformable,deformableError} from './config.ts';import {signedVolume} from './volume.ts';import type {DeformableOptions,Vec3,VectorSignal} from './types.ts';
export type Tetrahedron=[number,number,number,number];
type Common=Pick<DeformableOptions,'fps'|'substeps'|'iterations'|'seed'|'gravity'|'acceleration'|'dampingRate'|'collision'|'budgets'>;
export type SoftBodyOptions=Common&{density?:number;edgeCompliance?:number;volumeCompliance?:number;bulkModulus?:number;fixedVertices?:string[];pins?:{vertex:string;target:VectorSignal}[];positions?:Vec3[];velocities?:Vec3[]};
const keys=['fps','substeps','iterations','seed','gravity','acceleration','dampingRate','collision','budgets'];
const signature=(ids:number[])=>ids.reduce((s,v,i)=>s+ids.slice(i+1).filter(w=>v>w).length,0)%2;
const faceKey=(ids:number[])=>[...ids].sort((a,b)=>a-b).join(':');
/** Explicit tetrahedral edge/volume network, not FEM, tetrahedralization, self-collision or an inversion barrier.
 * MeshData carries the authored outward boundary; tetrahedra index that same vertex array, including interior vertices. */
export function softBodyOptions(input:MeshData,tetrahedra:Tetrahedron[],options:SoftBodyOptions):DeformableOptions{
  object(options,'soft body options',[...keys,'density','edgeCompliance','volumeCompliance','bulkModulus','fixedVertices','pins','positions','velocities']);
  const mesh=validateMeshData(input),rest=mesh.restPositions,common:Common={fps:options.fps,substeps:options.substeps,iterations:options.iterations,seed:options.seed,gravity:options.gravity,acceleration:options.acceleration,dampingRate:options.dampingRate,collision:options.collision,budgets:options.budgets};
  const prepared=normalizeDeformable({...common,restPositions:rest,inverseMasses:rest.map(()=>1),constraints:[]}),limit=prepared.budgets.maxConstraints,tets=array(tetrahedra,'tetrahedra',limit);
  if(!tets.length)deformableError('E_DEFORM_GEOMETRY','At least one explicit tetrahedron required');
  const density=finite(options.density??1000,'density kg/m^3',Number.MIN_VALUE),edgeCompliance=finite(options.edgeCompliance??1e-6,'edgeCompliance m/N',0);
  if(options.volumeCompliance!==undefined&&options.bulkModulus!==undefined)deformableError('E_DEFORM_PARAMETER','Choose explicit volumeCompliance or bulkModulus');
  const direct=options.volumeCompliance===undefined?undefined:finite(options.volumeCompliance,'volumeCompliance m^5/N',0),bulk=direct===undefined?finite(options.bulkModulus??1e5,'bulkModulus Pa',Number.MIN_VALUE):undefined;
  const masses=rest.map(()=>0),edges=new Map<string,[number,number]>(),cells=new Set<string>(),faces=new Map<string,{ids:number[];count:number}>(),volumes:Extract<DeformableOptions['constraints'][number],{kind:'volume'}>[]=[];
  for(const raw of tets){const indices=array(raw,'tetrahedron',4).map(i=>integer(i,'tetrahedron index',0,rest.length-1)) as Tetrahedron;if(indices.length!==4||new Set(indices).size!==4)deformableError('E_DEFORM_TOPOLOGY','Four distinct tetrahedron vertices required');const key=faceKey(indices);if(cells.has(key))deformableError('E_DEFORM_TOPOLOGY','Duplicate tetrahedron');cells.add(key);
    const volume=signedVolume(indices.map(i=>rest[i]));if(volume===0)deformableError('E_DEFORM_GEOMETRY','Degenerate rest tetrahedron');const absolute=Math.abs(volume),mass=finite(absolute*density/4,'tetrahedron lumped mass',Number.MIN_VALUE),compliance=direct??finite(absolute/bulk!,'bulk volume compliance',Number.MIN_VALUE);
    for(const i of indices)masses[i]=finite(masses[i]+mass,'accumulated mass',Number.MIN_VALUE);
    volumes.push({kind:'volume',particles:[...indices],restVolume:volume,compliance});
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const x=Math.min(indices[a],indices[b]),y=Math.max(indices[a],indices[b]);edges.set(x+':'+y,[x,y]);if(edges.size+tets.length>limit)deformableError('E_DEFORM_BUDGET','Soft body edge/volume plan exceeds maxConstraints');}
    const oriented=[[indices[1],indices[2],indices[3]],[indices[0],indices[3],indices[2]],[indices[0],indices[1],indices[3]],[indices[0],indices[2],indices[1]]];
    for(const f of oriented){if(volume<0)[f[1],f[2]]=[f[2],f[1]];const key=faceKey(f),old=faces.get(key);if(old){if(old.count!==1||signature(old.ids)===signature(f))deformableError('E_DEFORM_TOPOLOGY','Nonmanifold or same-side shared tetrahedron face');old.count++;}else faces.set(key,{ids:f,count:1});}
  }
  const surface=new Set<string>();for(let at=0;at<mesh.indices.length;at+=3){const f=mesh.indices.slice(at,at+3),key=faceKey(f),expected=faces.get(key);if(surface.has(key)||expected?.count!==1||signature(expected.ids)!==signature(f))deformableError('E_DEFORM_TOPOLOGY','Mesh triangles must be the outward tetrahedral boundary');surface.add(key);}if([...faces].filter(([,f])=>f.count===1).length!==surface.size)deformableError('E_DEFORM_TOPOLOGY','Mesh omits tetrahedral boundary faces');
  const fixed=new Set<number>(),pins:NonNullable<DeformableOptions['pins']>=[],byId=new Map(mesh.vertexIds.map((id,i)=>[id,i]));function index(id:unknown){if(typeof id!=='string'||!byId.has(id))deformableError('E_DEFORM_PARAMETER','Unknown soft body vertex ID');const i=byId.get(id)!;if(fixed.has(i))deformableError('E_DEFORM_PARAMETER','Duplicate soft body pin');fixed.add(i);return i;}
  for(const id of array(options.fixedVertices??[],'fixed vertices')){const i=index(id);pins.push({particle:i,target:[...rest[i]]});}for(const p of array(options.pins??[],'soft body pins')){object(p,'soft body pin',['vertex','target']);pins.push({particle:index(p.vertex),target:p.target});}
  const inverseMasses=masses.map((mass,i)=>{finite(mass,'referenced particle mass',Number.MIN_VALUE);return fixed.has(i)?0:finite(1/mass,'inverse mass',Number.MIN_VALUE);}),constraints:DeformableOptions['constraints']=[...edges.values()].map(([a,b])=>({kind:'distance',particles:[a,b],restLength:finite(Math.hypot(...rest[a].map((v,k)=>v-rest[b][k])),'tetrahedral edge length',Number.MIN_VALUE),compliance:edgeCompliance}));constraints.push(...volumes);
  const result:DeformableOptions={...common,restPositions:rest,positions:options.positions,velocities:options.velocities,inverseMasses,constraints,pins};normalizeDeformable(result);return structuredClone(result);
}
