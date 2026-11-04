// SPDX-License-Identifier: Apache-2.0
import {Matrix4,Vector3} from 'three';
import {validateCharacterAsset,characterError as fail,characterObject as object,characterNumber as number} from './character-asset.ts';
import {prepareMesh} from './mesh-validation.ts';
import type {CharacterAsset,CharacterPose} from './character-types.ts';
import type {PuppetConstraints} from './types.ts';
/** Explicit CPU numeric landmark adapter for the existing planar ARAP API.
 * It never reads back GPU geometry or initializes the WASM/Worker solver. */
export function characterPuppetConstraints(input:CharacterAsset,pose:CharacterPose,options:{pins:readonly string[];edges?:readonly {from:string;to:string;weight:number}[];triangleWeights?:number[];refine?:number}):PuppetConstraints{
 const asset=validateCharacterAsset(input),prepared=prepareMesh(asset.mesh);object(options,['pins','edges','triangleWeights','refine'],'landmark constraints');if(pose.meshId!==asset.mesh.id||pose.skeletonId!==asset.skeleton.id||pose.matrices.length!==asset.skeleton.bones.length||JSON.stringify(pose.boneIds)!==JSON.stringify(asset.skeleton.bones.map(b=>b.id)))fail('POSE','Landmark pose asset mismatch');
 const controls=new Map(asset.mesh.controls?.map(c=>[c.id,c.vertexId])??[]),byBone=new Map(asset.skeleton.bones.map((b,i)=>[b.id,i])),weights=new Map(asset.skeleton.weights.map(w=>[w.vertexId,w.influences]));
 const point=(id:string)=>{const vertexId=controls.get(id);if(!vertexId)fail('CONSTRAINT','Unknown landmark '+id);const i=prepared.byId.get(vertexId)!,v=new Vector3(...asset.mesh.restPositions[i]),p=new Vector3();for(const w of weights.get(vertexId)!){const b=byBone.get(w.boneId)!,matrix=new Matrix4().fromArray(pose.matrices[b]).multiply(new Matrix4().fromArray(asset.skeleton.bones[b].inverseBindMatrix));p.addScaledVector(v.clone().applyMatrix4(matrix),w.weight);}if(Math.abs(p.z-v.z)>1e-7)fail('SPACE','Planar ARAP landmarks cannot contain out-of-plane deformation');return {vertexId,position:[number(p.x,'landmark x'),number(p.y,'landmark y')] as [number,number]};};
 if(!Array.isArray(options.pins)||new Set(options.pins).size!==options.pins.length)fail('CONSTRAINT','Unique explicit pin landmarks required');const pins=options.pins.map(point);if(new Set(pins.map(p=>p.vertexId)).size!==pins.length)fail('CONSTRAINT','Landmarks alias the same pinned vertex');const anchored=new Set(pins.map(p=>prepared.components[prepared.byId.get(p.vertexId)!]));if(prepared.components.some(c=>!anchored.has(c)))fail('CONSTRAINT','Every ARAP component needs an explicit landmark pin');
 const edges=options.edges?.map(edge=>{object(edge,['from','to','weight'],'landmark edge');const a=point(edge.from),b=point(edge.to);return {from:a.vertexId,to:b.vertexId,vector:[b.position[0]-a.position[0],b.position[1]-a.position[1]] as [number,number],weight:number(edge.weight,'edge weight',Number.MIN_VALUE)};});
 return {pins,...edges?{edges}:{},...options.triangleWeights?{triangleWeights:[...options.triangleWeights]}:{},...options.refine!==undefined?{refine:options.refine}:{}};
}
