import type {FrameContext} from '../../../src/core/types.ts';
import type {ProfessionalSurface} from '../../../src/media/surface.ts';
import type {MeshData,Matrix4,Vec3} from '../../graphics-contracts/types.ts';
export type {MeshData,Matrix4,Vec3};
export type SpatialTime=Pick<FrameContext,'frame'|'time'|'fps'>;
export type SpatialCamera={position:Vec3;target:Vec3;up?:Vec3;near:number;far:number}&(
  {projection:'perspective';verticalFov:number}|{projection:'orthographic';viewHeight:number}
);
export interface SpatialObject {id:string;model?:Matrix4;positions?:Vec3[]}
export interface SpatialSample {context:SpatialTime;camera:SpatialCamera;objects:SpatialObject[]}
export interface SpatialRendererOptions {width:number;height:number;meshes:MeshData[];maxBufferBytes?:number;fenceTimeoutMs?:number}
export interface SpatialPreview {kind:'depth'|'normal'|'motion'|'triptych';depthRange?:[number,number];motionScale?:number}
export interface SpatialCaptureOptions {preview?:SpatialPreview;signal?:AbortSignal}
export interface SpatialMetadata {
  experimental:true;world:'right-handed-meter-x-right-y-up-z-toward-viewer';image:'top-left-x-right-y-down-pixel-center';
  format:'interleaved-rgba32float';byteOrder:'little-endian';ownership:'owned-value';colorTransfer:'none';alpha:'none';
  depth:{definition:'positive-axial-negative-view-z';unit:'meter';currentNear:number;currentFar:number;previousNear:number;previousFar:number;channels:'depth,zero,zero,coverage'};
  normal:{space:'world';definition:'camera-facing-geometric-unit';channels:'x,y,z,coverage'};
  motion:{direction:'current-minus-explicit-previous';unit:'pixel';intervalSeconds:number;channels:'x,y,valid,coverage';validity:'previous-positive-w-and-near-far-clip';outsideViewport:'retained';previousVisibility:'not-tested'};
  coverage:'opaque-binary-nearest-no-msaa-background-zero';material:'geometry-only-no-opacity-cutout-or-texture';
}
/** Stage-local owned arrays. These are not Surface pixels and cannot cross a JSON port directly. */
export interface SpatialFrame {
  width:number;height:number;current:SpatialTime;previous:SpatialTime;metadata:SpatialMetadata;
  /** RGBA32F layout: positive axial view-depth meters,0,0,binary coverage. */
  depth:Float32Array;
  /** RGBA32F layout: camera-facing geometric unit normal in world XYZ,binary coverage. */
  normal:Float32Array;
  /** RGBA32F layout: current-minus-previous top-left pixel displacement X,Y,valid,binary coverage. */
  motion:Float32Array;
  /** Explicit diagnostic color visualization only. Never used to carry non-color values. */
  preview?:ProfessionalSurface;
}
