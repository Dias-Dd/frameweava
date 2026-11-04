// SPDX-License-Identifier: Apache-2.0
// Derived local controls over existing PathData/TextLayoutData; no public wire schema.
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {Signal,FrameContext,Diagnostic} from '../../../../src/core/types.ts';
import type {Affine} from '../../../../src/media/compositor-geometry.ts';
import type {CurveSample} from '../curve-sampler.ts';
import type {ParagraphIndex,ParagraphCluster} from '../text-layout/queries.ts';
export {frozen} from '../text-layout/common.ts';
export interface PathTextUnit extends ParagraphCluster {readonly pathRank:number;readonly logicalRank:number;readonly pathCount:number;readonly centerX:number;readonly baseline:number}
export interface PathTextLine {readonly index:ParagraphIndex;readonly lineId:string;readonly units:readonly PathTextUnit[];readonly originX:number;readonly baseline:number;readonly advance:number}
export interface PathTextAdjustment {distance?:number;normal?:number;rotationDegrees?:number;scaleX?:number;scaleY?:number;opacity?:number}
/** Batch callbacks evaluate once per layout, not O(n²) for cumulative spacing. */
export type PathTextControl=(units:readonly PathTextUnit[],context:FrameContext)=>readonly PathTextAdjustment[];
export interface PathTextPlacement {readonly unit:PathTextUnit;readonly sourceCenter:readonly [number,number];readonly distance:number;readonly sample:Readonly<CurveSample>;readonly clipped:boolean;readonly position:readonly [number,number];readonly angleRadians:number;readonly scale:readonly [number,number];readonly matrix:Readonly<Affine>;readonly opacity:number}
export interface PathTextFrame {readonly index:ParagraphIndex;readonly placements:readonly PathTextPlacement[];readonly diagnostics:readonly Diagnostic[]}
export function fail(message:string,details?:unknown):never{throw new EngineError('E_PA_PATH_TEXT',message,{details});}
export function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail(name+' must be finite');return n;}
export function scalar(v:Signal<number>,c:FrameContext,name:string){return finite(evaluate(v,c),name);}
export function fields(v:object,keys:readonly string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('Use documented path-text options/adjustment fields');}
export function snapshot<T>(v:T):T{try{return structuredClone(v);}catch{return fail('Use cloneable existing Signals');}}
export function fraction(n:number,name:string){finite(n,name);if(n<0||n>1)fail(name+' must be[0,1]');return n;}
export function adjustment(input:PathTextAdjustment={}){fields(input,['distance','normal','rotationDegrees','scaleX','scaleY','opacity']);return {distance:finite(input.distance??0,'distance'),normal:finite(input.normal??0,'normal'),rotationDegrees:finite(input.rotationDegrees??0,'rotationDegrees'),scaleX:finite(input.scaleX??1,'scaleX'),scaleY:finite(input.scaleY??1,'scaleY'),opacity:fraction(input.opacity??1,'opacity')};}
export function xy(matrix:Readonly<Affine>,x:number,y:number):readonly [number,number]{return [finite(matrix[0]*x+matrix[2]*y+matrix[4],'mapped x'),finite(matrix[1]*x+matrix[3]*y+matrix[5],'mapped y')];}
export function transformAt(center:readonly [number,number],position:readonly [number,number],angle:number,scale:readonly [number,number]):Affine{const a=Math.cos(angle)*scale[0],b=Math.sin(angle)*scale[0],c=-Math.sin(angle)*scale[1],d=Math.cos(angle)*scale[1];return [a,b,c,d,position[0]-a*center[0]-c*center[1],position[1]-b*center[0]-d*center[1]].map((n,i)=>finite(n,'matrix'+i)) as Affine;}
