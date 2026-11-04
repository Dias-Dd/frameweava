import type {MeshData,MeshRendererOptions,MeshRenderOptions,MeshAppearance,MeshRendererStats} from './mesh-types.ts';import type {Matrix4,Vec3} from './types.ts';import type {ProfessionalSurface} from '../../../src/media/surface.ts';
export interface InstanceMeshDefinition {mesh:MeshData;capacity:number}
/** Native ArrayBuffer-backed Stage-local attributes. No SharedArrayBuffer/JS object/GPU handle transport. */
export interface InstanceAttributes {count:number;positions:Float64Array;rotations?:Float64Array;scales?:Float64Array;uniformScale?:Vec3;colors?:Float32Array}
export interface InstanceDraw {id:string;instances:InstanceAttributes;model?:Matrix4;visible?:boolean;appearance?:MeshAppearance}
export interface InstanceRenderOptions extends Omit<MeshRenderOptions,'objects'> {objects:InstanceDraw[]}
export interface InstancedRendererStats extends MeshRendererStats {capacity:number;instances:number;instanceUploads:number;lastSubmittedInstances:number;lastSubmittedTriangles:number}
export interface InstancedMeshRenderer {render(options:InstanceRenderOptions):Promise<ProfessionalSurface>;resize(width:number,height:number):void;stats():InstancedRendererStats;dispose():Promise<void>}
export type {MeshRendererOptions};
