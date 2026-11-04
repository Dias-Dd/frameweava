// SPDX-License-Identifier: Apache-2.0
import type {FrameContext} from '../../../../src/core/types.ts';
import {coordinates,type PathEnvironment} from './common.ts';
import {linePath,stepPath,basisPath,cardinalPath,catmullRomPath,monotonePath,naturalPath,bumpPath,bundlePath,areaPath,radialLinePath,radialAreaPath,arcPath,symbolPath} from './curves.ts';
import {rectanglePath,roundedRectanglePath,ellipsePath,regularPolygonPath,polystarPath,spiralPath,sineWavePath,lissajousPath,superellipsePath} from './primitives.ts';
export {linePath,stepPath,basisPath,cardinalPath,catmullRomPath,monotonePath,naturalPath,bumpPath,bundlePath,areaPath,radialLinePath,radialAreaPath,arcPath,symbolPath,rectanglePath,roundedRectanglePath,ellipsePath,regularPolygonPath,polystarPath,spiralPath,sineWavePath,lissajousPath,superellipsePath};
export type {PathEnvironment,PathOptions,Scalar,Point} from './common.ts';
export type * from './curves.ts';
export type * from './primitives.ts';
export {prepareSolidPathStroke} from './prepare.ts';
export type {PrepareSolidStrokeOptions} from './prepare.ts';
export {drawPathMesh} from './native.ts';
const functions={linePath,stepPath,basisPath,cardinalPath,catmullRomPath,monotonePath,naturalPath,bumpPath,bundlePath,areaPath,radialLinePath,radialAreaPath,arcPath,symbolPath,rectanglePath,roundedRectanglePath,ellipsePath,regularPolygonPath,polystarPath,spiralPath,sineWavePath,lissajousPath,superellipsePath};
type Bound={readonly [K in keyof typeof functions]:(options:Parameters<typeof functions[K]>[0],context?:FrameContext)=>ReturnType<typeof functions[K]>};
/** Pure explicit-context facade; not a registry/Stage/runtime. No GPU initialization. */
export function createPathAuthoring(environment:PathEnvironment):Bound&{at(context:FrameContext):Bound}{const env=Object.freeze({...coordinates(environment)}),bind=(context?:FrameContext)=>Object.fromEntries(Object.entries(functions).map(([key,fn])=>[key,(options:unknown,override?:FrameContext)=>Reflect.apply(fn,undefined,[options,env,override??context])])) as Bound;return Object.freeze({...bind(),at:(context:FrameContext)=>Object.freeze(bind(context))});}
