// SPDX-License-Identifier: Apache-2.0
// Closed-form single-point geometric constraints only, not collision/IK/PBD.
import {point,unit,constraint,finite,fields,angle,fail,type Point2D,type PointConstraint2D} from './common.ts';
export interface Box2D {min:Point2D;max:Point2D}
function box(b:Box2D,positive=false){fields(b,['min','max']);const min=point(b.min),max=point(b.max);for(let i=0;i<2;i++)if(positive?max[i]<=min[i]:max[i]<min[i])fail('Ordered '+(positive?'positive ':'')+'box extents required');return {min,max};}
export function constrainBox2D(position:Point2D,bounds:Box2D):Readonly<PointConstraint2D>{const p=point(position),{min,max}=box(bounds);return constraint(p,[Math.max(min[0],Math.min(max[0],p[0])),Math.max(min[1],Math.min(max[1],p[1]))]);}
export interface DistanceConstraintOptions {center:Point2D;min?:number;max:number;coincident?:'rest'|'error';restDirection?:Point2D}
/** Radial nearest projection onto an annulus; no iterative distance solver. */
export function constrainDistance2D(position:Point2D,options:DistanceConstraintOptions):Readonly<PointConstraint2D>{
 fields(options,['center','min','max','coincident','restDirection']);const p=point(position),c=point(options.center),min=finite(options.min??0,'min radius'),max=finite(options.max,'max radius'),policy=options.coincident??'rest';if(min<0||max<min||!['rest','error'].includes(policy))fail('Ordered nonnegative radii and known coincident policy required');
 const dx=finite(p[0]-c[0],'delta x'),dy=finite(p[1]-c[1],'delta y'),r=finite(Math.hypot(dx,dy),'radius');if(r>=min&&r<=max)return constraint(p,p);
 if(r===0){if(policy==='error')fail('Coincident point needs a rest direction');const direction=unit(options.restDirection??[1,0]);return constraint(p,[c[0]+direction[0]*min,c[1]+direction[1]*min],true);}
 const direction=unit([dx,dy]),target=Math.max(min,Math.min(max,r));return constraint(p,[c[0]+direction[0]*target,c[1]+direction[1]*target]);
}
export interface LineConstraintOptions {from:Point2D;to:Point2D;extent?:'line'|'segment'|'ray';degenerate?:'point'|'error'}
/** Euclidean nearest point; line, finite segment and forward ray share one explicit contract. */
export function constrainLine2D(position:Point2D,options:LineConstraintOptions):Readonly<PointConstraint2D>{
 fields(options,['from','to','extent','degenerate']);const p=point(position),a=point(options.from),b=point(options.to),extent=options.extent??'segment',policy=options.degenerate??'point';if(!['line','segment','ray'].includes(extent)||!['point','error'].includes(policy))fail('Known line extent/degenerate policy required');
 const d=point([b[0]-a[0],b[1]-a[1]]),length=finite(Math.hypot(...d),'segment length');if(length===0){if(policy==='error')fail('Degenerate line');return constraint(p,a,true);}
 const u=unit(d),delta=point([p[0]-a[0],p[1]-a[1]]);let along=finite(delta[0]*u[0]+delta[1]*u[1],'projected distance');if(extent!=='line')along=Math.max(0,extent==='segment'?Math.min(length,along):along);
 return constraint(p,[a[0]+u[0]*along,a[1]+u[1]*along]);
}
export interface HalfPlaneOptions {origin:Point2D;normal:Point2D;minDistance?:number}
/** Keep dot(position-origin, normalized normal) >= minDistance, in physical pixels. */
export function constrainHalfPlane2D(position:Point2D,options:HalfPlaneOptions):Readonly<PointConstraint2D>{
 fields(options,['origin','normal','minDistance']);const p=point(position),o=point(options.origin),n=unit(options.normal),limit=finite(options.minDistance??0,'minDistance'),d=finite((p[0]-o[0])*n[0]+(p[1]-o[1])*n[1],'signed distance');
 if(d>=limit)return constraint(p,p);const correction=finite(limit-d,'plane correction');return constraint(p,[p[0]+correction*n[0],p[1]+correction*n[1]]);
}
export interface AngleConstraintOptions {center:Point2D;referenceDegrees?:number;limitsDegrees:readonly [number,number];coincident?:'unchanged'|'error'}
/** Clockwise y-down wedge, shortest signed offset [-180,180); radius is preserved. */
export function constrainAngle2D(position:Point2D,options:AngleConstraintOptions):Readonly<PointConstraint2D>{
 fields(options,['center','referenceDegrees','limitsDegrees','coincident']);const p=point(position),c=point(options.center),reference=finite(options.referenceDegrees??0,'reference'),limits=point(options.limitsDegrees),policy=options.coincident??'unchanged';if(limits[0]<-180||limits[1]>180||limits[1]<limits[0]||!['unchanged','error'].includes(policy))fail('Ordered limits within [-180,180] required');
 const d=point([p[0]-c[0],p[1]-c[1]]),r=finite(Math.hypot(...d),'radius');if(r===0){if(policy==='error')fail('Coincident point has no angle');return constraint(p,p,true);}
 const ref=angle(reference),requested=Math.atan2(d[1],d[0])-ref;let degrees=(requested*180/Math.PI)%360;if(degrees< -180)degrees+=360;if(degrees>=180)degrees-=360;
 const limited=Math.max(limits[0],Math.min(limits[1],degrees));if(limited===degrees)return constraint(p,p);const a=ref+limited*Math.PI/180;return constraint(p,[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)]);
}
function threshold(n:number){if(n===Infinity)return n;finite(n,'maxDistance');if(n<0)fail('Nonnegative snap distance required');return n;}
/** Nearest grid intersection; ties go toward positive coordinates. Optional radial snap threshold. */
export function snapGrid2D(position:Point2D,options:{step:Point2D;origin?:Point2D;maxDistance?:number}):Readonly<PointConstraint2D>{
 fields(options,['step','origin','maxDistance']);const p=point(position),step=point(options.step),o=point(options.origin??[0,0]),limit=threshold(options.maxDistance??Infinity);if(step.some(x=>x<=0))fail('Positive grid steps required');
 const q=point(p.map((v,i)=>{const phase=finite((v-o[i])/step[i],'grid phase');if(Math.abs(phase)>Number.MAX_SAFE_INTEGER)fail('Grid phase exceeds Float64 integer resolution');return o[i]+Math.round(phase)*step[i];}) as unknown as Point2D);return constraint(p,Math.hypot(q[0]-p[0],q[1]-p[1])<=limit?q:p);
}
/** Independent X/Y guide snap; ties choose the first supplied guide, no guide sorting/mutation. */
export function snapGuides2D(position:Point2D,options:{x?:readonly number[];y?:readonly number[];maxDistance?:number}):Readonly<PointConstraint2D>{
 fields(options,['x','y','maxDistance']);const p=point(position),limit=threshold(options.maxDistance??Infinity),out=[...p];
 for(const [i,guides]of [options.x??[],options.y??[]].entries()){if(!Array.isArray(guides))fail('Guide arrays required');let best=Infinity;for(const guide of guides){finite(guide,'guide');const d=Math.abs(guide-p[i]);if(d<best&&d<=limit){best=d;out[i]=guide;}}}
 return constraint(p,point(out as unknown as Point2D));
}
/** Coordinate tiling, not collision response: output is in [min,max) on each axis. */
export function wrapPosition2D(position:Point2D,bounds:Box2D):Readonly<PointConstraint2D>{
 const p=point(position),{min,max}=box(bounds,true),out=p.map((v,i)=>{const span=finite(max[i]-min[i],'span'),delta=finite(v-min[i],'relative coordinate');if(Math.abs(delta/span)>Number.MAX_SAFE_INTEGER)fail('Wrap phase exceeds Float64 resolution');let phase=delta%span;if(phase<0)phase+=span;const n=finite(min[i]+phase,'wrapped coordinate');if(n>=max[i])fail('Wrapped coordinate is below Float64 spatial resolution');return n;});return constraint(p,point(out as unknown as Point2D));
}
/** Mirror tiling on a closed box, with no collision/velocity-history state. */
export function mirrorPosition2D(position:Point2D,bounds:Box2D):Readonly<PointConstraint2D>{
 const p=point(position),{min,max}=box(bounds,true),out=p.map((v,i)=>{const span=finite(max[i]-min[i],'span'),delta=finite(v-min[i],'relative coordinate'),cycles=delta/span;if(Math.abs(cycles)>Number.MAX_SAFE_INTEGER)fail('Mirror phase exceeds Float64 resolution');let phase=delta%span;if(phase<0)phase+=span;return Math.abs(Math.floor(cycles)%2)===1?max[i]-phase:min[i]+phase;});return constraint(p,point(out as unknown as Point2D));
}
