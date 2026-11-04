import type {MeshData,SkeletonData,TextLayoutData} from '../types.ts';
import {validateMeshData,validateSkeletonData,validateTextLayoutData} from '../validate.ts';
import {verifyResources,resourceReferences} from '../resources.ts';

export type DeclaredBytes=(resourceId:string)=>Promise<Uint8Array|undefined>;

/** Future 3D/Puppet module: validate shared rest geometry before allocating private GPU/WASM objects. */
export async function acceptMesh(input:unknown,read:DeclaredBytes):Promise<MeshData> {
  const mesh=validateMeshData(input);await verifyResources(resourceReferences(mesh),read);return mesh;
}
/** No implicit scene lookup: caller supplies the exact mesh that owns these vertex weights. */
export function acceptRig(input:unknown,mesh:MeshData):SkeletonData {
  return validateSkeletonData(input,mesh);
}
/** Typography consumer: no browser fallback font is silently substituted for a hashed face. */
export async function acceptLayout(input:unknown,read:DeclaredBytes):Promise<TextLayoutData> {
  const layout=validateTextLayoutData(input);await verifyResources(resourceReferences(layout),read);return layout;
}
