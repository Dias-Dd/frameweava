// SPDX-License-Identifier: Apache-2.0
import type {Signal,FrameContext} from '../../src/core/types.ts';
import type {PathData,ResourceReference,TextLayoutData} from '../graphics-contracts/types.ts';
import type {CreationInit,CreationInputs,CreationOptions,CreationStage,CreationImageResource} from '../spatial-creation/types.ts';
import type {CreationColor} from '../spatial-creation/colors.ts';
import type {createPathOperations} from '../pro-animation/src/path-operations.ts';
import type {PreparedStrokeMesh} from '../pro-animation/src/stroke-animation/geometry.ts';

/** All geometry is local px, top-left origin/Y down. Matrix is Canvas column-vector [a,b,c,d,e,f]. */
export type Matrix2D=readonly[number,number,number,number,number,number];
export type AnimatedPoint=readonly[Signal<number>,Signal<number>];
export interface Transform2D {x?:Signal<number>;y?:Signal<number>;rotation?:Signal<number>;scaleX?:Signal<number>;scaleY?:Signal<number>;anchor?:AnimatedPoint;matrix?:Matrix2D}
export interface SolidPaint {kind:'solid';color:CreationColor;opacity?:Signal<number>}
export interface GradientStop {at:Signal<number>;color:CreationColor;opacity?:Signal<number>}
export type GradientInterpolation='linear-premultiplied'|'linear-straight'|'srgb-straight';
export interface LinearPaint {kind:'linear';from:AnimatedPoint;to:AnimatedPoint;stops:readonly GradientStop[];spread?:'pad'|'repeat'|'reflect';matrix?:Matrix2D;interpolation?:GradientInterpolation}
export interface RadialPaint {kind:'radial';center:AnimatedPoint;radius:AnimatedPoint;stops:readonly GradientStop[];spread?:'pad'|'repeat'|'reflect';matrix?:Matrix2D;interpolation?:GradientInterpolation}
export type Paint=SolidPaint|LinearPaint|RadialPaint;
export interface StrokeStyle {paint:Paint;width:Signal<number>;cap?:'butt'|'round'|'square';join?:'miter'|'round'|'bevel'|'square';miterLimit?:number}
export interface NodeBase extends Transform2D {id:string;opacity?:Signal<number>;visible?:boolean;layout?:import('./layout.ts').LayoutStyle2D;clip?:PathData|{paths:readonly PathData[]}|{rect:readonly[number,number,number,number]}}
export interface GroupNode extends NodeBase {kind:'group';children:readonly Node2D[]}
export interface ShapeNode extends NodeBase {kind:'shape';shape:({kind:'rect';width:Signal<number>;height:Signal<number>;radius?:Signal<number>}|{kind:'ellipse';radius:AnimatedPoint}|{kind:'path';data:PathData});fill?:Paint|false;stroke?:StrokeStyle}
export interface ImageNode extends NodeBase {kind:'image';source:{resource:CreationImageResource}|{input:string;size:readonly[number,number]};width?:Signal<number>;height?:Signal<number>;fit?:'contain'|'cover'|'stretch';sampling?:'nearest'|'linear'}
export interface TextNode extends NodeBase {kind:'text';text:Signal<string>;font:string;fallback?:readonly string[];fontSize?:Signal<number>;width?:Signal<number>;lineHeight?:Signal<number>;letterSpacing?:Signal<number>;direction?:'ltr'|'rtl';script?:string;language?:string;fill?:Paint;stroke?:StrokeStyle}
export type Node2D=GroupNode|ShapeNode|ImageNode|TextNode;
export interface Bounds2D {left:number;top:number;right:number;bottom:number}
export interface PreparedText2D {mesh:Pick<PreparedStrokeMesh,'positions'>;strokeMesh?:Pick<PreparedStrokeMesh,'positions'>;layout:TextLayoutData;bounds:Bounds2D;baseline:number;diagnostics:readonly unknown[];fontIdentities:readonly ResourceReference[]}
/** Adapters borrow admitted existing services. They do not parse fonts or create another host. */
export interface Services2D {curveFactory?:import('../pro-animation/src/curve-geometry/session.ts').CurveGeometryFactory;pathOperations?:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'|'strokePathsStream'>;text?:{prepare(node:TextNode,context:FrameContext,viewport:readonly[number,number]):Promise<PreparedText2D>}}
export interface Scene2DOptions extends CreationOptions {viewBox?:readonly[number,number,number,number];maxBytes?:number;geometryTolerance?:number;gradientPixelsPerUnit?:number;maxAtlasBytes?:number;maxLayoutPasses?:number}
export interface Scene2D extends CreationStage {setRoot(root:Node2D):void;update(id:string,patch:Partial<Node2D>):void;node(id:string):Readonly<Node2D>;canvas(context:FrameContext,options?:{id?:string}):import('./canvas.ts').CanvasRecorder2D}
export type {CreationInit,CreationInputs,FrameContext,Signal,PathData};
