// SPDX-License-Identifier: Apache-2.0
// Private angular geometry/diagnostics, not a new Graphics or simulation contract.
import {deformableError,type Vec3,type KernelConstraint} from './codec.ts';
const sub=(a:Vec3,b:Vec3)=>a.map((v,k)=>v-b[k]) as Vec3;
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function angleDifference(angle:number,target:number):number {
  let delta=(angle-target)%(Math.PI*2);if(delta>=Math.PI)delta-=Math.PI*2;else if(delta< -Math.PI)delta+=Math.PI*2;return delta;
}
/** Already-validated opposite0/opposite1/edge0/edge1 points, matching the native convention. */
export function signedDihedral(points:Vec3[]):number {
  const relative=points.map(p=>sub(p,points[2]));let scale=0;
  for(const row of relative)for(const v of row){if(!Number.isFinite(v))deformableError('E_DEFORM_NUMERIC','Unrepresentable hinge edge');scale=Math.max(scale,Math.abs(v));}
  if(scale===0)deformableError('E_DEFORM_GEOMETRY','Degenerate dihedral hinge');
  const p=relative.map(row=>row.map(v=>v/scale) as Vec3),edge=sub(p[3],p[2]),a=cross(sub(p[2],p[0]),sub(p[3],p[0])),b=cross(sub(p[3],p[1]),sub(p[2],p[1])),edgeLength=Math.hypot(...edge),area0=Math.hypot(...a),area1=Math.hypot(...b);
  if(!edgeLength||!area0||!area1)deformableError('E_DEFORM_GEOMETRY','Nondegenerate edge and two triangles required');
  const axis=edge.map(v=>v/edgeLength) as Vec3,n0=a.map(v=>v/area0) as Vec3,n1=b.map(v=>v/area1) as Vec3,angle=angleDifference(Math.atan2(dot(axis,cross(n0,n1)),Math.max(-1,Math.min(1,dot(n0,n1)))),0);
  if(!Number.isFinite(angle))deformableError('E_DEFORM_NUMERIC','Unrepresentable signed dihedral angle');return angle;
}
/** Radians derived after the final projection/contact pass; legacy frames acquire no new keys. */
export function angularSummary(positions:ArrayLike<number>,constraints:KernelConstraint[]):{maxDihedralResidual?:number} {
  let found=false,maximum=0;for(const c of constraints)if(c.kind==='dihedral'){
    found=true;const angle=signedDihedral(c.particles.map(i=>[positions[i*3],positions[i*3+1],positions[i*3+2]]));maximum=Math.max(maximum,Math.abs(angleDifference(angle,c.restAngle)));
  }return found?{maxDihedralResidual:maximum}:{};
}
