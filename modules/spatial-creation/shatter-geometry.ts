// SPDX-License-Identifier: MIT
// Pattern construction, blast falloff and drag factors adapted from EffectCraft
// sim2/shatter.rs at the revision recorded in UPSTREAM.json (MIT).
import {Matrix4,Quaternion,Vector3} from 'three';
import {seededRandom} from '../../src/core/time.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {MeshData} from '../graphics-contracts/types.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';
import {assetNumber,assetOptions} from './physics-assets.ts';
import {scalar,vector,fail} from './lifecycle.ts';
import type {AnimatedVec3} from './types.ts';
export type ShatterPoint=readonly [number,number];
export interface ShatterCell {id:number;group?:number;polygon:readonly ShatterPoint[]}
export interface ShatterFragment {id:number;group:number;center:readonly [number,number,number];positions:readonly (readonly [number,number,number])[];uvs:readonly ShatterPoint[];indices:readonly number[];interior:readonly boolean[]}
const n=(v:number,name:string,min=-Infinity,max=Infinity)=>assetNumber(v,name,min,max);
const integer=(v:number,name:string,min=0)=>{n(v,name,min);if(!Number.isSafeInteger(v))fail(name+' must be a safe integer');return v;};
/** Sutherland-Hodgman clipping. Output winding is preserved; duplicate edge
 * vertices are removed so extrusion has no zero-length side quads. */
export function clipShatterPolygon(polygon:readonly ShatterPoint[],bounds:readonly [number,number,number,number]):[number,number][]{
 if(!Array.isArray(polygon)||polygon.length<3||bounds.length!==4)fail('A polygon and min/max XY bounds required');bounds.forEach(v=>n(v,'clip bound'));if(bounds[0]>=bounds[2]||bounds[1]>=bounds[3])fail('Clip bounds must increase');let out=polygon.map(p=>{if(!Array.isArray(p)||p.length!==2)fail('Polygon requires XY vertices');return [n(p[0],'X'),n(p[1],'Y')] as [number,number];});
 for(const [axis,bound,sign]of [[0,bounds[0],1],[0,bounds[2],-1],[1,bounds[1],1],[1,bounds[3],-1]]){const input=out;out=[];if(!input.length)break;let a=input.at(-1)!,da=(a[axis]-bound)*sign;for(const b of input){const db=(b[axis]-bound)*sign;if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}if(db>=0)out.push(b);a=b;da=db;}}
 return out.filter((p,i)=>{const q=out[(i+out.length-1)%out.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>1e-12;});
}
export interface ShatterPatternOptions {pattern?:'bricks'|'glass'|'hexagons'|'squares'|'triangles';size?:readonly [number,number];cell?:number;seed?:number;maxCells?:number}
export function shatterPattern(o:ShatterPatternOptions={}):ShatterCell[]{
 assetOptions(o,['pattern','size','cell','seed','maxCells'],'shatter pattern');const [width,height]=o.size??[3,1.7],cell=n(o.cell??.4,'cell size',Number.MIN_VALUE),pattern=o.pattern??'glass',seed=integer(o.seed??1,'seed');n(width,'width',Number.MIN_VALUE);n(height,'height',Number.MIN_VALUE);if(!['bricks','glass','hexagons','squares','triangles'].includes(pattern))fail('Unknown shatter pattern');const max=integer(o.maxCells??100000,'maxCells',1),bounds:[number,number,number,number]=[-width/2,-height/2,width/2,height/2];
 const estimate=(Math.ceil(width/cell)+6)*(Math.ceil(height/cell)+6)*8;if(!Number.isSafeInteger(estimate)||estimate>max*32)fail('Shatter pattern exceeds configurable planning budget','E_CREATION_BUDGET');
 const cells:ShatterCell[]=[];const push=(polygon:readonly ShatterPoint[])=>{const p=clipShatterPolygon(polygon,bounds);if(p.length<3)return;let area=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];area+=p[i][0]*q[1]-q[0]*p[i][1];}if(Math.abs(area)<1e-12)return;if(cells.length>=max)fail('Shatter pattern exceeds maxCells','E_CREATION_BUDGET');cells.push({id:cells.length,polygon:area>0?p:p.reverse()});};
 const x0=Math.floor(bounds[0]/cell)-2,x1=Math.ceil(bounds[2]/cell)+2,y0=Math.floor(bounds[1]/cell)-2,y1=Math.ceil(bounds[3]/cell)+2;
 if(pattern==='hexagons'){const r=cell/Math.sqrt(3),dx=1.5*r,dy=cell;for(let i=Math.floor(bounds[0]/dx)-2;i<=Math.ceil(bounds[2]/dx)+2;i++)for(let j=y0;j<=y1;j++){const x=i*dx,y=(j+(i%2!==0?.5:0))*dy;push(Array.from({length:6},(_,k)=>[x+r*Math.cos(k*Math.PI/3),y+r*Math.sin(k*Math.PI/3)] as const));}return cells;}
 const jitter=(i:number,j:number):[number,number]=>[(i+(seededRandom(seed,i,j+':17')*2-1)*.35)*cell,(j+(seededRandom(seed,i,j+':91')*2-1)*.35)*cell];
 for(let j=pattern==='bricks'?y0*2:y0;j<=(pattern==='bricks'?y1*2:y1);j++)for(let i=x0;i<=x1;i++){const h=pattern==='bricks'?cell*.5:cell,x=i*cell+(pattern==='bricks'&&j%2!==0?cell*.5:0),y=j*h;
  const p:ShatterPoint[]=pattern==='glass'?[jitter(i,j),jitter(i+1,j),jitter(i+1,j+1),jitter(i,j+1)]:[[x,y],[x+cell,y],[x+cell,y+h],[x,y+h]];
  if(pattern==='glass'||pattern==='triangles'){const diagonal=pattern==='glass'?seededRandom(seed,i,j+':85')<.5:(i+j)%2===0;if(diagonal){push([p[0],p[1],p[2]]);push([p[0],p[2],p[3]]);}else{push([p[0],p[1],p[3]]);push([p[1],p[2],p[3]]);}}else push(p);
 }return cells;
}
/** Explicit finite label-map adapter, not a hidden readback of a GPU image.
 * Equal labels share motion even when their cells are disconnected. */
