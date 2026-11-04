// Pure extraction of the existing reviewed mesh validation; no WASM/client import.
import type {MeshData} from './types.ts';
import {puppetError} from './puppet-error.ts';
export function prepareMesh(mesh:MeshData){
  if(mesh.restPositions.some(p=>p[2]!==mesh.restPositions[0][2]))puppetError('E_PUPPET_SPACE','Initial ARAP supports a planar mesh parallel to local XY, in the existing meter/up/right space');
  const n=mesh.vertexIds.length,used=new Set<number>(),parent=Array.from({length:n},(_,i)=>i),areas:number[]=[];
  const root=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let k=0;k<mesh.indices.length;k+=3){const ids=mesh.indices.slice(k,k+3),[a,b,c]=ids.map(i=>mesh.restPositions[i]),cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);let longest=0;
    for(const [i,j]of [[0,1],[1,2],[2,0]]){const p=mesh.restPositions[ids[i]],q=mesh.restPositions[ids[j]],length=(p[0]-q[0])**2+(p[1]-q[1])**2;if(length<=1e-18)puppetError('E_PUPPET_TOPOLOGY','Edge is below the reviewed upstream numerical scale');longest=Math.max(longest,length);}
    if(Math.abs(cross)<=longest*1e-12)puppetError('E_PUPPET_TOPOLOGY','Degenerate or ill-conditioned rest triangle');areas.push(cross);const p=root(ids[0]);for(const i of ids){used.add(i);parent[root(i)]=p;}
  }
  if(used.size!==n)puppetError('E_PUPPET_TOPOLOGY','All vertices must belong to triangles');
  return {mesh,areas,components:Array.from({length:n},(_,i)=>root(i)),byId:new Map(mesh.vertexIds.map((id,i)=>[id,i]))};
}
