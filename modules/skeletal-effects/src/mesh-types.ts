import type {MeshData,Vec3,Matrix4,FrameContext,SkinnedRendererOptions,SkinnedRendererStats,RigCamera} from './types.ts';import type {ProfessionalSurface} from '../../../src/media/surface.ts';
export interface MeshRendererOptions extends SkinnedRendererOptions {shading?:'standard'|'unlit';normals?:'flat'|'smooth'|'provided';side?:'double'|'front';maxLights?:number}
/** RGB parameters are scene-linear Rec.709, not srgb strings or texture resources. */
export interface MeshAppearance {color?:Vec3;emissive?:Vec3;roughness?:number;metalness?:number;opacity?:number}
export interface MeshDraw {id:string;positions?:Vec3[];/** Mesh-local directions; requires explicit standard/provided selection. */normals?:Vec3[];model?:Matrix4;visible?:boolean;appearance?:MeshAppearance}
export interface MeshLighting {ambient?:Vec3;directional?:{direction:Vec3;color:Vec3;intensity?:number}[]}
export interface MeshRenderOptions {context:FrameContext|Pick<FrameContext,'frame'|'time'|'fps'>;camera:RigCamera;objects:MeshDraw[];lighting?:MeshLighting;format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface MeshRendererStats extends Omit<SkinnedRendererStats,'boneUploads'|'probes'> {objects:number;triangles:number;positionUploads:number;normalComputations:number;normalUploads?:number;shading:'standard'|'unlit';normals:'flat'|'smooth'|'provided'}
/** Immutable MeshData topology; each render supplies a complete independent scene value. */
export interface MeshRenderer {render(options:MeshRenderOptions):Promise<ProfessionalSurface>;resize(width:number,height:number):void;stats():MeshRendererStats;dispose():Promise<void>}
export type {MeshData,Vec3};