export function shatterMapCells(map:{width:number;height:number;labels:ArrayLike<number>;size?:readonly [number,number];skip?:number;maxCells?:number}):ShatterCell[]{
 assetOptions(map,['width','height','labels','size','skip','maxCells'],'shatter map');const w=integer(map.width,'map width',1),h=integer(map.height,'map height',1),count=w*h;if(!Number.isSafeInteger(count)||count!==map.labels.length||count>(map.maxCells??100000))fail('Shatter label map length/budget mismatch');const [sx,sy]=map.size??[3,1.7];n(sx,'width',Number.MIN_VALUE);n(sy,'height',Number.MIN_VALUE);const result:ShatterCell[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const id=y*w+x,group=integer(map.labels[id],'label');if(group===map.skip)continue;const a=-sx/2+x*sx/w,b=sy/2-(y+1)*sy/h;result.push({id,group,polygon:[[a,b],[a+sx/w,b],[a+sx/w,b+sy/h],[a,b+sy/h]]});}return result;
}
/** Closed front/back/side topology. A zero thickness deliberately has only its
 * front, preserving a transparent input rather than painting a hidden back. */
export function extrudeShatterFragments(cells:readonly ShatterCell[],o:{size?:readonly [number,number];thickness?:number;gap?:number;maxVertices?:number}={}):ShatterFragment[]{
 assetOptions(o,['size','thickness','gap','maxVertices'],'shatter extrusion');const [sx,sy]=o.size??[3,1.7],depth=n(o.thickness??.06,'thickness',0),gap=n(o.gap??0,'gap',0,.99),max=integer(o.maxVertices??1000000,'maxVertices',1);n(sx,'width',Number.MIN_VALUE);n(sy,'height',Number.MIN_VALUE);let total=0;const ids=new Set<number>();
 return cells.map(cell=>{integer(cell.id,'fragment id');if(ids.has(cell.id))fail('Fragment IDs must be unique');ids.add(cell.id);const p=cell.polygon;if(p.length<3)fail('Fragment polygons need three vertices');const center:[number,number,number]=[0,0,0];for(const q of p){if(q.length!==2)fail('Expected XY polygon');center[0]+=n(q[0],'X')/p.length;center[1]+=n(q[1],'Y')/p.length;}let crossSign=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],c=p[(i+2)%p.length],cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(cross)>1e-12){if(crossSign&&Math.sign(cross)!==crossSign)fail('Custom shatter cells must be convex');crossSign=Math.sign(cross);}}if(!crossSign)fail('Degenerate fragment');const outline=crossSign>0?p:[...p].reverse();
  total+=outline.length*(depth>0?6:1);if(total>max)fail('Extrusion exceeds maxVertices','E_CREATION_BUDGET');const positions:[number,number,number][]=[],uvs:[number,number][]=[],indices:number[]=[],interior:boolean[]=[];const vertex=(q:ShatterPoint,z:number,side:boolean)=>{positions.push([(q[0]-center[0])*(1-gap),(q[1]-center[1])*(1-gap),z]);uvs.push([q[0]/sx+.5,.5-q[1]/sy]);interior.push(side);return positions.length-1;};
  outline.forEach(q=>vertex(q,0,false));for(let i=1;i+1<outline.length;i++)indices.push(0,i,i+1);if(depth>0){const back=positions.length;outline.forEach(q=>vertex(q,-depth,false));for(let i=1;i+1<outline.length;i++)indices.push(back,back+i+1,back+i);for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],base=positions.length;vertex(a,0,true);vertex(b,0,true);vertex(b,-depth,true);vertex(a,-depth,true);indices.push(base,base+1,base+2,base,base+2,base+3);}}
  return {id:cell.id,group:cell.group??cell.id,center,positions,uvs,indices,interior};
 });
}
/** Controlled conversion of an existing Graphics MeshData into independently
 * driven triangular fragments. UVs and true 3D normals survive extrusion. */
