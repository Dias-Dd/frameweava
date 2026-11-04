import type {MeshData,Vec3} from 'rigid-body-effects';
export function mesh(id:string,restPositions:Vec3[],indices:number[]):MeshData{return {schema:'frameweave.mesh',version:1,id,coordinates:{spaceId:'rigid-world',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:restPositions.map((_,i)=>'v'+i),restPositions:restPositions,indices:indices};}
export function bowl():MeshData{const positions:Vec3[]=[],indices:number[]=[],n=12;for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const a=(x/n-.5)*7,b=(z/n-.5)*5;positions.push([a,.055*a*a+.11*b*b-.5,b]);}for(let z=0;z<n;z++)for(let x=0;x<n;x++){const i=z*(n+1)+x;indices.push(i,i+n+1,i+1,i+1,i+n+1,i+n+2);}return mesh('bowl',positions,indices);}
export function hull(id:string,s=.35):MeshData{return mesh(id,[[-s,-s,-s],[s,-s,-s],[s,-s,s],[-s,-s,s],[-s*.7,s,-s*.7],[s*.7,s,-s*.7],[s*.7,s,s*.7],[-s*.7,s,s*.7],[0,0,0]],[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);}
export function marker():MeshData{const r=.07;return mesh('query-marker',[[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]],[0,2,4,4,2,1,1,2,5,5,2,0,4,3,0,1,3,4,5,3,1,0,3,5]);}
export function model(position:Vec3,rotation:[number,number,number,number],localPosition:Vec3=[0,0,0],localRotation:[number,number,number,number]=[0,0,0,1]):[number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number]{
  const [a,b,c,d]=rotation,[e,f,g,h]=localRotation,x=d*e+a*h+b*g-c*f,y=d*f-a*g+b*h+c*e,z=d*g+a*f-b*e+c*h,w=d*h-a*e-b*f-c*g;
  const rotate=(v:Vec3):Vec3=>{const u=[b*v[2]-c*v[1],c*v[0]-a*v[2],a*v[1]-b*v[0]];return v.map((n,i)=>n+2*d*u[i]+2*[b*u[2]-c*u[1],c*u[0]-a*u[2],a*u[1]-b*u[0]][i]) as Vec3;};const p=rotate(localPosition).map((v,i)=>v+position[i]);
  return [1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,p[0],p[1],p[2],1];
}
