// SPDX-License-Identifier: Apache-2.0
import type {Matrix4,MeshData,SkeletonData,Vec3} from '../graphics-contracts/types.ts';import type {Signal} from '../../src/core/types.ts';import type {AnimatedVec3} from './types.ts';
export interface CharacterNode {id:string;name:string;parent:string|null;matrix:Matrix4}
export interface CharacterTrack {target:string;property:'position'|'quaternion'|'scale'|'morphTargetInfluences';type:'vector'|'quaternion'|'number';times:number[];values:number[];interpolation:'linear'|'step'|'cubic-spline'}
export interface CharacterClip {id:string;duration:number;tracks:CharacterTrack[]}
export interface CharacterTexture {image:string;texCoord:number;wrapS:'repeat'|'mirror'|'clamp';wrapT:'repeat'|'mirror'|'clamp';filter:'linear'|'nearest';offset:[number,number];scale:[number,number];rotation:number}
export interface CharacterMaterial {id:string;color:[number,number,number,number];metalness:number;roughness:number;alphaMode:'opaque'|'mask'|'blend';alphaCutoff:number;doubleSided:boolean;emissive?:Vec3;unlit?:boolean;extensions?:Record<string,unknown>;unsupportedMaps?:string[];texture?:CharacterTexture}
export interface CharacterPrimitive {id:string;node:string;mesh:MeshData;material:CharacterMaterial;skin?:{joints:string[];inverseBind:Matrix4[];influences:{joint:number;weight:number}[][]};morphs:{id:string;positions:Vec3[];normals?:Vec3[]}[];weights:number[];normals?:Vec3[];uvSets?:Record<string,[number,number][]>;colors?:[number,number,number,number][]}
export interface CharacterImage {id:string;mimeType:string;bytes:number[];uri?:string}
/** Portable imported data, not a graph IR, Stage port or live Three object. */
export interface CharacterDocument {format:'frameweave.character-asset/1';id:string;nodes:CharacterNode[];primitives:CharacterPrimitive[];clips:CharacterClip[];images:CharacterImage[];diagnostics:{code:string;message:string}[]}
export interface CharacterImportOptions {id?:string;scene?:number;maxBytes?:number;maxVertices?:number;maxValues?:number;maxNodes?:number;weights?:'strict'|'normalize'}
export interface CharacterSource {data:string|Record<string,unknown>|Uint8Array|ArrayBuffer;buffers?:Readonly<Record<string,Uint8Array>>;images?:Readonly<Record<string,Uint8Array>>}
export interface CharacterClipControl {clip:string;time?:Signal<number>;weight?:Signal<number>;loop?:'repeat'|'once';additive?:boolean}
export interface CharacterBoneControl {node:string;move?:AnimatedVec3;rotate?:AnimatedVec3;quaternion?:readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>];scale?:AnimatedVec3}
export interface CharacterMorphControl {primitive?:string;target:string;weight:Signal<number>}
export interface TwoBoneControl {root:string;middle:string;end:string;target:AnimatedVec3;pole:AnimatedVec3;weight?:Signal<number>;soften?:Signal<number>;twist?:Signal<number>}
export interface FootPlantControl extends Omit<TwoBoneControl,'target'> {anchor:AnimatedVec3;normal?:Vec3;offset?:Signal<number>;sole?:Signal<number>;align?:Signal<number>;localUp?:Vec3}
export interface FootContactControl extends Omit<TwoBoneControl,'target'> {normal?:Vec3;offset?:Signal<number>;sole?:Signal<number>;align?:Signal<number>;localUp?:Vec3}
export interface CharacterAnimationControls {clips?:readonly CharacterClipControl[];bones?:readonly CharacterBoneControl[];morphs?:readonly CharacterMorphControl[];ik?:readonly TwoBoneControl[];plants?:readonly FootPlantControl[];contacts?:readonly FootContactControl[]}
export interface CharacterSample {assetId:string;assetHash:string;frame:number;time:number;fps:{num:number;den:number};localMatrices:Matrix4[];globalMatrices:Matrix4[];morphWeights:number[][];diagnostics:{id:string;residual:number;reachable:boolean}[]}
export type {MeshData,SkeletonData,Matrix4,Vec3};
