import {clothOptions} from 'deformable-effects';import type {MeshData,Vec3} from '@frameweave/engine/graphics-contracts';
const coordinates={spaceId:'aero.world',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'} as const;
export function geometry(){
 const columns=15,rows=9,restPositions:Vec3[]=[],indices:number[]=[];
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)restPositions.push([-2.4+2*x/(columns-1),1.9-1.4*y/(rows-1),0]);
 for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const i=y*columns+x;indices.push(i,i+1,i+columns,i+1,i+columns+1,i+columns);}
 const flag:MeshData={schema:'frameweave.mesh',version:1,id:'aero.flag',coordinates,topology:'triangles',vertexIds:restPositions.map((_,i)=>'f'+i),restPositions,indices};
 const points:Vec3[]=[[1.1,1.85,0]],faces:number[]=[],rings=8,slices=16,r=.65;
 for(let j=1;j<rings;j++)for(let k=0;k<slices;k++){const theta=Math.PI*j/rings,phi=2*Math.PI*k/slices;points.push([1.1+r*Math.sin(theta)*Math.cos(phi),1.2+r*Math.cos(theta),r*Math.sin(theta)*Math.sin(phi)]);}
 const bottom=points.length;points.push([1.1,.55,0]);const ring=(j:number,k:number)=>1+j*slices+(k+slices)%slices;
 for(let k=0;k<slices;k++){faces.push(0,ring(0,k),ring(0,k+1));faces.push(bottom,ring(rings-2,k+1),ring(rings-2,k));}
 for(let j=0;j<rings-2;j++)for(let k=0;k<slices;k++){const a=ring(j,k),b=ring(j,k+1),c=ring(j+1,k),d=ring(j+1,k+1);faces.push(a,b,c,b,d,c);}
 // Explicit outward winding about the known center, no loader/repair/foreign asset.
 for(let i=0;i<faces.length;i+=3){const [a,b,c]=faces.slice(i,i+3).map(n=>points[n]),u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],center=a.map((x,k)=>(x+b[k]+c[k])/3-[1.1,1.2,0][k]);if(n.reduce((s,x,k)=>s+x*center[k],0)<0)[faces[i+1],faces[i+2]]=[faces[i+2],faces[i+1]];}
 const balloon:MeshData={schema:'frameweave.mesh',version:1,id:'aero.pressure',coordinates,topology:'triangles',vertexIds:points.map((_,i)=>'b'+i),restPositions:points,indices:faces};
 const floor:MeshData={schema:'frameweave.mesh',version:1,id:'aero.floor',coordinates,topology:'triangles',vertexIds:['a','b','c','d'],restPositions:[[-4,0,-3],[-4,0,3],[4,0,-3],[4,0,3]],indices:[0,1,2,1,3,2]};return {flag,balloon,floor};
}
export function setup(){const meshes=geometry(),flag=clothOptions(meshes.flag,{fps:24,seed:91,substeps:8,iterations:32,surfaceDensity:.18,stretchCompliance:1e-6,bendCompliance:1e-3,bendingModel:'dihedral',gravity:[0,-1.2,0],dampingRate:.3,fixedVertices:['f0','f120'],aerodynamics:{wind:[.4,.25,{$keyframes:[{frame:0,value:1.4},{frame:16,value:2.2},{frame:32,value:-.8},{frame:48,value:1.7}]}],density:1.225,normalDrag:1,tangentialDrag:.02},collision:{radii:.01,colliders:[{id:'floor',kind:'plane',normal:[0,1,0],offset:0,friction:.2}]},budgets:{checkpointInterval:20,maxCheckpoints:3}}),balloon=clothOptions(meshes.balloon,{fps:24,seed:91,substeps:8,iterations:32,surfaceDensity:.25,stretchCompliance:.12,bendCompliance:.05,bendingModel:'dihedral',gravity:[0,0,0],dampingRate:1.5,aerodynamics:{density:0,pressure:{$keyframes:[{frame:0,value:0},{frame:16,value:3},{frame:32,value:0},{frame:48,value:1.5}]}},budgets:{checkpointInterval:20,maxCheckpoints:3}});return {meshes,flag,balloon};}
