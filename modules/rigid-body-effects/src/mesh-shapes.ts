import {validateMeshData} from '../../graphics-contracts/validate.ts';
import type {RigidShape,MeshData,Vec3} from './types.ts';
function fail(message:string):never{throw Object.assign(new Error(message),{code:'E_RIGID_GEOMETRY'});}
/** Validate actual geometry before it enters the unchanged bytes-v1 boundary.
 * No repair, decimation, implicit unit conversion or convex decomposition. */
export function checkedColliderMesh(value:unknown,hull:boolean):MeshData{
  const mesh=validateMeshData(value),points=mesh.restPositions;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],p[a]);hi[a]=Math.max(hi[a],p[a]);}
  const scale=Math.max(...lo.map((x,a)=>hi[a]-x));if(!Number.isFinite(scale)||scale<=0)fail('Mesh has no representable extent');
  const relative=(a:Vec3,b:Vec3)=>a.map((v,i)=>(v-b[i])/scale);
  const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(j=>points[j]);const n=cross(relative(b,a),relative(c,a));if(!n.every(Number.isFinite)||Math.hypot(...n)===0)fail('Collision triangle '+i/3+' is geometrically degenerate; input is not silently repaired');}
  if(hull){
    if(points.length<4)fail('A 3D convex hull requires at least four points');
    let edge=[0,0,0],normal=[0,0,0],best=0;
    for(const p of points){const v=relative(p,points[0]),n=Math.hypot(...v);if(n>best){best=n;edge=v;}}
    best=0;for(const p of points){const n=cross(edge,relative(p,points[0])),size=Math.hypot(...n);if(size>best){best=size;normal=n;}}
    let volume=0;for(const p of points){const v=relative(p,points[0]);volume=Math.max(volume,Math.abs(v.reduce((s,x,i)=>s+x*normal[i],0)));}
    if(!Number.isFinite(volume)||volume===0)fail('Convex hull points are coplanar/collinear at f64 precision');
    if(!Number.isFinite(scale**3)||scale**3===0)fail('Hull volume scale is not representable in f64');
  }
  return mesh;
}
/** Private Rust wire shape, not another public geometry contract. */
export function nativeShape(s:RigidShape):unknown{
  if(s.kind==='convexHull')return {kind:s.kind,vertices:s.mesh.restPositions};
  if(s.kind==='trimesh')return {kind:s.kind,vertices:s.mesh.restPositions,indices:Array.from({length:s.mesh.indices.length/3},(_,i)=>s.mesh.indices.slice(i*3,i*3+3)),fixInternalEdges:s.internalEdges!=='raw'};
  return s;
}
