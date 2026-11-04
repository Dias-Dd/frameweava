// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
export interface JustificationVariable {id:string;min:number;preferred:number;max:number;coefficient:number;weight:number}
export interface JustificationFit {values:Readonly<Record<string,number>>;achieved:number;residual:number;cost:number;fitness:0|1|2|3}
const fail=(message:string):never=>{throw new EngineError('E_PA_COMPOSE_PARAMETER',message);};
/** Exact active-set solution of a bounded, strictly convex diagonal quadratic.
 * Contributions are coefficient*(value-preferred). This jointly solves controls,
 * rather than filling spaces first then silently stretching glyphs to fit leftovers. */
export function solveJustification(delta:number,input:readonly JustificationVariable[]):JustificationFit {
 if(!Number.isFinite(delta)||!Array.isArray(input))fail('Finite target and typed justification controls required');
 const rows=input.map(r=>({...r})),ids=new Set<string>();
 for(const r of rows){if(!r.id||ids.has(r.id)||![r.min,r.preferred,r.max,r.coefficient,r.weight].every(Number.isFinite)||r.min>r.preferred||r.preferred>r.max||r.coefficient<0||r.weight<=0)fail('Unique controls with ordered bounds, nonnegative coefficient and positive weight required');ids.add(r.id);}
 const lower=rows.reduce((s,r)=>s+r.coefficient*(r.min-r.preferred),0),upper=rows.reduce((s,r)=>s+r.coefficient*(r.max-r.preferred),0),target=Math.max(lower,Math.min(upper,delta)),values=rows.map(r=>r.preferred),active=new Set(rows.map((_,i)=>i).filter(i=>rows[i].coefficient>0&&rows[i].min<rows[i].max));
 if(!Number.isFinite(lower)||!Number.isFinite(upper))fail('Justification coefficients exceed Float64 range; rescale physical units');
 let fixed=0;
 while(active.size){
  let denominator=0;for(const i of active){const r=rows[i];denominator+=r.coefficient*r.coefficient/(2*r.weight);}
  if(!Number.isFinite(denominator)||denominator===0)fail('Justification conditioning exceeds Float64 range');
  const lambda=(target-fixed)/denominator,clamped:number[]=[];
  for(const i of active){const r=rows[i],v=r.preferred+lambda*r.coefficient/(2*r.weight);values[i]=Math.max(r.min,Math.min(r.max,v));if(v<r.min||v>r.max)clamped.push(i);}
  if(!clamped.length)break;
  for(const i of clamped){active.delete(i);fixed+=rows[i].coefficient*(values[i]-rows[i].preferred);}
 }
 const achieved=rows.reduce((s,r,i)=>s+r.coefficient*(values[i]-r.preferred),0),cost=rows.reduce((s,r,i)=>s+r.weight*(values[i]-r.preferred)**2,0),ratio=delta<0?lower===0?0:delta/-lower:upper===0?0:delta/upper;
 if(![achieved,cost].every(Number.isFinite))fail('Justification result exceeds Float64 range');
 return {values:Object.freeze(Object.fromEntries(rows.map((r,i)=>[r.id,values[i]]))),achieved,residual:delta-achieved,cost,fitness:ratio<0?0:ratio<1/3?1:ratio<2/3?2:3};
}
