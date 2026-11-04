import type {MeshData,Vec3} from '@frameweave/engine/graphics-contracts';
export const names=['transformPositions','twistPositions','bendPositions','taperPositions','shearPositions','stretchPositions','bulgePositions','spherifyPositions','cylindrifyPositions','wavePositions','ripplePositions','noiseDisplacePositions','morphPositions','cageDeformPositions','attractPositions'] as const;
export function geometry(){const restPositions:Vec3[]=[],normals:Vec3[]=[],indices:number[]=[],rows=12,sides=24;
 for(let j=0;j<=rows;j++)for(let k=0;k<sides;k++){const y=-.85+j*1.7/rows,a=k*2*Math.PI/sides,r=.52*(1+.15*Math.cos(y*6));restPositions.push([r*Math.cos(a),y,r*Math.sin(a)]);normals.push([Math.cos(a),0,Math.sin(a)]);}
 for(let j=0;j<rows;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}
 const coordinates={spaceId:'deformation.local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'} as const;
 return {normals,restPositions,meshes:names.map((name,i):MeshData=>({schema:'frameweave.mesh',version:1,id:name,coordinates,topology:'triangles',vertexIds:restPositions.map((_,i)=>'v'+i),restPositions,indices})),target:restPositions.map(([x,y,z]):Vec3=>[x*(1+.5*y),y,z*.4])};
}
