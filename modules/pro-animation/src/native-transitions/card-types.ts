// SPDX-License-Identifier: Apache-2.0
import type {Signal} from '../../../../src/core/types.ts';
export type CardPoint=readonly [Signal<number>,Signal<number>];
export type CardVector=readonly [Signal<number>,Signal<number>,Signal<number>];
export type CardTransformOrder='XYZ-position'|'XZY-position'|'YXZ-position'|'YZX-position'|'ZXY-position'|'ZYX-position'|'position-XYZ'|'position-XZY'|'position-YXZ'|'position-YZX'|'position-ZXY'|'position-ZYX';
export type CardCamera=
 | {system?:'position';position?:CardPoint;rotationDegrees?:CardVector;depth?:Signal<number>;/** Physical pixel focal distance; default twice max(width,height). */focalLength?:Signal<number>;transformOrder?:CardTransformOrder}
 | {system:'corner-pins';/** TL, TR, BR, BL in normalized image coordinates. */corners:readonly [CardPoint,CardPoint,CardPoint,CardPoint];autoFocalLength?:boolean;focalLength?:Signal<number>}
 | {system:'composition';/** Existing external camera's homogeneous pixel X,Y,W rows, row-major 3x4. */projection:readonly Signal<number>[];near?:Signal<number>;eye?:CardVector};
export interface CardCompositionLight {kind:'point'|'distant'|'ambient';position?:CardVector;direction?:CardVector;color?:CardVector;intensity?:Signal<number>}
export interface CardLighting {
 type?:'point'|'distant'|'composition';position?:CardPoint;depth?:Signal<number>;color?:CardVector;intensity?:Signal<number>;ambient?:Signal<number>;
 /** Explicit caller-supplied existing composition light. No hidden scene lookup. */composition?:CardCompositionLight;
}
export interface CardMaterial {diffuse?:Signal<number>;specular?:Signal<number>;highlightSharpness?:Signal<number>}
export interface CardJitter {/** Translation is in pixels; rotation is in degrees. */amount?:CardVector;/** Independent signed frequencies in Hz, never wall clock. */speed?:CardVector}
export interface CardMeshControls {
 /** Legacy orthographic inverse warp remains available. Camera/material/jitter select mesh automatically. */geometry?:'orthographic'|'mesh';
 /** Counts round to nearest integer, ties up; existing Signals may animate them. */rows?:Signal<number>;columns?:Signal<number>;
 /** Canvas pixels. Defaults to bound Stage dimensions, then the first input. */outputSize?:readonly [number,number];
 camera?:CardCamera;lighting?:CardLighting;material?:CardMaterial;
 positionJitter?:CardJitter;rotationJitter?:CardJitter;
 flipDirection?:'positive'|'negative'|'random';
 /** Defaults to existing FrameContext.time; explicit local seconds for standalone calls. */time?:Signal<number>;
 /** None removes backs; image uses the explicit second input. */backside?:'image'|'none';
}
