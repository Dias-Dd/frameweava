// SPDX-License-Identifier: Apache-2.0 AND MIT
// Thin original Three ExtrudeGeometry adapter over existing Clipper2 canonical fills.
import {ExtrudeGeometry,Shape,Path} from 'three';
import {EngineError} from '../../../../src/core/errors.ts';import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal,Diagnostic} from '../../../../src/core/types.ts';
import * as graphics from '../../../graphics-contracts/index.ts';import type {PathData,MeshData,Vec3} from '../../../graphics-contracts/types.ts';
import type {createPathOperations,PathOperationOptions} from '../path-operations.ts';
import {canonicalFilledFaces} from '../filled-faces.ts';
export type ExtrusionSurface='front'|'back'|'side'|'bevel';
export interface ExtrusionOptions extends PathOperationOptions {
 depth:Signal<number>;unitsPerPixel?:number;anchor?:readonly[number,number];origin?:'front'|'center'|'back';
 bevel?:{size:Signal<number>;thickness?:Signal<number>;offset?:Signal<number>;segments?:number;tolerance?:number};steps?:number;id?:string;
}
export interface ExtrusionPart {surface:ExtrusionSurface;mesh:MeshData;normals:Vec3[]}
export interface ExtrudedGeometry {parts:readonly ExtrusionPart[];diagnostics:readonly Diagnostic[];metrics:{faces:number;triangles:number;redundantTriangles:number;depthPixels:number;bevelSegments:number;unitsPerPixel:number;anchor:readonly[number,number];bounds:{min:Vec3;max:Vec3}|null;upstream:'three@0.186.1';positionPrecision:'original F32 geometry; explicit local rebase'}}
type Operations=Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>;
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_EXTRUSION',message,{details});};
const scalar=(v:Signal<number>,c:FrameContext|undefined,name:string)=>{if(typeof v!=='number'&&!c)fail(name+' Signal requires existing FrameContext');const n=typeof v==='number'?v:evaluate(v,c!);if(!Number.isFinite(n))fail(name+' must be finite');return n;};
/** Tolerance-driven quarter-ellipse subdivision, not a fixed artistic bevel cap. */
export function extrusionBevelSegments(radius:number,tolerance:number){if(!Number.isFinite(radius)||radius<0||!Number.isFinite(tolerance)||tolerance<=0)fail('Finite radius and positive bevel tolerance required');if(radius===0||tolerance>=radius)return 1;const angle=2*Math.acos(1-tolerance/radius),count=Math.ceil(Math.PI/2/angle);if(!Number.isSafeInteger(count)||angle===0)fail('Requested bevel accuracy is below Float64 angular resolution');return Math.max(1,count);}
function shapes(face:PathData,anchor:readonly[number,number],scale:number){
 const rings:[number,number][][]=[];let ring:[number,number][]|undefined;
 for(const c of face.commands){if(c.op==='M'){if(ring)fail('Closed previous canonical contour required');ring=[[(c.point.x-anchor[0])*scale,-(c.point.y-anchor[1])*scale]];}else if(c.op==='L'){if(!ring)fail('Canonical contour must start with M');ring!.push([(c.point.x-anchor[0])*scale,-(c.point.y-anchor[1])*scale]);}else if(c.op==='Z'){if(!ring||ring.length<3)fail('Canonical filled polygon required');rings.push(ring!);ring=undefined;}else fail('Use original Clipper2 flattened canonical faces');}
 if(ring||!rings.length)fail('Complete canonical filled face required');const shape=new Shape();for(const [i,points]of rings.entries()){const path=i?new Path():shape;path.moveTo(...points[0]);for(const p of points.slice(1))path.lineTo(...p);path.closePath();if(i)shape.holes.push(path);}return shape;
}
/** CPU geometry only. No SVG parser, independent Boolean engine or pixel fallback.
 * Chunking obeys the existing per-MeshData transport contract, not a total shape limit. */
