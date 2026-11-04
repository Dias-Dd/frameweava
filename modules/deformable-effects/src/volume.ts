// SPDX-License-Identifier: Apache-2.0
// Internal module geometry, not a new shared Graphics contract or Simulation Runner.
import {deformableError,type Vec3,type KernelConstraint} from './codec.ts';
export function signedVolume(p:Vec3[]):number {
  const a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]),c=p[3].map((v,k)=>v-p[0][k]);
  const determinant=(a[1]*b[2]-a[2]*b[1])*c[0]+(a[2]*b[0]-a[0]*b[2])*c[1]+(a[0]*b[1]-a[1]*b[0])*c[2],volume=determinant/6;
  if(!Number.isFinite(determinant)||!Number.isFinite(volume)||determinant!==0&&volume===0)deformableError('E_DEFORM_NUMERIC','Unrepresentable signed tetrahedron volume');return volume;
}
/** Derived from returned F64 positions after the final contact projection. No hidden mutable state. */
export function volumeSummary(positions:ArrayLike<number>,constraints:KernelConstraint[]){let maxVolumeResidual=0,invertedTetrahedra=0,collapsedTetrahedra=0;for(const c of constraints)if(c.kind==='volume'){const current=signedVolume(c.particles.map(i=>[positions[i*3],positions[i*3+1],positions[i*3+2]])),residual=Math.abs(current-c.restVolume);if(!Number.isFinite(residual))deformableError('E_DEFORM_NUMERIC','Unrepresentable volume residual');maxVolumeResidual=Math.max(maxVolumeResidual,residual);if(current===0)collapsedTetrahedra++;else if((current<0)!==(c.restVolume<0))invertedTetrahedra++;}return {maxVolumeResidual,invertedTetrahedra,collapsedTetrahedra};}
