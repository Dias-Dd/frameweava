import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {MeshData,SkeletonData,Matrix4,Vec3} from '../../graphics-contracts/types.ts';
export type {MeshData,SkeletonData,Matrix4,Vec3};
/** Optional ordinary asset pair; both payloads keep existing Graphics schemas. */
export interface CharacterAsset {mesh:MeshData;skeleton:SkeletonData}
export interface CharacterBindingOptions {id:string;influences?:number;power?:number;softening?:number;bones?:readonly string[];maxWork?:number}
export interface JointLimit {min:Vec3;max:Vec3;axis?:Vec3}
export interface CharacterIKChain {id:string;effector:string;/** Immediate effector parent first, then its parent, etc. */links:readonly string[];iterations?:number;maxAngle?:number}
export interface CharacterRigOptions {chains?:readonly CharacterIKChain[];limits?:Record<string,JointLimit>;maxSolveWork?:number}
export interface CharacterControls {
 bones?:Record<string,{translation?:Signal<Vec3>;rotation?:Signal<Vec3>;scale?:Signal<Vec3>}>;
 targets?:Record<string,{position:Signal<Vec3>;weight?:Signal<number>;iterations?:number}>;
}
/** Owned numeric pose. It is not a Stage port, checkpoint or GPU capability. */
export interface CharacterPose {
 meshId:string;skeletonId:string;boneIds:string[];matrices:Matrix4[];
 context:Pick<FrameContext,'frame'|'time'|'fps'>;
 diagnostics:{backend:'three-ccd';iterationsBudget:number;targets:{id:string;distance:number;weight:number}[]};
}
