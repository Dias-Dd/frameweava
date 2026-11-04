// SPDX-License-Identifier: MIT
// Moving-frame transport adapted from fixed Three0.186.1 Curve.computeFrenetFrames.
// Explicit polyline tangents, atan2 rotation, re-orthogonalization, duplicate stations
// and arc-length holonomy correction are authored adaptations, not unchanged upstream.
import * as THREE from 'three';
import type {Vec3} from './types.ts';
import type {TrailFrames} from './trail-types.ts';

export function trailError(code:string,message:string):never {
  throw Object.assign(new Error(message),{code:'E_TRAIL_'+code});
}
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function unit(v:Vec3,name:string):Vec3 {
  const scale=Math.max(...v.map(Math.abs));
  if(scale===0||!Number.isFinite(scale))trailError('GEOMETRY',name+' is not a representable direction');
  const normalized=v.map(x=>x/scale),size=Math.hypot(...normalized);
  return normalized.map(x=>x/size) as Vec3;
}
function orthogonal(normal:Vec3,tangent:Vec3):Vec3 {
  const projection=dot(normal,tangent);
  return unit(normal.map((x,k)=>x-projection*tangent[k]) as Vec3,'normal');
}
function rotate(v:Vec3,axis:Vec3,angle:number):Vec3 {
  return new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(...axis),angle).toArray() as Vec3;
}
function transport(normal:Vec3,from:Vec3,to:Vec3):Vec3 {
  const axis=cross(from,to),sine=Math.hypot(...axis),cosine=Math.max(-1,Math.min(1,dot(from,to)));
  if(sine===0){if(cosine<0)trailError('CUSP','Opposite successive tangents need an explicit split');return orthogonal(normal,to);}
  return orthogonal(rotate(normal,axis.map(x=>x/sine) as Vec3,Math.atan2(sine,cosine)),to);
}
/** Empty/stationary paths have no well-defined frame and return null, never a fake tangent. */
export function polylineFrames(points:Vec3[],closed:boolean,firstNormal?:Vec3):TrailFrames|null {
  const count=points.length,edgeCount=closed?count:Math.max(0,count-1),edges:(Vec3|undefined)[]=[],lengths=[0];
  for(let i=0;i<edgeCount;i++){
    const d=points[(i+1)%count].map((x,k)=>x-points[i][k]) as Vec3,length=Math.hypot(...d);
    if(!Number.isFinite(length))trailError('RANGE','Centerline length is not representable');
    edges.push(length?unit(d,'edge'):undefined);
    const next=lengths[i]+length;
    if(!Number.isFinite(next)||length>0&&next===lengths[i])trailError('RANGE','Positive centerline length was lost in F64; partition explicitly');
    lengths.push(next);
  }
  if(!count||lengths.at(-1)===0)return null;
  const incoming:(Vec3|undefined)[]=[],outgoing:(Vec3|undefined)[]=[];
  let last=closed?[...edges].reverse().find(Boolean):undefined;
  for(let i=0;i<count;i++){if(i&&edges[i-1])last=edges[i-1];incoming[i]=last;}
  last=closed?edges.find(Boolean):undefined;
  for(let i=count-1;i>=0;i--){if(edges[i])last=edges[i];outgoing[i]=last;}
  const tangents=points.map((_,i)=>{
    const a=incoming[i],b=outgoing[i];
    if(a&&b){const sum=a.map((x,k)=>x+b[k]) as Vec3;if(sum.every(x=>x===0))trailError('CUSP','A reversing station needs an explicit split');return unit(sum,'station tangent');}
    return [...(a??b)!] as Vec3;
  });
  const tangent=tangents[0];let initial:Vec3;
  if(firstNormal)initial=orthogonal(unit(firstNormal,'firstNormal'),tangent);
  else {
    let index=0;for(let k=1;k<3;k++)if(Math.abs(tangent[k])<=Math.abs(tangent[index]))index=k;
    const axis:Vec3=[0,0,0];axis[index]=1;
    initial=unit(cross(tangent,unit(cross(tangent,axis),'initial frame')),'initial normal');
  }
  if(closed)tangents.push([...tangent]);
  const normals:Vec3[]=[initial],binormals:Vec3[]=[unit(cross(tangent,initial),'binormal')];
  for(let i=1;i<tangents.length;i++){
    const n=transport(normals[i-1],tangents[i-1],tangents[i]);
    normals.push(n);binormals.push(unit(cross(tangents[i],n),'binormal'));
  }
  if(closed){
    const end=normals.at(-1)!,angle=Math.atan2(dot(tangent,cross(end,initial)),Math.max(-1,Math.min(1,dot(end,initial)))),total=lengths.at(-1)!;
    for(let i=1;i<tangents.length;i++){
      normals[i]=orthogonal(rotate(normals[i],tangents[i],angle*(lengths[i]/total)),tangents[i]);
      binormals[i]=unit(cross(tangents[i],normals[i]),'closed binormal');
    }
    // The explicit seam has exact source identity; do not let sin(2pi) open a crack.
    normals[count]=[...normals[0]];binormals[count]=[...binormals[0]];
  }
  return {tangents,normals,binormals,lengths};
}
export function twistFrames(frames:TrailFrames,angles:number[],closed:boolean):TrailFrames {
  const normals=frames.normals.map((normal,i)=>orthogonal(rotate(normal,frames.tangents[i],angles[closed&&i===angles.length?0:i]),frames.tangents[i]));
  const binormals=normals.map((normal,i)=>unit(cross(frames.tangents[i],normal),'twisted binormal'));
  if(closed){normals[angles.length]=[...normals[0]];binormals[angles.length]=[...binormals[0]];}
  return {...frames,normals,binormals};
}
