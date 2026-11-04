import type {MeshData,Vec3} from '@frameweave/engine/graphics-contracts';
import {waveMesh,ground} from './mesh-geometry.ts';
export {ground};
export function emitter(){return waveMesh(25);}
export function deformed(mesh:MeshData,time:number):Vec3[]{return mesh.restPositions.map(([x,,z])=>[x,.65+.2*Math.sin(x*3+time*2)*Math.cos(z*2-time),z]);}
/** Authored tetrahedron: native triangles, not a screen-space particle sprite. */
export function grain(id='mesh.grains'):MeshData{return {schema:'frameweave.mesh',version:1,id,coordinates:ground().coordinates,topology:'triangles',vertexIds:['a','b','c','d'],restPositions:[[-.65,0,-.4],[.65,0,-.4],[0,0,.7],[0,2,0]],indices:[0,2,1,0,1,3,1,2,3,2,0,3]};}
/** Local +Y follows the explicitly supplied geometric normal. */
export function orientations(normals:Float64Array):Float64Array{const out=new Float64Array(normals.length/3*4);for(let i=0;i<normals.length/3;i++){const x=normals[i*3],y=normals[i*3+1],z=normals[i*3+2],w=1+y;if(w<1e-12){out.set([1,0,0,0],i*4);continue;}const length=Math.hypot(z,x,w);out.set([z/length,0,-x/length,w/length],i*4);}return out;}
