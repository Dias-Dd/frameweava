/** JSON wire values only. No engine objects, closures, typed buffers or implicit time. */
export interface Header<S extends string> {schema:S;version:1;id:string}
export interface Coordinates2D {
  spaceId:string;unit:'px'|'normalized';origin:'top-left';x:'right';y:'down';width:number;height:number;
}
export interface Coordinates3D {
  spaceId:string;unit:'meter';origin:'local';x:'right';y:'up';z:'toward-viewer';handedness:'right';
}
export type Vec2=[number,number];
export type Vec3=[number,number,number];
export type Matrix4=[number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number];
export interface ResourceReference {resourceId:string;kind:'file'|'image'|'font';sha256:string;bytes:number}
export interface Color {space:'srgb';alpha:'straight';rgba:[number,number,number,number]}
export interface PathPoint {id:string;x:number;y:number}
export type PathCommand=
  | {op:'M'|'L';point:PathPoint}
  | {op:'Q';control:PathPoint;point:PathPoint}
  | {op:'C';control1:PathPoint;control2:PathPoint;point:PathPoint}
  | {op:'Z'};
export interface PathData extends Header<'frameweave.path'> {
  coordinates:Coordinates2D;fillRule:'nonzero'|'evenodd';commands:PathCommand[];label?:string;
}
interface MaskBase extends Header<'frameweave.mask'> {
  coordinates:Coordinates2D;sampling:'nearest'|'linear';boundary:'zero'|'clamp';
  /** v1 exchanges unfeathered coverage; a nonzero radius is unsupported, never ignored. */
  feather:{radius:0;unit:'px'};
}
export type MaskData=MaskBase&(
  | {kind:'vector';path:PathData}
  | {kind:'raster';source:ResourceReference;format:'rgba8';channel:'alpha'|'luma';colorSpace:'srgb';alpha:'straight'}
);
export interface MeshData extends Header<'frameweave.mesh'> {
  coordinates:Coordinates3D;topology:'triangles';vertexIds:string[];restPositions:Vec3[];indices:number[];
  uv?:Vec2[];uvOrigin?:'top-left';controls?:{id:string;vertexId:string}[];
  material?:{baseColor?:Color;texture?:ResourceReference};
}
export interface SkeletonData extends Header<'frameweave.skeleton'> {
  coordinates:Coordinates3D;meshId:string;
  /** Global mesh-space bind matrices, column-major, column vectors. */
  bones:{id:string;parentId:string|null;bindMatrix:Matrix4;inverseBindMatrix:Matrix4}[];
  weights:{vertexId:string;influences:{boneId:string;weight:number}[]}[];
}
/** Paragraph block flow; independent from the paragraph's Bidi direction. */
export type TextWritingMode='horizontal-tb'|'vertical-rl'|'vertical-lr';
/** Coordinate held constant by the scalar baseline, not the baseline tangent. */
export type TextBaselineAxis='x'|'y';
/** Quarter-turn of glyph ink about its final origin; never changes shaped metrics. */
export type TextGlyphOrientation='upright'|'sideways-right'|'sideways-left';
export interface TextLayoutData extends Header<'frameweave.text-layout'> {
  coordinates:Coordinates2D;text:string;layout:{engine:string;version:string;clusterUnit:'utf16'};
  fonts:{id:string;source:ResourceReference;faceIndex:number}[];
  styles:{id:string;fontId:string;fontSize:number;fill:Color}[];
  paragraphs:{id:string;start:number;end:number;direction:'ltr'|'rtl';writingMode?:TextWritingMode}[];
  lines:{id:string;paragraphId:string;start:number;end:number;baseline:number;baselineAxis?:TextBaselineAxis}[];
  /** Array is visual draw order. Clusters are logical UTF-16 ranges; glyph IDs are font-specific. */
  glyphs:{id:string;lineId:string;styleId:string;glyphId:number;cluster:{start:number;end:number};x:number;y:number;advanceX:number;advanceY:number;orientation?:TextGlyphOrientation}[];
}
/** Preserve the already validated MVP wire identity, timestamps and missing observations. */
export type {TrackData,TrackSample,TrackQuery} from './track-types.ts';
export type GraphicsData=PathData|MaskData|MeshData|SkeletonData|TextLayoutData;
