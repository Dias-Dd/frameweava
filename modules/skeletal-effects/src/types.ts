import type {FrameContext,Rational,Signal} from '../../../src/core/types.ts';
import type {MeshData,SkeletonData,Matrix4,Vec3} from '../../graphics-contracts/types.ts';
import type {ColorEncoding,ProfessionalSurface} from '../../../src/media/surface.ts';
export type {FrameContext,MeshData,SkeletonData,Matrix4,Vec3};
export type VectorSignal=[Signal<number>,Signal<number>,Signal<number>];
export interface RigBudgets {maxWork?:number;maxBytes?:number}
/** Translation delta in parent axes, rotation/scale delta in local bind axes. */
export interface BoneDelta {bone:string;translation?:VectorSignal;rotation?:VectorSignal;scale?:VectorSignal}
export interface IKLink {bone:string;hinge?:{axis:Vec3;min:number;max:number}}
export interface IKChain {id:string;effector:string;links:IKLink[];target:VectorSignal;iterations?:number;tolerance?:number;maxStep?:number;blend?:number;strict?:boolean}
export interface RigControls {deltas?:BoneDelta[];localMatrices?:{bone:string;matrix:Matrix4}[];ik?:IKChain[]}
export interface IKDiagnostic {id:string;effector:string;target:Vec3;iterationsUsed:number;fullSolveResidual:number;residual:number;tolerance:number;blend:number;converged:boolean}
/** Module values, not a replacement Graphics schema or a cross-environment object handle. */
export interface RigPose {rigHash:string;boneIds:string[];frame:number;time:number;fps:Rational;localMatrices:Matrix4[];globalMatrices:Matrix4[];palette:Matrix4[];ik:IKDiagnostic[]}
export interface RigDescription {rigHash:string;mesh:MeshData;skeleton:SkeletonData;budgets:{maxWork:number;maxBytes:number}}
export interface SkeletonRig {
  readonly rigHash:string;
  sample(context:FrameContext,controls?:RigControls):RigPose;
  /** Explicit CPU geometry query/oracle, never used as an implicit pixel-render fallback. */
  skin(pose:RigPose):Vec3[];
  validate(pose:RigPose):RigPose;
  describe():RigDescription;
  dispose():void;
}
export type RigCamera={position:Vec3;target:Vec3;up?:Vec3;near:number;far:number}&({projection:'perspective';verticalFov:number}|{projection:'orthographic';viewHeight:number});
export interface SkinnedRendererOptions {width:number;height:number;workingColor?:ColorEncoding;maxBytes?:number;fenceTimeoutMs?:number}
export interface SkinnedRenderOptions {camera:RigCamera;model?:Matrix4;ink?:Vec3;opacity?:number;format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface GPUPositionProbe {origin:Vec3;localPositions:Float32Array;positions:Float64Array;format:'mesh-position-f32-rebased'}
export interface SkinnedRendererStats {backend:Record<string,unknown>;width:number;height:number;renders:number;probes:number;draws:number;resizes:number;boneUploads:number;fencesCreated:number;fencesDestroyed:number;plannedBytes:number;physicalPeakBytes:null;disposed:boolean;lost:boolean;failed:boolean;geometries:number;textures:number;programs:number}
export interface SkinnedRenderer {render(pose:RigPose,options:SkinnedRenderOptions):Promise<ProfessionalSurface>;probePositions(pose:RigPose,options?:{signal?:AbortSignal}):Promise<GPUPositionProbe>;resize(width:number,height:number):void;stats():SkinnedRendererStats;dispose():Promise<void>}
