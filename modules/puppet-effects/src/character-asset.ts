// SPDX-License-Identifier: Apache-2.0
import {Matrix4,Vector3} from 'three';
import {validateMeshData,validateSkeletonData} from '../../graphics-contracts/validate.ts';
import {bounded} from '../../graphics-contracts/check.ts';
import type {CharacterAsset,CharacterBindingOptions,SkeletonData,MeshData,Matrix4 as Matrix,Vec3} from './character-types.ts';
export function characterError(code:string,message:string):never{throw Object.assign(new Error(message),{code:'E_PUPPET_'+code});}
export function characterNumber(value:unknown,name:string,min=-1e9,max=1e9){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)characterError('PARAMETER',name+' outside its finite domain');return value;}
export function characterVector(value:unknown,name:string):Vec3{if(!Array.isArray(value)||value.length!==3)characterError('PARAMETER',name+' needs XYZ');return value.map(x=>characterNumber(x,name)) as Vec3;}
export function characterObject(value:unknown,keys:readonly string[],name:string):Record<string,any>{if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))characterError('PARAMETER',name+' must be plain data');for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!keys.includes(key)||!('value'in d)||!d.enumerable)characterError('PARAMETER','Unknown/accessor '+name+' field');}return value as Record<string,any>;}
export function validateCharacterAsset(input:unknown):CharacterAsset {bounded(input);const o=characterObject(input,['mesh','skeleton'],'character asset'),mesh=validateMeshData(o.mesh);return {mesh,skeleton:validateSkeletonData(o.skeleton,mesh)};}
export function serializeCharacterAsset(asset:CharacterAsset):string{return JSON.stringify(validateCharacterAsset(asset),null,2);}
export function parseCharacterAsset(text:string):CharacterAsset {if(typeof text!=='string'||new TextEncoder().encode(text).length>8388608)characterError('ASSET_BUDGET','Asset exceeds the existing Graphics JSON byte boundary');let value:unknown;try{value=JSON.parse(text);}catch{characterError('ASSET_JSON','Invalid character JSON');}return validateCharacterAsset(value);}
/** Standard distance-to-bone-segment binding, CPU geometry/authoring only.
 * Never replaces a user weight table during rendering or silently drops links. */
export function bindCharacterMesh(input:MeshData,bones:SkeletonData['bones'],options:CharacterBindingOptions):CharacterAsset {
 const mesh=validateMeshData(input);characterObject(options,['id','influences','power','softening','bones','maxWork'],'binding options');if(!bones?.length)characterError('BIND','Bones are required');
 const skeleton=validateSkeletonData({schema:'frameweave.skeleton',version:1,id:options.id,coordinates:mesh.coordinates,meshId:mesh.id,bones,weights:mesh.vertexIds.map(vertexId=>({vertexId,influences:[{boneId:bones[0].id,weight:1}]}))},mesh);
 const count=options.influences??4;if(!Number.isInteger(count)||count<1||count>4)characterError('BIND','Existing SkeletonData v1 permits 1..4 influences; no truncation');
 const selected=options.bones??skeleton.bones.map(b=>b.id);if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||selected.some(id=>!skeleton.bones.some(b=>b.id===id)))characterError('BIND','Binding bone selection must contain known unique IDs');
 const power=characterNumber(options.power??2,'power',.001,16),soft=characterNumber(options.softening??.01,'softening',1e-6,1e9),work=mesh.vertexIds.length*skeleton.bones.length;if(work>characterNumber(options.maxWork??1e7,'maxWork',1,Number.MAX_SAFE_INTEGER))characterError('BUDGET','Complete binding work exceeds maxWork');
 const origins=new Map(skeleton.bones.map(b=>[b.id,new Vector3().setFromMatrixPosition(new Matrix4().fromArray(b.bindMatrix))]));
 const candidates=skeleton.bones.filter(b=>selected.includes(b.id)).map(b=>({id:b.id,a:origins.get(b.id)!,ends:skeleton.bones.filter(x=>x.parentId===b.id).map(x=>origins.get(x.id)!)}));
 skeleton.weights=mesh.restPositions.map((position,index)=>{const p=new Vector3(...position),ranks=candidates.map((b,order)=>{let distance=Infinity;for(const end of b.ends.length?b.ends:[b.a]){const d=end.clone().sub(b.a),t=d.lengthSq()?Math.max(0,Math.min(1,p.clone().sub(b.a).dot(d)/d.lengthSq())):0;distance=Math.min(distance,p.distanceToSquared(b.a.clone().addScaledVector(d,t)));}return {id:b.id,order,distance,weight:1/Math.pow(distance+soft*soft,power/2)};}).sort((a,b)=>a.distance-b.distance||a.order-b.order).slice(0,count),sum=ranks.reduce((s,r)=>s+r.weight,0);if(!Number.isFinite(sum)||sum<=0)characterError('BIND','Binding normalization failed');return {vertexId:mesh.vertexIds[index],influences:ranks.map(r=>({boneId:r.id,weight:r.weight/sum}))};});
 return {mesh,skeleton:validateSkeletonData(skeleton,mesh)};
}
/** Explicit mesh-space bind matrices from author joint positions. No inferred
 * hierarchy, implicit assets or runtime scene registration. */
export function characterBones(joints:readonly {id:string;parentId:string|null;position:Vec3}[]):SkeletonData['bones'] {return joints.map(j=>{characterObject(j,['id','parentId','position'],'joint');const position=characterVector(j.position,'joint position'),bind=new Matrix4().makeTranslation(...position);return {id:j.id,parentId:j.parentId,bindMatrix:[...bind.elements] as Matrix,inverseBindMatrix:[...bind.clone().invert().elements] as Matrix};});}
