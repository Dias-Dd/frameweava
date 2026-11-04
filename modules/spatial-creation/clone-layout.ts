import {linearColor,type StaticCreationColor} from './colors.ts';
import {Quaternion,Vector3,Euler} from 'three';
import {seededRandom} from '../../src/core/time.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {InstanceAttributes} from '../skeletal-effects/native.ts';
import type {AnimatedVec3} from './types.ts';
import {scalar,vector,fail} from './lifecycle.ts';
import {assetOptions,assetNumber,assetVector} from './physics-assets.ts';
export interface CountLayout {count?:number}
export interface LineCloneLayout extends CountLayout {step?:AnimatedVec3}
export interface GridCloneLayout {grid?:readonly [number,number,number];spacing?:AnimatedVec3}
export interface RadialCloneLayout extends CountLayout {radius?:Signal<number>}
export interface SphereCloneLayout extends CountLayout {radius?:Signal<number>}
export interface ScatterCloneLayout extends CountLayout {bounds?:AnimatedVec3}
export interface HelixCloneLayout extends CountLayout {radius?:Signal<number>;height?:Signal<number>;turns?:Signal<number>}
export interface SpiralCloneLayout extends CountLayout {radius?:Signal<number>;turns?:Signal<number>}
export interface HoneycombCloneLayout {grid?:readonly [number,number];spacing?:Signal<number>}
export interface WaveCloneLayout extends GridCloneLayout {amplitude?:Signal<number>;phase?:Signal<number>;speed?:Signal<number>;spread?:AnimatedVec3}
export type CloneLayout=
 |({kind:'line'}&LineCloneLayout)|({kind:'grid'}&GridCloneLayout)
 |({kind:'radial'}&RadialCloneLayout)|({kind:'sphere'}&SphereCloneLayout)
 |({kind:'scatter'}&ScatterCloneLayout)|({kind:'helix'}&HelixCloneLayout)
 |({kind:'spiral'}&SpiralCloneLayout)|({kind:'honeycomb'}&HoneycombCloneLayout)
 |({kind:'wave'}&WaveCloneLayout);