export function fractureMesh(asset:MeshData,o:{thickness?:number;maxVertices?:number}={}):ShatterFragment[]{
 const m=validateMeshData(asset),depth=n(o.thickness??0,'thickness',0);if(m.indices.length*6>(o.maxVertices??1000000))fail('Mesh fracture exceeds maxVertices','E_CREATION_BUDGET');const out:ShatterFragment[]=[];
 for(let t=0;t<m.indices.length;t+=3){const points=m.indices.slice(t,t+3).map(i=>new Vector3(...m.restPositions[i])),normal=new Vector3().subVectors(points[1],points[0]).cross(new Vector3().subVectors(points[2],points[0]));if(normal.length()<1e-12)fail('Cannot fracture a degenerate mesh triangle');normal.normalize();const center=points.reduce((a,p)=>a.add(p),new Vector3()).multiplyScalar(1/3),positions:[number,number,number][]=[],uvs:[number,number][]=[],interior:boolean[]=[];const emit=(k:number,z:number,side:boolean)=>{positions.push(points[k].clone().sub(center).addScaledVector(normal,-z).toArray());const uv=m.uv?.[m.indices[t+k]];uvs.push(uv?[uv[0],uv[1]]:[k===1?1:0,k===2?1:0]);interior.push(side);};points.forEach((_,k)=>emit(k,0,false));const indices=[0,1,2];if(depth>0){points.forEach((_,k)=>emit(k,depth,false));indices.push(3,5,4);for(let k=0;k<3;k++){const b=positions.length;emit(k,0,true);emit((k+1)%3,0,true);emit((k+1)%3,depth,true);emit(k,depth,true);indices.push(b,b+1,b+2,b,b+2,b+3);}}out.push({id:t/3,group:t/3,center:center.toArray(),positions,uvs,indices,interior});}return out;
}
export interface ShatterBlast {center:readonly [number,number,number];radius:number;strength:number;at?:number}
export function shatterBlast(o:ShatterBlast):ShatterBlast{assetOptions(o,['center','radius','strength','at'],'shatter blast');if(!Array.isArray(o.center)||o.center.length!==3)fail('Blast center requires XYZ');o.center.forEach(v=>n(v,'center'));n(o.radius,'radius',Number.MIN_VALUE);n(o.strength,'strength');n(o.at??0,'at',0);return structuredClone(o);}
export interface ShatterMotion {blasts?:readonly ShatterBlast[];gravity?:AnimatedVec3;drag?:number;tumble?:number;randomness?:number;massVariation?:number;seed?:number;amount?:Signal<number>}
/** Absolute-time closed form of the original damped ballistic factors. It
 * never advances frame time, accumulates state or depends on request order. */
