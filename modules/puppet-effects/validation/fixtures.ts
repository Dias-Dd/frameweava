import type {MeshData} from '../src/types.ts';
export function gridMesh(columns=5,rows=5):MeshData{
  const restPositions:MeshData['restPositions']=[],indices:number[]=[],uv:NonNullable<MeshData['uv']>=[];
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){restPositions.push([x/(columns-1)*2-1,y/(rows-1)*2-1,0]);uv.push([x/(columns-1),1-y/(rows-1)]);}
  for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const a=y*columns+x;indices.push(a,a+1,a+columns+1,a,a+columns+1,a+columns);}
  return {schema:'frameweave.mesh',version:1,id:'cloth-card',coordinates:{spaceId:'puppet-local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:restPositions.map((_,i)=>'v'+i),restPositions,indices,uv,uvOrigin:'top-left',controls:[{id:'base',vertexId:'v0'},{id:'tip',vertexId:'v'+(restPositions.length-1)}]};
}
