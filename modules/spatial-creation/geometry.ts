import type {BufferGeometry} from 'three';
import type {MeshData,Vec3} from '../graphics-contracts/types.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';
const coordinates={spaceId:'creation.world',unit:'meter' as const,origin:'local' as const,x:'right' as const,y:'up' as const,z:'toward-viewer' as const,handedness:'right' as const};
/** Internal conversion of original Three geometry into existing Graphics data.
 * The caller never receives a Three/GPU resource; the temporary is disposed. */
export function geometryData(id:string,g:BufferGeometry,uv=false):MeshData{try{const p=g.getAttribute('position'),tex=g.getAttribute('uv'),restPositions:Vec3[]=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]);return validateMeshData({schema:'frameweave.mesh',version:1,id,coordinates:structuredClone(coordinates),topology:'triangles',vertexIds:restPositions.map((_,i)=>'v'+i),restPositions,indices:g.index?Array.from(g.index.array):restPositions.map((_,i)=>i),...uv&&tex?{uv:Array.from({length:p.count},(_,i)=>[tex.getX(i),1-tex.getY(i)]),uvOrigin:'top-left'}:{}});}finally{g.dispose();}}
