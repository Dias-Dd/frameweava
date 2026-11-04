// SPDX-License-Identifier: MIT
// Tube cross-section/index construction adapted from pinned Three0.186.1 TubeGeometry.
// Fixed topology, variable-width/twist ribbons, F64 coordinates and chunk planning are adaptations.
import {validateMeshData} from '../../graphics-contracts/validate.ts';
import {assertJson,checkSignals} from '../../../src/core/graph.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {object,dense,integer,number,vector,boolean,localContext} from './check.ts';
import {polylineFrames,twistFrames,trailError} from './trail-frames.ts';
import type {MeshData,Vec3} from './types.ts';
import type {TrailGeometryOptions,TrailGeometry,TrailSampleOptions,TrailSample} from './trail-types.ts';

function translate(e:unknown):never {
  const v=e as {code?:string;message?:string};
  if(v.code?.startsWith('E_RIG_'))throw Object.assign(new Error(v.message,{cause:e}),{code:v.code.replace('E_RIG_','E_TRAIL_')});
  throw e;
}
/** CPU geometry only. Reuse createMeshRenderer for real GPU surfaces; no second renderer/time system. */
export function createTrailGeometry(options:TrailGeometryOptions):TrailGeometry {try{
  const o=object(options,'trail geometry',['id','pointCount','kind','radialSegments','closed','caps','coordinates','maxVerticesPerMesh','maxBytes','maxWork']),kind=o.kind??'tube';
  if(typeof o.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(o.id))trailError('PARAMETER','An explicit Graphics stable mesh ID is required');
  if(kind!=='tube'&&kind!=='ribbon')trailError('PARAMETER','Expected tube or ribbon');
  const closed=boolean(o.closed??false,'closed'),caps=boolean(o.caps??false,'caps'),pointCount=integer(o.pointCount,'pointCount',closed?3:2),radial=kind==='tube'?integer(o.radialSegments??8,'radialSegments',3):1;
  if(kind==='ribbon'&&o.radialSegments!==undefined||caps&&(kind==='ribbon'||closed))trailError('PARAMETER','radialSegments is tube-only; caps are open-tube-only');
  const ring=kind==='tube'?radial+1:2,rings=pointCount+Number(closed),maxBytes=integer(o.maxBytes??128*1024*1024,'maxBytes'),maxWork=integer(o.maxWork??100000000,'maxWork'),maxVertices=integer(o.maxVerticesPerMesh??16384,'maxVerticesPerMesh',1,16384),reserve=caps?2:0;
  // Existing Graphics v1 limits, not a new whole-trail count cap. Every chunk is validated below.
  const chunkRings=Math.min(Math.floor((maxVertices-reserve)/ring),Math.floor((100000-(caps?radial*6:0))/(radial*6))+1);
  if(chunkRings<2)trailError('BUDGET','One cross-section pair exceeds existing Graphics v1 mesh layout');
  const chunkCount=Math.ceil((rings-1)/(chunkRings-1)),vertices=(rings+chunkCount-1)*ring+reserve,triangles=(rings-1)*radial*2+(caps?radial*2:0),plannedBytes=vertices*160+triangles*24+pointCount*256,work=vertices*64+pointCount*256;
  if(![chunkCount,vertices,triangles,plannedBytes,work].every(Number.isSafeInteger)||plannedBytes>maxBytes||work>maxWork)trailError('BUDGET','Trail numeric plan exceeds explicit bytes/work budget');
  const coordinates=o.coordinates??{spaceId:'trail.world',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},chunks:{id:string;start:number;end:number;firstCap:boolean;lastCap:boolean}[]=[];
  for(let start=0;start<rings-1;){const end=Math.min(rings-1,start+chunkRings-1);chunks.push({id:chunkCount===1?o.id:o.id+'.'+chunks.length,start,end,firstCap:caps&&start===0,lastCap:caps&&end===rings-1});start=end;}
  let disposed=false;function check(){if(disposed)trailError('DISPOSED','Trail geometry disposed');}
  function values(raw:unknown,fallback:number,n:number,name:string,context:TrailSampleOptions['context']):number[]{
    const rows=Array.isArray(raw)?dense(raw,name):Array(n).fill(raw??fallback);
    if(rows.length!==n)trailError('TOPOLOGY','One '+name+' per supplied station required');
    assertJson(rows);checkSignals(rows);
    if(rows.some(x=>typeof x!=='number')&&!context)trailError('CONTEXT','Signal '+name+' requires FrameContext');
    return (context?evaluate(rows,context):rows).map((v:unknown)=>number(v,name,name==='radius'?0:-Number.MAX_VALUE));
  }
  function sample(input:TrailSampleOptions):TrailSample {try{
    check();const s=object(input,'trail sample',['points','radius','twist','firstNormal','context']),points=dense(s.points,'trail points').map(p=>vector(p,'trail point'));
    if(points.length>pointCount||closed&&points.length!==pointCount)trailError('TOPOLOGY','Open points must fit capacity; closed points need every declared station');
    const context=s.context===undefined?undefined:localContext(s.context),radii=values(s.radius,.05,points.length,'radius',context),angles=values(s.twist,0,points.length,'twist',context),first=s.firstNormal===undefined?undefined:vector(s.firstNormal,'firstNormal');
    const raw=polylineFrames(points,closed,first),active=raw!==null&&radii.some(r=>r>0),frames=raw?twistFrames(raw,angles,closed):{tangents:[],normals:[],binormals:[],lengths:[]},pad=pointCount-points.length;
    function position(station:number,j:number):Vec3 {
      if(raw===null)return [...(points[0]??[0,0,0])] as Vec3;
      // Repeat the complete first ring, not its center: unused slots must not invent an end cap.
      const i=Math.max(0,station-pad),index=closed&&i===points.length?0:i,p=points[index],n=frames.normals[i],b=frames.binormals[i],angle=j/radial*Math.PI*2,c=kind==='tube'?-Math.cos(angle):j===0?-1:1,s=kind==='tube'?Math.sin(angle):0;
      // Exact duplicated radial seam, avoiding a sin(2pi) position crack.
      if(kind==='tube'&&j===radial)return position(station,0);
      const result=p.map((x,k)=>number(x+radii[index]*(c*n[k]+s*b[k]),'sweep vertex')) as Vec3;
      if(radii[index]>0&&result.every((x,k)=>x===p[k]))trailError('RANGE','Positive cross-section collapsed in F64; supply local points and an explicit model transform');
      return result;
    }
    const draws=chunks.map(chunk=>{
      const positions:Vec3[]=[];for(let i=chunk.start;i<=chunk.end;i++)for(let j=0;j<ring;j++)positions.push(position(i,j));
      if(chunk.firstCap)positions.push([...(points[0]??[0,0,0])] as Vec3);
      if(chunk.lastCap)positions.push([...(points.at(-1)??[0,0,0])] as Vec3);
      return {id:chunk.id,positions,visible:active};
    });
    return {draws,frames,active,stations:points.length,totalLength:raw?.lengths.at(-1)??0};
  }catch(e){translate(e);}}
  // Rest topology is a harmless straight unit-spaced curve; samples never inherit it as state.
  const restPoints=Array.from({length:pointCount},(_,i)=>[i,0,0] as Vec3);
  if(closed)for(let i=0;i<pointCount;i++)restPoints[i]=[Math.cos(i/pointCount*Math.PI*2),Math.sin(i/pointCount*Math.PI*2),0];
  const rest=sample({points:restPoints}),meshes=chunks.map((chunk,index)=>{
    const indices:number[]=[],uv:[number,number][]=[],rows=chunk.end-chunk.start+1;
    for(let i=0;i<rows;i++)for(let j=0;j<ring;j++)uv.push([(chunk.start+i)/(rings-1),j/radial]);
    for(let i=0;i<rows-1;i++)for(let j=0;j<radial;j++){const a=i*ring+j,b=a+ring;indices.push(a,b,a+1,b,b+1,a+1);}
    let center=rows*ring;
    if(chunk.firstCap){for(let j=0;j<radial;j++)indices.push(center,j,j+1);uv.push([0,.5]);center++;}
    if(chunk.lastCap){for(let j=0;j<radial;j++)indices.push(center,(rows-1)*ring+j+1,(rows-1)*ring+j);uv.push([1,.5]);}
    return validateMeshData({schema:'frameweave.mesh',version:1,id:chunk.id,coordinates,topology:'triangles',vertexIds:rest.draws[index].positions!.map((_,i)=>'v'+i),restPositions:rest.draws[index].positions!,indices,uv,uvOrigin:'top-left'});
  });
  return {meshes,sample,describe(){check();return {kind,pointCount,closed,chunks:chunks.length,vertices,triangles,plannedBytes,maxBytes,maxWork};},dispose(){disposed=true;}};
}catch(e){translate(e);}}