export function shatterPose(fragments:readonly ShatterFragment[],c:FrameContext,o:ShatterMotion={}):readonly number[][]{
 assetOptions(o,['blasts','gravity','drag','tumble','randomness','massVariation','seed','amount'],'shatter motion');const blasts=(o.blasts??[{center:[0,0,-.4],radius:3,strength:2}]).map(shatterBlast),drag=n(o.drag??.2,'drag',0),tumble=n(o.tumble??1.2,'tumble'),random=n(o.randomness??.12,'randomness',0),mass=n(o.massVariation??.2,'massVariation',0,.99),seed=integer(o.seed??1,'seed'),amount=scalar(o.amount??1,c,'amount',0),gravity=vector(o.gravity??[0,-.65,0],c,'gravity'),groups=new Map<number,Vector3[]>();
 for(const f of fragments){let v=groups.get(f.group);if(!v){v=[];groups.set(f.group,v);}v.push(new Vector3(...f.center));}const centers=new Map([...groups].map(([id,p])=>[id,p.reduce((a,b)=>a.add(b),new Vector3()).multiplyScalar(1/p.length)]));
 return fragments.map(f=>{const center=centers.get(f.group)!,move=new Vector3(),velocity=new Vector3();let active=false,earliest=Infinity,angle=0;for(const blast of blasts){const t=(c.time-(blast.at??0))*amount;if(t<0)continue;const delta=center.clone().sub(new Vector3(...blast.center)),distance=delta.length();if(distance>=blast.radius)continue;active=true;earliest=Math.min(earliest,blast.at??0);const k=blast.strength*(1-distance/blast.radius)/Math.max(distance,1e-6)/(1+mass*(seededRandom(seed,f.group,1)*2-1));velocity.addScaledVector(delta,k);const f1=drag<1e-6?t:-Math.expm1(-drag*t)/drag;move.addScaledVector(delta,k*f1);angle+=tumble*(.5+seededRandom(seed,f.group,9))*Math.min(10,delta.clone().multiplyScalar(k).length())*f1;}
  const rotation=new Quaternion();if(active){const t=Math.max(0,(c.time-earliest)*amount),f1=drag<1e-6?t:-Math.expm1(-drag*t)/drag,f2=drag<1e-6?.5*t*t:t/drag+Math.expm1(-drag*t)/(drag*drag),axis=new Vector3(...[6,7,8].map(k=>seededRandom(seed,f.group,k)*2-1) as [number,number,number]);if(axis.length()<1e-9)axis.set(1,0,0);axis.normalize();rotation.setFromAxisAngle(axis,blasts.length===1?tumble*(.5+seededRandom(seed,f.group,9))*Math.min(10,velocity.length())*f1:angle);for(let k=0;k<3;k++)move.setComponent(k,move.getComponent(k)+(seededRandom(seed,f.group,k+2)*2-1)*random*f1+gravity[k]*f2);}
  const position=new Vector3(...f.center).sub(center).applyQuaternion(rotation).add(center).add(move);return new Matrix4().compose(position,rotation,new Vector3(1,1,1)).elements;
 });
}