export interface CloneMotion {
 /** Size multiplies the immutable source geometry, not the layout spacing. */
 size?:Signal<number>;sizeVariation?:number;cloneRotation?:AnimatedVec3;cloneSpin?:AnimatedVec3;
 rotationJitter?:readonly [number,number,number];orientation?:'none'|'outward'|'tangent';
 /** Working-linear base-color multipliers, each0..1. */
 palette?:readonly StaticCreationColor[];colorMode?:'cycle'|'random';
}
const fields={line:['count','step'],grid:['grid','spacing'],radial:['count','radius'],sphere:['count','radius'],scatter:['count','bounds'],helix:['count','radius','height','turns'],spiral:['count','radius','turns'],honeycomb:['grid','spacing'],wave:['grid','spacing','amplitude','phase','speed','spread']} as const;
export const cloneMotionKeys=['size','sizeVariation','cloneRotation','cloneSpin','rotationJitter','orientation','palette','colorMode'];
export function cloneCount(layout:CloneLayout){
 if(!layout||!Object.hasOwn(fields,layout.kind))fail('Unknown clone layout');assetOptions(layout,['kind',...fields[layout.kind]],'clone layout');
 let count:number;
 if(layout.kind==='grid'||layout.kind==='wave'||layout.kind==='honeycomb'){
  const grid=layout.grid??(layout.kind==='honeycomb'?[6,4]:[5,3,1]),length=layout.kind==='honeycomb'?2:3;
  if(!Array.isArray(grid)||grid.length!==length||grid.some(n=>!Number.isSafeInteger(n)||n<1))fail('Grid dimensions must be positive integers');count=grid.reduce((a,b)=>a*b,1);
 }else count=layout.count??(layout.kind==='line'?9:layout.kind==='radial'?16:24);
 if(!Number.isSafeInteger(count)||count<0||count>0x7fffffff)fail('Clone count must fit the existing nonnegative instance-count domain','E_CREATION_BUDGET');return count;
}
export function checkCloneMotion(o:CloneMotion){
 assetNumber(o.sizeVariation??0,'sizeVariation',0,1);if(o.sizeVariation===1)fail('sizeVariation must be below1 to preserve positive instance scale');
 if(o.rotationJitter)assetVector(o.rotationJitter,'rotationJitter',0);
 if(o.orientation!==undefined&&!['none','outward','tangent'].includes(o.orientation))fail('Unknown clone orientation');
 if(o.colorMode!==undefined&&!['cycle','random'].includes(o.colorMode))fail('Color mode must be cycle or random');
 if(o.palette!==undefined){if(!Array.isArray(o.palette)||!o.palette.length)fail('palette must be a nonempty list');for(const p of o.palette){const rgb=typeof p==='string'?linearColor(p):assetVector(p,'clone palette',0);rgb.forEach((v:number)=>assetNumber(v,'palette multiplier',0,1));}}
}
/** CPU control values only; all triangle expansion/visibility/pixels use the ORIGINAL Native GPU path. */
export function sampleCloneLayout(layout:CloneLayout,o:CloneMotion,seed:number,c:FrameContext):InstanceAttributes{
 const capacity=cloneCount(layout),size=scalar(o.size??.24,c,'clone size',0),count=size===0?0:capacity,positions=new Float64Array(count*3),rotations=new Float64Array(count*4),scales=new Float64Array(count*3),colors=o.palette?new Float32Array(count*3):undefined;
 const rotation=vector(o.cloneRotation??[0,0,0],c,'clone rotation'),spin=vector(o.cloneSpin??[0,0,0],c,'clone spin'),jitter=o.rotationJitter??[0,0,0],random=(i:number,salt:string)=>seededRandom(seed,i,'creation-clones/1/'+salt),variation=o.sizeVariation??0,deg=Math.PI/180;
 const radius='radius'in layout?scalar(layout.radius??1.2,c,'layout radius',0):1.2,step=layout.kind==='line'?vector(layout.step??[.35,0,0],c,'line step'):[0,0,0],spacing=layout.kind==='grid'||layout.kind==='wave'?vector(layout.spacing??[.45,.45,.45],c,'grid spacing'):[0,0,0],grid=layout.kind==='grid'||layout.kind==='wave'?layout.grid??[5,3,1]:[1,1,1],bounds=layout.kind==='scatter'?vector(layout.bounds??[3,2,1],c,'scatter bounds'):[1,1,1],height=layout.kind==='helix'?scalar(layout.height??2.2,c,'helix height'):0,turns=layout.kind==='helix'||layout.kind==='spiral'?scalar(layout.turns??2,c,'layout turns'):1;
 if(bounds.some(v=>v<0))fail('Scatter bounds must be nonnegative');
 const hexStep=layout.kind==='honeycomb'?scalar(layout.spacing??.4,c,'honeycomb spacing',0):0,hexGrid=layout.kind==='honeycomb'?layout.grid??[6,4]:[1,1];
 const amplitude=layout.kind==='wave'?scalar(layout.amplitude??.28,c,'wave amplitude'):0,phase=layout.kind==='wave'?scalar(layout.phase??0,c,'wave phase')+c.time*scalar(layout.speed??2.4,c,'wave speed'):0,spread=layout.kind==='wave'?vector(layout.spread??[.8,.55,.6],c,'wave spread'):[0,0,0];
 const palette=o.palette?.map(p=>typeof p==='string'?linearColor(p):p);
 const up=new Vector3(0,1,0),q=new Quaternion(),direction=new Vector3();
 for(let i=0;i<count;i++){
  let p:[number,number,number]=[0,0,0],tangent:[number,number,number]=[1,0,0];const u=count<=1?0:i/(count-1),a=2*Math.PI*i/Math.max(count,1);
  switch(layout.kind){
   case 'line':p=step.map(v=>(i-(count-1)/2)*v) as typeof p;tangent=[...step] as typeof p;break;
   case 'grid':case 'wave':{const x=i%grid[0],y=Math.floor(i/grid[0])%grid[1],z=Math.floor(i/(grid[0]*grid[1]));p=[(x-(grid[0]-1)/2)*spacing[0],(y-(grid[1]-1)/2)*spacing[1],(z-(grid[2]-1)/2)*spacing[2]];if(layout.kind==='wave')p[2]+=amplitude*Math.sin(phase+x*spread[0]+y*spread[1]+z*spread[2]);break;}
   case 'radial':p=[radius*Math.cos(a),radius*Math.sin(a),0];tangent=[-Math.sin(a),Math.cos(a),0];break;
   case 'sphere':{const y=1-2*(i+.5)/count,r=Math.sqrt(Math.max(0,1-y*y)),angle=i*Math.PI*(3-Math.sqrt(5));p=[radius*r*Math.cos(angle),radius*y,radius*r*Math.sin(angle)];tangent=[-Math.sin(angle),0,Math.cos(angle)];break;}
   case 'scatter':p=bounds.map((v,k)=>(random(i,'scatter'+k)-.5)*v) as typeof p;break;
   case 'helix':{const angle=u*turns*2*Math.PI;p=[radius*Math.cos(angle),(u-.5)*height,radius*Math.sin(angle)];tangent=[-radius*Math.sin(angle)*turns*2*Math.PI,height,radius*Math.cos(angle)*turns*2*Math.PI];break;}
   case 'spiral':{const angle=u*turns*2*Math.PI,r=radius*Math.sqrt((i+.5)/count);p=[r*Math.cos(angle),r*Math.sin(angle),0];const dr=radius/(2*count*Math.sqrt((i+.5)/count)),da=count>1?turns*2*Math.PI/(count-1):0;tangent=[dr*Math.cos(angle)-r*Math.sin(angle)*da,dr*Math.sin(angle)+r*Math.cos(angle)*da,0];break;}
   case 'honeycomb':{const x=i%hexGrid[0],y=Math.floor(i/hexGrid[0]),shift=hexGrid[1]>1?.25:0;p=[(x-(hexGrid[0]-1)/2+(y%2)*.5-shift)*hexStep,(y-(hexGrid[1]-1)/2)*hexStep*Math.sqrt(3)/2,0];break;}
  }
  positions.set(p,i*3);q.identity();if(o.orientation&&o.orientation!=='none'){direction.fromArray(o.orientation==='outward'?p:tangent);if(direction.lengthSq()>0)q.setFromUnitVectors(up,direction.normalize());}
  q.multiply(new Quaternion().setFromEuler(new Euler(...rotation.map((v,k)=>(v+c.time*spin[k]+(random(i,'rotate'+k)*2-1)*jitter[k])*deg) as [number,number,number],'XYZ'))).normalize();rotations.set(q.toArray(),i*4);
  const scale=size*(1+(random(i,'scale')*2-1)*variation);scales.fill(scale,i*3,i*3+3);
  if(colors){const chosen=palette!,index=o.colorMode==='random'?Math.min(chosen.length-1,Math.floor(random(i,'palette')*chosen.length)):i%chosen.length;colors.set(chosen[index],i*3);}
 }
 return {count,positions,rotations,scales,...colors?{colors}:{}};
}
