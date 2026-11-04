// SPDX-License-Identifier: Apache-2.0
// Layout adapter only: original shaped glyph geometry -> prepared curve samples -> existing glyph transforms.
import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {Signal,FrameContext,Diagnostic} from '../../../src/core/types.ts';
import type {TextTransform} from './animated-text.ts';
import type {GlyphAnimationUnit,createGlyphAnimator} from './glyph-animation.ts';
import type {CurveSample} from './curve-sampler.ts';
import {sampleGlyphDistances,type GlyphPathReader} from './glyph-path-samples.ts';
type GlyphAnimator=ReturnType<typeof createGlyphAnimator>;
type CurveReader=GlyphPathReader;
export interface PathGlyphUnit extends GlyphAnimationUnit {readonly distance:number;readonly sample:Readonly<CurveSample>;readonly clipped:boolean}
export interface GlyphOnPathOptions {
 contour?:number;unit?:'cluster'|'glyph';order?:'logical'|'visual';
 offset?:Signal<number>;letterSpacing?:Signal<number>;normalOffset?:Signal<number>;
 /** Physical x origin of the original horizontal run; default minimum unit anchor x. */
 sourceOriginX?:number;
 overflow?:'error'|'clip'|'wrap';orient?:'tangent'|'upright';side?:'incoming'|'outgoing';signal?:AbortSignal;
 /** Additional world-space translation / tangent-relative rotation / source-center scale and per-glyph opacity. */
 transform?:(unit:PathGlyphUnit,context:FrameContext)=>TextTransform;
}
function fail(code:string,message:string,details?:unknown):never {throw new EngineError(code,message,{details});}
export async function glyphsOnPath(animator:GlyphAnimator,curve:CurveReader,options:GlyphOnPathOptions,context:FrameContext){
 const check=()=>{if(options.signal?.aborted)fail('E_PA_TEXT_PATH_CANCELLED','Glyph path placement cancelled',{reason:String(options.signal.reason)});};check();
 const source=animator.sourceLayout.coordinates;
 if(Object.keys(source).some(key=>Reflect.get(source,key)!==Reflect.get(curve.coordinates,key)))fail('E_PA_TEXT_PATH_SPACE','Glyphs and baseline require identical physical coordinates');
 if(animator.sourceLayout.lines.length>1||animator.sourceLayout.glyphs.some(g=>g.advanceY!==0))fail('E_PA_TEXT_PATH_RUN','Place one explicitly shaped horizontal run at a time');
 const unit=options.unit??'cluster',order=options.order??'logical',overflow=options.overflow??'error',orient=options.orient??'tangent',contour=options.contour??(curve.metrics.contours.length===1?0:undefined);
 if(!['error','clip','wrap'].includes(overflow)||!['tangent','upright'].includes(orient)||!['logical','visual'].includes(order))fail('E_PA_TEXT_PATH_PARAMETER','Known overflow and orientation rules required');
 if(contour===undefined||!Number.isInteger(contour)||contour<0||contour>=curve.metrics.contours.length)fail('E_PA_TEXT_PATH_CONTOUR','Choose one existing baseline contour');
 const metric=curve.metrics.contours[contour];if(overflow==='wrap'&&!metric.closed)fail('E_PA_TEXT_PATH_CLOSURE','Wrap requires a closed baseline');
 const scalar=(s:Signal<number>,name:string)=>{const n=evaluate(s,context);if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_TEXT_PATH_PARAMETER',`${name} must be finite`);return n;};
 const offset=scalar(options.offset??0,'offset'),spacing=scalar(options.letterSpacing??0,'letterSpacing'),normal=scalar(options.normalOffset??0,'normalOffset');
 if(options.transform!==undefined&&typeof options.transform!=='function')fail('E_PA_TEXT_PATH_TRANSFORM','Transform callback must be a function');if(options.sourceOriginX!==undefined&&!Number.isFinite(options.sourceOriginX))fail('E_PA_TEXT_PATH_PARAMETER','Source origin must be finite');
 const units=animator.units({unit,order:'visual'}),origin=options.sourceOriginX??units.reduce((min,u)=>Math.min(min,u.anchor[0]),Infinity);
 if(units.length&&(!Number.isFinite(origin)||metric.length<=0))fail('E_PA_TEXT_PATH_DEGENERATE','Finite run origin and positive baseline length required');
 const positions=units.map(u=>{const center=u.anchor[0]+u.advanceX/2,distance=offset+center-origin+u.visualIndex*spacing;if(!Number.isFinite(distance))fail('E_PA_TEXT_PATH_PARAMETER','Path distance overflow');return {center,distance,clipped:overflow==='clip'&&(distance<0||distance>metric.length)};});
 if(overflow==='error'&&positions.some(p=>p.distance<0||p.distance>metric.length))fail('E_PA_TEXT_PATH_RANGE','Glyph center exceeds baseline; select clip or closed wrap explicitly',{length:metric.length});
 const sampled=await sampleGlyphDistances(curve,positions.map(p=>p.distance),{contour,overflow,side:options.side,signal:options.signal}),samples=sampled.map(p=>p.sample);check();
 if(samples.length!==units.length)fail('E_PA_TEXT_PATH_OUTPUT','Baseline reader returned an incomplete sample batch');
 const placements=units.map((u,i)=>Object.freeze({...u,index:order==='logical'?u.logicalIndex:u.visualIndex,distance:positions[i].distance,sample:Object.freeze({...samples[i],tangent:Object.freeze([...samples[i].tangent]) as readonly [number,number]}),clipped:positions[i].clipped})),byVisual=new Map(placements.map(p=>[p.visualIndex,p]));
 const drawing=animator.animate({unit,order,signal:options.signal,transform:u=>{
  check();const placement=byVisual.get(u.visualIndex)!,point=placement.sample,center=u.anchor[0]+u.advanceX/2;
  if(!placement.clipped&&(orient==='tangent'||normal!==0)&&point.tangentStatus==='undefined')fail('E_PA_TEXT_PATH_TANGENT','Baseline tangent is undefined at a stationary interior point; choose upright/zero normal or another distance',{contour,distance:point.distance,segment:point.segment});
  const extra=options.transform?.({...placement,index:u.index,logicalIndex:u.logicalIndex,visualIndex:u.visualIndex,count:u.count},context)??{};
  if(!extra||typeof extra!=='object'||'then' in extra||Object.keys(extra).some(k=>!['dx','dy','rotation','scaleX','scaleY','opacity'].includes(k)))fail('E_PA_TEXT_PATH_TRANSFORM','Return synchronous typed transforms; source center anchor is fixed by path placement');
  const dx=scalar(extra.dx??0,'dx'),dy=scalar(extra.dy??0,'dy'),rotation=scalar(extra.rotation??0,'rotation'),opacity=scalar(extra.opacity??1,'opacity');
  if(opacity<0||opacity>1)fail('E_PA_TEXT_PATH_TRANSFORM','Opacity must be [0,1]');
  return {anchor:[center,u.anchor[1]],dx:point.x-center-point.tangent[1]*normal+dx,dy:point.y-u.anchor[1]+point.tangent[0]*normal+dy,rotation:(orient==='tangent'?(point.angleRadians??0):0)+rotation,scaleX:extra.scaleX,scaleY:extra.scaleY,opacity:placement.clipped?0:opacity};
 }},context);
 const diagnostics:Diagnostic[]=[...drawing.diagnostics];const clipped=placements.filter(p=>p.clipped);
 if(clipped.length)diagnostics.push({code:'W_PA_TEXT_PATH_CLIPPED',severity:'warning',message:'Glyph units whose centers exceed the baseline are explicitly hidden, not reshaped',details:{indices:clipped.map(p=>p.visualIndex),contour}});
 return {...drawing,placements,diagnostics};
}
