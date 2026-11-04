// SPDX-License-Identifier: Apache-2.0
import {assertProfessionalSurface,pixelsFromSurface,type ProfessionalSurface} from '../../../src/media/surface.ts';
import {puppetError,prepareMesh} from './solver.ts';
import type {MeshData,Vec2,PuppetMeshOptions,PuppetMeshResult} from './types.ts';
const parameter=(message:string):never=>puppetError('E_PUPPET_PARAMETER',message);
function integer(v:number,name:string,min:number,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(v)||v<min||v>max)parameter(`${name} must be integer ${min}..${max}`);return v;}
export function encodeMesh(source:ProfessionalSurface,options:PuppetMeshOptions){
  if(!options||Object.keys(options).some(k=>!['id','world','spaceId','threshold','edgeLengthPx','simplifyPx','expansionPx','holes','budget'].includes(k)))parameter('Unknown mesh option');
  if(typeof options.id!=='string'||!options.id.length||options.id.length>128||typeof(options.spaceId??'puppet-local')!=='string')parameter('Explicit mesh id and valid spaceId required');
  const world=options.world;if(!world||Object.keys(world).some(k=>!['left','right','bottom','top','z'].includes(k))||[world.left,world.right,world.bottom,world.top,world.z??0].some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e9)||world.left>=world.right||world.bottom>=world.top)parameter('Explicit finite XY meter world bounds required');
  const edge=options.edgeLengthPx??16,tolerance=options.simplifyPx??0,expansion=options.expansionPx??0,threshold=options.threshold??0,holes=options.holes??'preserve';
  if([edge,tolerance,expansion,threshold].some(v=>typeof v!=='number'||!Number.isFinite(v))||edge<=0||tolerance<0||threshold<0||threshold>1||!['preserve','fill','reject'].includes(holes))parameter('Invalid mesh length/threshold/hole policy');
  const b=options.budget??{};if(!b||Object.keys(b).some(k=>!['maxVertices','maxTriangles','maxContours','maxProcessedPixels','maxWorkingBytes','maxWork','maxReplyBytes'].includes(k)))parameter('Unknown mesh budget');
  const budget={maxVertices:integer(b.maxVertices??4096,'maxVertices',3,16384),maxTriangles:integer(b.maxTriangles??8192,'maxTriangles',1,33333),maxContours:integer(b.maxContours??1024,'maxContours',1,0xffffffff),maxProcessedPixels:integer(b.maxProcessedPixels??4194304,'maxProcessedPixels',1,0xffffffff),maxWorkingBytes:integer(b.maxWorkingBytes??268435456,'maxWorkingBytes',1),maxWork:integer(b.maxWork??256000000,'maxWork',1),maxReplyBytes:integer(b.maxReplyBytes??4194304,'maxReplyBytes',48,16777216)};
  assertProfessionalSurface(source);const pixels=source.width*source.height;
  if(pixels>budget.maxProcessedPixels||pixels*32+Math.ceil(pixels/8)>budget.maxWorkingBytes)puppetError('E_PUPPET_BUDGET','Source decode exceeds explicit mesh budget');
  const values=pixelsFromSurface(source),bits=new Uint8Array(Math.ceil(pixels/8));let selected=0;
  for(let i=0;i<pixels;i++){const a=values[i*4+3];if(a>0&&a>=threshold){bits[i>>3]|=1<<(i&7);selected++;}}
  const bytes=new Uint8Array(72+bits.length);if(bytes.length>16777216)puppetError('E_PUPPET_BUDGET','Packed mask exceeds C1 per-call boundary');const v=new DataView(bytes.buffer);
  [0x314d5050,source.width,source.height,budget.maxVertices,budget.maxTriangles,budget.maxContours,['preserve','fill','reject'].indexOf(holes),budget.maxProcessedPixels].forEach((x,i)=>v.setUint32(i*4,x,true));
  [edge,tolerance,expansion,budget.maxWork,budget.maxWorkingBytes].forEach((x,i)=>v.setFloat64(32+i*8,x,true));bytes.set(bits,72);
  return {bytes,options:structuredClone(options),width:source.width,height:source.height,selected,budget,holes,edge,tolerance,expansion,threshold};
}
export function decodeMesh(bytes:Uint8Array,encoded:ReturnType<typeof encodeMesh>,validate:(v:unknown)=>MeshData):PuppetMeshResult{
  const bad=():never=>puppetError('E_PUPPET_PROTOCOL','Invalid mesher reply');if(bytes.length<48)bad();const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
  const u=()=>{if(at+4>bytes.length)bad();const x=v.getUint32(at,true);at+=4;return x;},f=()=>{if(at+8>bytes.length)bad();const x=v.getFloat64(at,true);at+=8;if(!Number.isFinite(x))bad();return x;};
  if(u()!==0x324d5050)bad();const n=u(),t=u(),contoursCount=u(),componentsCount=u(),processedPixels=u(),expandedPixels=u(),holePolicy=u(),work=f(),areaPixels=f();
  if(n>encoded.budget.maxVertices||t>encoded.budget.maxTriangles||contoursCount>encoded.budget.maxContours||componentsCount>n||processedPixels>encoded.budget.maxProcessedPixels||expandedPixels>processedPixels||holePolicy!==['preserve','fill','reject'].indexOf(encoded.holes)||work>encoded.budget.maxWork||areaPixels<0)bad();
  const points:Vec2[]=[],componentIds:number[]=[],indices:number[]=[];
  for(let i=0;i<n;i++){points.push([f(),f()]);const c=u();if(c>=componentsCount)bad();componentIds.push(c);}for(let i=0;i<t;i++){const a=u(),b=u(),c=u();if(Math.max(a,b,c)>=n||new Set([a,b,c]).size!==3)bad();indices.push(a,c,b);}
  const contours:PuppetMeshResult['contours']=[];for(let i=0;i<contoursCount;i++){const hole=u(),component=u(),count=u();if(hole>1||component>=componentsCount||count<3||count>(bytes.length-at)/16)bad();const p:Vec2[]=Array.from({length:count},()=>[f(),f()]);contours.push({kind:hole?'hole':'outer',component,pointsPx:p,includedBoundary:!hole||encoded.holes==='preserve'});}
  if(at!==bytes.length||(!n)!==(!t)||(!n)!==(!componentsCount)||(!n&&contoursCount))bad();
  const {options,width,height}=encoded,w=options.world,dx=(w.right-w.left)/width,dy=(w.top-w.bottom)/height;
  const mesh:MeshData|null=n?validate({schema:'frameweave.mesh',version:1,id:options.id,coordinates:{spaceId:options.spaceId??'puppet-local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:points.map((_,i)=>'v'+i),restPositions:points.map(p=>[w.left+p[0]*dx,w.top-p[1]*dy,w.z??0]),indices,uv:points.map(p=>[p[0]/width,p[1]/height]),uvOrigin:'top-left',controls:Array.from({length:componentsCount},(_,c)=>({id:'component-'+c,vertexId:'v'+componentIds.indexOf(c)}))}):null;
  if(mesh)prepareMesh(mesh);
  return {mesh,components:Array.from({length:componentsCount},(_,c)=>({id:c,vertexIds:componentIds.flatMap((id,i)=>id===c?['v'+i]:[]),anchorVertexId:'v'+componentIds.indexOf(c)})),contours,diagnostics:{backend:'rust-wasm',algorithm:'effectcraft-alpha-constrained-delaunay',sourceWidth:width,sourceHeight:height,selectedPixels:encoded.selected,expandedPixels,processedPixels,areaPixels,work,vertices:n,triangles:t,holePolicy:encoded.holes,edgeLengthPx:encoded.edge,simplifyPx:encoded.tolerance,expansionPx:encoded.expansion,threshold:encoded.threshold}};
}
