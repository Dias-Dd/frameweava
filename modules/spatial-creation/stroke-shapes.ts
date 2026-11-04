import {Euler,Vector3} from 'three';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {Vec3} from '../graphics-contracts/types.ts';
import type {AnimatedVec3} from './types.ts';
import {scalar,vector,fail} from './lifecycle.ts';
export interface StrokeShapeOptions {
 segments?:number;radius?:Signal<number>;length?:Signal<number>;turns?:Signal<number>;
 phase?:Signal<number>;speed?:Signal<number>;center?:AnimatedVec3;rotation?:AnimatedVec3;
}
export type StrokeShape='ring'|'spiral'|'orbits';
export function shapeCount(o:StrokeShapeOptions,closed:boolean){const n=o.segments??(closed?48:72);if(!Number.isSafeInteger(n)||n<(closed?3:1))fail('segments must be a safe integer >= '+(closed?3:1));return closed?n:n+1;}
/** Authored geometric control points only. Original trail sweep handles frames,
 * sections, seams and chunking; no new interpolation or animation clock. */
export function shapePoints(kind:StrokeShape,o:StrokeShapeOptions,c:FrameContext,index=0,count=1):Vec3[]{
 const closed=kind!=='spiral',n=shapeCount(o,closed),r=scalar(o.radius??.95,c,'shape radius',.001),length=scalar(o.length??2.6,c,'spiral length',0),turns=scalar(o.turns??2.4,c,'turns'),phase=scalar(o.phase??0,c,'phase')+c.time*scalar(o.speed??.5,c,'speed'),center=vector(o.center??[0,0,0],c,'center'),rotation=vector(o.rotation??[0,0,0],c,'rotation'),e=new Euler(...rotation,'XYZ');
 return Array.from({length:n},(_,i)=>{const u=i/(closed?n:n-1),t=u*Math.PI*2*(closed?1:turns)+phase;let p:Vec3=kind==='spiral'?[(u-.5)*length,Math.sin(t)*r*.6,Math.cos(t)*r*.6]:[Math.cos(t)*r,Math.sin(t)*r,0];
  if(kind==='orbits'){const tilt=(index/count)*Math.PI;const q=new Vector3(...p).applyEuler(new Euler(tilt,.45*Math.sin(index*2.4),index*.4+phase*.3,'XYZ'));p=q.toArray();}
  if(kind==='ring')p=new Vector3(...p).applyEuler(new Euler(.2+.2*Math.sin(phase),.35+phase*.45,0,'XYZ')).toArray();
  return new Vector3(...p).applyEuler(e).add(new Vector3(...center)).toArray();
 });
}
