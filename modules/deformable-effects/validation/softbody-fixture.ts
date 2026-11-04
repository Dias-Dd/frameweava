import type {MeshData} from '../../graphics-contracts/types.ts';import type {Tetrahedron} from '../src/soft-body.ts';import {signedVolume} from '../src/volume.ts';
/** Editable authored cube split around its 0→7 diagonal; no tetrahedralization service. */
export function softCube(origin:[number,number,number]=[0,1,0],size=1){
  const restPositions=Array.from({length:8},(_,i)=>[origin[0]+(i&1)*size,origin[1]+((i>>1)&1)*size,origin[2]+((i>>2)&1)*size] as [number,number,number]);
  const tetrahedra:Tetrahedron[]=[[0,1,3,7],[0,1,5,7],[0,2,3,7],[0,2,6,7],[0,4,5,7],[0,4,6,7]],faces=new Map<string,{ids:number[];count:number}>();
  // Fixture boundary oracle uses oriented face normals against the opposite vertex,
  // independently of the factory's signed simplex boundary permutation.
  for(const t of tetrahedra)for(let omit=0;omit<4;omit++){const face=t.filter((_,i)=>i!==omit),key=[...face].sort((a,b)=>a-b).join(':'),p=face.map(i=>restPositions[i]),u=p[1].map((v,k)=>v-p[0][k]),v=p[2].map((v,k)=>v-p[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],dot=n.reduce((s,x,k)=>s+x*(restPositions[t[omit]][k]-p[0][k]),0);if(dot>0)[face[1],face[2]]=[face[2],face[1]];const old=faces.get(key);if(old)old.count++;else faces.set(key,{ids:face,count:1});}
  const mesh:MeshData={schema:'frameweave.mesh',version:1,id:'mesh.softCube',coordinates:{spaceId:'soft.world',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:restPositions.map((_,i)=>'v'+i),restPositions,indices:[...faces.values()].filter(f=>f.count===1).flatMap(f=>f.ids)};
  return {mesh,tetrahedra,authoredVolume:tetrahedra.reduce((s,t)=>s+Math.abs(signedVolume(t.map(i=>restPositions[i]))),0)};
}
