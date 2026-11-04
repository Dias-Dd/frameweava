// Frameweave local type-only declaration for the consumed unchanged upstream subset.
export interface DrawingContext {moveTo(x:number,y:number):void;lineTo(x:number,y:number):void;closePath():void;bezierCurveTo(x1:number,y1:number,x2:number,y2:number,x:number,y:number):void;quadraticCurveTo(x1:number,y1:number,x:number,y:number):void;arc(x:number,y:number,r:number,start:number,end:number,ccw?:boolean):void;rect(x:number,y:number,w:number,h:number):void}
export type CurveFactory=(context:DrawingContext)=>unknown;
interface TensionCurve extends CurveFactory {tension(value:number):CurveFactory}
interface AlphaCurve extends CurveFactory {alpha(value:number):CurveFactory}
interface BetaCurve extends CurveFactory {beta(value:number):CurveFactory}
export const curveLinear:CurveFactory,curveLinearClosed:CurveFactory,curveStep:CurveFactory,curveStepBefore:CurveFactory,curveStepAfter:CurveFactory,curveBasis:CurveFactory,curveBasisOpen:CurveFactory,curveBasisClosed:CurveFactory,curveMonotoneX:CurveFactory,curveMonotoneY:CurveFactory,curveNatural:CurveFactory,curveBumpX:CurveFactory,curveBumpY:CurveFactory;
export const curveCardinal:TensionCurve,curveCardinalOpen:TensionCurve,curveCardinalClosed:TensionCurve,curveCatmullRom:AlphaCurve,curveCatmullRomOpen:AlphaCurve,curveCatmullRomClosed:AlphaCurve,curveBundle:BetaCurve;
export interface Line<T> {(data:readonly T[]):void;defined(value:(p:T)=>boolean):this;x(value:(p:T)=>number):this;y(value:(p:T)=>number):this;curve(value:CurveFactory):this;context(value:DrawingContext):this}
export function line<T=readonly [number,number]>():Line<T>;
export interface Area<T> extends Line<T> {y0(value:(p:T)=>number):this;y1(value:(p:T)=>number):this}
export function area<T=readonly [number,number,number]>():Area<T>;
export interface RadialLine<T> {(data:readonly T[]):void;defined(value:(p:T)=>boolean):this;angle(value:(p:T)=>number):this;radius(value:(p:T)=>number):this;curve(value:CurveFactory):this;context(value:DrawingContext):this}
export function lineRadial<T=readonly [number,number]>():RadialLine<T>;
export interface RadialArea<T> extends RadialLine<T> {innerRadius(value:(p:T)=>number):this;outerRadius(value:(p:T)=>number):this}
export function areaRadial<T=readonly [number,number,number]>():RadialArea<T>;
export interface ArcDatum {innerRadius:number;outerRadius:number;startAngle:number;endAngle:number;padAngle:number}
export interface Arc {(datum:ArcDatum):void;cornerRadius(value:number):this;padRadius(value:number):this;context(value:DrawingContext):this}
export function arc():Arc;
export interface SymbolType {draw(context:DrawingContext,size:number):void}
export const symbolCircle:SymbolType,symbolCross:SymbolType,symbolDiamond:SymbolType,symbolSquare:SymbolType,symbolStar:SymbolType,symbolTriangle:SymbolType,symbolWye:SymbolType,symbolAsterisk:SymbolType,symbolPlus:SymbolType,symbolTimes:SymbolType;
export interface SymbolGenerator {():void;type(value:SymbolType):this;size(value:number):this;context(value:DrawingContext):this}
export function symbol():SymbolGenerator;