export async function extrudePathGeometry(paths:Iterable<PathData>,options:ExtrusionOptions,services:{pathOperations:Operations},context?:FrameContext):Promise<ExtrudedGeometry>{
 const {signal,onDiagnostic,...raw}=options,p=structuredClone(raw),check=()=>signal?.throwIfAborted();check();
 const depth=scalar(p.depth,context,'depth'),scale=p.unitsPerPixel??.01,anchor=p.anchor??[0,0],origin=p.origin??'front',tolerance=p.tolerance??.05,steps=p.steps??1,id=p.id??'extrusion';
 if(depth<=0||!Number.isFinite(scale)||scale<=0||anchor.length!==2||anchor.some(v=>!Number.isFinite(v))||!['front','center','back'].includes(origin)||!Number.isFinite(tolerance)||tolerance<=0||!Number.isSafeInteger(steps)||steps<1)fail('Positive finite depth/scale/tolerance, finite anchor, declared origin and positive steps required');
 const size=p.bevel?scalar(p.bevel.size,context,'bevel.size'):0,thickness=p.bevel?scalar(p.bevel.thickness??p.bevel.size,context,'bevel.thickness'):0,offset=p.bevel?scalar(p.bevel.offset??0,context,'bevel.offset'):0,enabled=size!==0||thickness!==0,segments=p.bevel?.segments??extrusionBevelSegments(Math.max(size,thickness),p.bevel?.tolerance??tolerance);
 if(size<0||thickness<0||!Number.isSafeInteger(segments)||segments<1)fail('Nonnegative bevel size/thickness and positive segment count required');
 for(const value of [depth,size,thickness,offset])if(!Number.isFinite(Math.fround(value*scale))||value!==0&&Math.fround(value*scale)===0)fail('World conversion exceeds original F32 geometry representation; choose explicit resolvable units');
 const diagnostics:Diagnostic[]=[],parameters={tolerance,gridSize:p.gridSize,openContours:p.openContours,signal,onDiagnostic:(d:Diagnostic)=>{diagnostics.push(d);onDiagnostic?.(d);}},parts:ExtrusionPart[]=[],bounds={min:[Infinity,Infinity,Infinity]as Vec3,max:[-Infinity,-Infinity,-Infinity]as Vec3};let faces=0,triangles=0,redundant=0;
 for await(const face of canonicalFilledFaces(services.pathOperations.booleanPathsStream(paths,{...parameters,operation:'union'}),services.pathOperations,parameters)){
  check();faces++;const beforeTriangles=triangles,geometry=new ExtrudeGeometry(shapes(face,anchor,scale),{depth:depth*scale,steps,bevelEnabled:enabled,bevelSize:size*scale,bevelThickness:thickness*scale,bevelOffset:offset*scale,bevelSegments:segments,curveSegments:1});
  try{const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');if(position.count%3||normal.count!==position.count)fail('Original extrusion returned incomplete triangles/normals');let zMin=Infinity,zMax=-Infinity;for(let i=0;i<position.count;i++){zMin=Math.min(zMin,position.getZ(i));zMax=Math.max(zMax,position.getZ(i));}const zOrigin=origin==='front'?zMax:origin==='center'?(zMin+zMax)/2:zMin,groups=new Map<ExtrusionSurface,{points:Vec3[];normals:Vec3[]}>();
   for(let i=0;i<position.count;i+=3){
    check();const pts=Array.from({length:3},(_,k)=>[position.getX(i+k),position.getY(i+k),position.getZ(i+k)-zOrigin]as Vec3),normals=Array.from({length:3},(_,k)=>[normal.getX(i+k),normal.getY(i+k),normal.getZ(i+k)]as Vec3);
    if(pts.flat().some(v=>!Number.isFinite(v))||normals.flat().some(v=>!Number.isFinite(v)))fail('Original extrusion overflowed F32 geometry');
    const a=pts[1].map((v,k)=>v-pts[0][k]),b=pts[2].map((v,k)=>v-pts[0][k]),area=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);if(area===0){redundant++;continue;}
    if(normals.some(n=>Math.hypot(...n)===0))fail('Nonzero original face lost its normal at F32 precision');
    const cap=geometry.groups.find(g=>g.start<=i&&i<g.start+g.count)?.materialIndex===0,surface:ExtrusionSurface=cap?(normals[0][2]>0?'front':'back'):normals.every(n=>Math.abs(n[2])<1e-6)?'side':'bevel',group=groups.get(surface)??{points:[],normals:[]};group.points.push(...pts);group.normals.push(...normals);groups.set(surface,group);triangles++;
    for(const pt of pts)for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],pt[k]);bounds.max[k]=Math.max(bounds.max[k],pt[k]);}
   }
   if(triangles===beforeTriangles)fail('Nonempty canonical fill collapsed at original F32 geometry precision');
   const chunk=Math.floor(Math.min(graphics.LIMITS.vertices,graphics.LIMITS.array)/3)*3;
   for(const [surface,group]of groups)for(let start=0;start<group.points.length;start+=chunk){const points=group.points.slice(start,start+chunk),name=id+'.'+faces+'.'+surface+'.'+start,mesh=graphics.validateMeshData({schema:'frameweave.mesh',version:1,id:name,coordinates:{spaceId:'extrusion.local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:points.map((_,i)=>'v.'+i),restPositions:points,indices:points.map((_,i)=>i)});parts.push({surface,mesh,normals:group.normals.slice(start,start+chunk)});}
  }finally{geometry.dispose();}
 }
 if(redundant){const d:Diagnostic={code:'W_PA_EXTRUSION_ZERO_AREA',severity:'warning',message:'Original redundant zero-area extrusion triangles omitted; no nonzero geometry dropped',details:{triangles:redundant}};diagnostics.push(d);onDiagnostic?.(d);}
 check();return {parts,diagnostics,metrics:{faces,triangles,redundantTriangles:redundant,depthPixels:depth,bevelSegments:enabled?segments:0,unitsPerPixel:scale,anchor,bounds:parts.length?bounds:null,upstream:'three@0.186.1',positionPrecision:'original F32 geometry; explicit local rebase'}};
}
