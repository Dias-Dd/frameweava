import {characterBones,bindCharacterMesh} from '../puppet-effects/native.ts';
import type {CharacterBindingOptions} from '../puppet-effects/native.ts';
import type {Vec3} from '../graphics-contracts/types.ts';
import {clothSheet,assetOptions,assetNumber,assetError} from './physics-assets.ts';
import {characterJoints,type CharacterJoint} from './character-art.ts';
export type ImageCharacterJoints={hips:readonly [number,number]}&Partial<Record<Exclude<CharacterJoint,'hips'>,readonly [number,number]>>;
export interface ImageCharacterLayoutOptions {
 joints:ImageCharacterJoints;segments?:readonly [number,number];height?:number;
 maxValueBytes?:number;binding?:Omit<CharacterBindingOptions,'id'>;
}
const parents:Record<CharacterJoint,CharacterJoint|null>={hips:null,chest:'hips',head:'chest',leftUpperArm:'chest',leftLowerArm:'leftUpperArm',leftHand:'leftLowerArm',rightUpperArm:'chest',rightLowerArm:'rightUpperArm',rightHand:'rightLowerArm',leftUpperLeg:'hips',leftLowerLeg:'leftUpperLeg',leftFoot:'leftLowerLeg',rightUpperLeg:'hips',rightLowerLeg:'rightUpperLeg',rightFoot:'rightLowerLeg'};
/** Declared UV landmarks, not detected anatomy or alpha-contour triangulation. */
export function imageCharacterLayout(width:number,height:number,o:ImageCharacterLayoutOptions){
 for(const v of [width,height])if(!Number.isSafeInteger(v)||v<1)assetError('Image dimensions must be positive integers');
 assetOptions(o.joints,characterJoints,'image character joints');if(!o.joints.hips)assetError('An explicit hips/root joint is required');
 for(const [name,p]of Object.entries(o.joints)){if(!Array.isArray(p)||p.length!==2)assetError(name+' requires static normalized u/v');p.forEach(v=>assetNumber(v,name,0,1));const parent=parents[name as CharacterJoint];if(parent&&!o.joints[parent])assetError(name+' requires explicitly declared parent '+parent);}
 if(o.binding)assetOptions(o.binding,['influences','power','softening','bones','maxWork'],'image skin binding');
 const h=assetNumber(o.height??2.5,'image physical height',.001),w=h*width/height;
 const world=(uv:readonly [number,number]):Vec3=>[(uv[0]-.5)*w,(.5-uv[1])*h,0];
 const mesh=clothSheet({id:'creation.image-character',size:[w,h],segments:o.segments??[16,24],maxValueBytes:o.maxValueBytes});
 const bones=characterBones(characterJoints.filter(name=>o.joints[name]).map(name=>({id:name,parentId:parents[name],position:world(o.joints[name]!)})));
 const asset=bindCharacterMesh(mesh,bones,{id:'creation.image-character.rig',influences:4,power:4,softening:.02,...o.binding});
 return {asset,world,size:[w,h] as const,sourceSize:[width,height] as const};
}
