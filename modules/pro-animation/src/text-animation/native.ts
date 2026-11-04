// SPDX-License-Identifier: Apache-2.0
// Thin prepared-glyph draw adapter to existing Native compute, texture ink and drawMesh.
import {EngineError} from '../../../../src/core/errors.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import {linear709,assertColor} from '../../../../src/media/surface.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {NativeStageInit} from '../../../native-gpu/authoring.ts';
import type {GpuDataBuffer} from '../../../gpu-effects/compute-types.ts';
import type {GpuPixelImage,GpuPixelImageInfo,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {displacement,coverage} from '../../../native-effects/pa/kernels.ts';
import {affinity,finite,integer,fields,number,fail,type GlyphTransform,type TextGlyphUnit} from './common.ts';
import type {PreparedGlyphDrawData} from './geometry.ts';
import {checkedInk,type GlyphInk} from '../text-styling/ink.ts';
const end=displacement.code.indexOf('fn scalar(');if(end<0)throw Error('Shared guarded Pair arithmetic changed');const math=displacement.code.slice(0,end);
const transformKernel={abiVersion:1 as const,id:'frameweave/pro-animation/glyphs/transform',version:'1.0.0',bindings:[{type:'f32' as const,access:'read' as const},{type:'u32' as const,access:'read' as const},{type:'f32' as const,access:'read' as const},{type:'f32' as const,access:'read_write' as const}],parameterWords:9,workgroupSize:[64,1,1] as const,code:math+`
fn control(at:u32)->Pair{return constant(load2(at),load2(at+1u));}
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x;let at=load1(i)*12u;let x=pair(vec4f(load0(i*3u)));let y=pair(vec4f(load0(i*3u+1u)));
 let ox=add(add(multiply(x,control(at)),multiply(y,control(at+4u))),control(at+8u));
 let oy=add(add(multiply(x,control(at+2u)),multiply(y,control(at+6u))),control(at+10u));
 store3(i*3u,rounded(ox).x);store3(i*3u+1u,rounded(oy).x);store3(i*3u+2u,load0(i*3u+2u));}`};
// Existing compensated coverage kernel, only the per-unit color source is adapted.
const unitCoverage={...coverage,id:'frameweave/pro-animation/glyphs/unit-ink',dataInputs:[{type:'f32' as const},{type:'f32' as const}],code:coverage.code.replace('let ink=Pair(vec4f(paramF32(0u),paramF32(2u),paramF32(4u),1.),vec4f(paramF32(1u),paramF32(3u),paramF32(5u),0.));return rounded(multiply(multiply(ink,scalar(6u)),a));','let at=4u*index;let ink=Pair(vec4f(data1(at),data1(at+2u),data1(at+4u),1.),vec4f(data1(at+1u),data1(at+3u),data1(at+5u),0.));return rounded(multiply(multiply(ink,constant(data1(at+6u),data1(at+7u))),a));')};
if(!unitCoverage.code.includes('data1(at)'))throw Error('Original coverage ink kernel changed');
const blank:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/glyphs/empty',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'};
const split=(x:number,path:string)=>{const hi=Math.fround(finite(x,path)),lo=Math.fround(x-hi);if(!Number.isFinite(hi)||!Number.isFinite(lo)||x!==0&&hi===0||hi!==0&&Math.abs(hi)<2**-126||lo!==0&&Math.abs(lo)<2**-126)fail(path,'normal finite F32-pair coefficient; rescale unresolved coordinates');return [hi,lo];};
const namedError=(operation:string,error:unknown)=>error instanceof EngineError?new EngineError(error.code,`${operation}(): ${error.message}`,{stageId:error.stageId,frame:error.frame,hint:error.hint,details:{operation,cause:error.details}}):error;
declare const handleBrand:unique symbol;
export interface NativeGlyphHandle {readonly [handleBrand]:true;readonly units:readonly TextGlyphUnit[];readonly glyphCount:number;readonly triangleCount:number}
export interface NativeGlyphDrawOptions {transform?:GlyphTransform;inkForUnit?:GlyphInk;ink?:readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>];format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface NativeGlyphEnvironment extends Pick<NativeStageInit,'gpu'|'width'|'height'> {color?:GpuPixelImageInfo['color'];format?:GpuPixelImageInfo['format']}
/** Init/prepare once. at(context) is an ordinary explicit-frame facade, never a global current frame.
 * Returned images are caller-owned, frame-epoch values. This adapter retains no prior image. */
export function createNativeGlyphRenderer(environment:NativeGlyphEnvironment){
 const g=environment.gpu,cap=g?.capabilities(),width=environment.width,height=environment.height,color=environment.color??linear709,format=environment.format??'rgba32float';
 if(cap?.backend!=='native-wgpu'||cap.hardwareVerified!==true)throw new EngineError('E_PA_TEXT_DEVICE','Native glyph drawing needs the admitted Native owner; no CPU/Canvas fallback');assertColor(color);
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||color.transfer!=='linear'||color.reference!=='scene'||!['rgba16float','rgba32float'].includes(format))fail('environment','positive Stage dimensions and scene-linear F16/F32');
 const handles=new WeakMap<object,{base?:GpuDataBuffer;unitIds?:GpuDataBuffer;uv?:GpuDataBuffer;units:readonly TextGlyphUnit[];vertices:number;columns:number;rows:number}>(),owned=new Set<GpuDataBuffer>();let started=false,closed=false,pending:Promise<GpuPixelImage>|undefined,preparation:Promise<NativeGlyphHandle>|undefined,closing:Promise<void>|undefined,preparing=false;
 const active=(signal?:AbortSignal)=>{if(closed)throw new EngineError('E_PA_TEXT_CLOSED','Glyph renderer is closed');if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Glyph drawing cancelled before publication');};
 async function prepareLayout(data:PreparedGlyphDrawData):Promise<NativeGlyphHandle>{
  active();if(started||pending||preparing)throw new EngineError('E_PA_TEXT_PREPARE','Prepare stable glyph layouts during Stage initialization, before the first draw');preparing=true;const allocated:GpuDataBuffer[]=[];
  try{
   const layout=graphics.validateTextLayoutData(data.layout);if(layout.coordinates.width!==width||layout.coordinates.height!==height||layout.coordinates.unit!=='px')fail('layout.coordinates','Stage-sized physical pixels');
   if(!Array.isArray(data.units)||!Array.isArray(data.positions)||!Array.isArray(data.vertexUnits)||data.positions.length%9!==0||data.positions.length!==data.vertexUnits.length*3)fail('prepared geometry','complete XYZ triangles and one unit index per vertex');
   const units=structuredClone(data.units),covered=new Set<number>(),logical=new Set<number>(),visual=new Set<number>(),paragraphs=new Map(layout.paragraphs.map(p=>[p.id,p.direction])),lineDirections=new Map(layout.lines.map(l=>[l.id,paragraphs.get(l.paragraphId)]));
   if(units.length>layout.glyphs.length)fail('units','at most one independent unit per canonical glyph');
   for(const [index,u]of units.entries()){
    integer(u.index,'unit.index');integer(u.logicalIndex,'unit.logicalIndex');integer(u.visualIndex,'unit.visualIndex');if(u.count!==units.length||u.index!==index||u.logicalIndex>=units.length||u.visualIndex>=units.length||logical.has(u.logicalIndex)||visual.has(u.visualIndex)||!Array.isArray(u.anchor)||u.anchor.length!==2||u.direction!==lineDirections.get(u.lineId)||!Array.isArray(u.glyphIndices)||u.glyphIndices.length===0)fail(`units[${index}]`,'existing shaped unit metadata, unique orders and paragraph direction');logical.add(u.logicalIndex);visual.add(u.visualIndex);u.anchor.forEach((n:number,i:number)=>finite(n,`anchor[${i}]`));
    for(const glyphIndex of u.glyphIndices){integer(glyphIndex,'unit.glyphIndex');const glyph=layout.glyphs[glyphIndex];if(!glyph||covered.has(glyphIndex)||glyph.lineId!==u.lineId||glyph.cluster.start!==u.cluster.start||glyph.cluster.end!==u.cluster.end||u.text!==layout.text.slice(u.cluster.start,u.cluster.end))fail(`units[${index}].glyphIndices`,'unique matching canonical glyph/cluster ranges');covered.add(glyphIndex);}
   }
   if(covered.size!==layout.glyphs.length)fail('units','complete canonical glyph coverage, including whitespace');
   const visit:object[]=[units],seen=new WeakSet<object>();while(visit.length){const value=visit.pop()!;if(seen.has(value))continue;seen.add(value);for(const child of Object.values(value))if(child&&typeof child==='object')visit.push(child);Object.freeze(value);}
   const bytes=data.vertexUnits.length*12,limits=g.capabilities().limits;if(!Number.isSafeInteger(bytes)||bytes>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))throw new EngineError('E_PA_TEXT_ADMISSION','Prepared glyph positions exceed the current device buffer admission',{details:{bytes}});
   const vertices=data.vertexUnits.length,base=Float32Array.from(data.positions.map((n,i)=>{finite(n,`positions[${i}]`);if(!Number.isFinite(Math.fround(n))||n!==0&&Math.fround(n)===0)fail(`positions[${i}]`,'representable F32 geometry');return n;}));
   const ids=Uint32Array.from(data.vertexUnits.map(n=>{integer(n,'vertex unit');if(n>=units.length)fail('vertex unit','existing prepared unit');return n;})),columns=Math.max(1,Math.ceil(Math.sqrt(units.length))),rows=Math.max(1,Math.ceil(units.length/columns)),uv=new Float32Array(vertices*2);
   for(let i=0;i<vertices;i++){uv[i*2]=(ids[i]%columns+.5)/columns;uv[i*2+1]=(Math.floor(ids[i]/columns)+.5)/rows;}
   const allocate=async<D extends GpuDataBuffer>(promise:Promise<D>)=>{const buffer=await promise;allocated.push(buffer);active();return buffer;};
   const buffers=vertices?{base:await allocate(g.createField({type:'f32',dimensions:[vertices,1,1],components:3,semantic:'position',space:layout.coordinates.spaceId,units:'px'},base)),unitIds:await allocate(g.createBuffer({type:'u32',length:vertices},ids)),uv:await allocate(g.createField({type:'f32',dimensions:[vertices,1,1],components:2,semantic:'generic',channels:['u','v']},uv))}:{};
   const handle=Object.freeze({units:Object.freeze(units),glyphCount:layout.glyphs.length,triangleCount:vertices/3}) as NativeGlyphHandle;handles.set(handle,{...buffers,units,vertices,columns,rows});for(const buffer of allocated)owned.add(buffer);return handle;
  }catch(error){for(const buffer of allocated.reverse())await g.releaseBuffer(buffer);throw error;}finally{preparing=false;}
 }
 function prepare(data:PreparedGlyphDrawData){if(preparation)return Promise.reject(new EngineError('E_PA_TEXT_BUSY','createNativeGlyphRenderer.prepare(): await the current preparation'));const promise=prepareLayout(data).catch(error=>{throw namedError('createNativeGlyphRenderer.prepare',error);});preparation=promise;void promise.then(()=>{preparation=undefined;},()=>{preparation=undefined;});return promise;}
 async function record(handle:NativeGlyphHandle,options:NativeGlyphDrawOptions,context:FrameContext){
  if(!context||!Number.isFinite(context.time)||!Number.isFinite(context.frame)||!Number.isFinite(context.globalTime)||!Number.isFinite(context.globalFrame))fail('context','explicit finite existing FrameContext');
  fields(options,['transform','inkForUnit','ink','format','signal']);if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('signal','AbortSignal');active(options.signal);const data=handles.get(handle);if(!data)fail('handle','glyph layout prepared by this Stage instance');
  const output={width,height,color,format:options.format??format,alpha:'premultiplied' as const};if(!['rgba16float','rgba32float'].includes(output.format))fail('format','rgba16float or rgba32float');
  const inputInk=options.ink??[1,1,1,1];if(!Array.isArray(inputInk)||inputInk.length!==4)fail('ink','scene-linear RGBA tuple');const ink=inputInk.map((v,i)=>number(v,context,`ink[${i}]`)),inkWords=new Float32Array(9);ink.forEach((v,i)=>inkWords.set(split(v,`ink[${i}]`),i*2));if(ink[3]<0||ink[3]>1)fail('ink[3]','Alpha in [0,1]');
  if(output.format==='rgba16float'&&ink.slice(0,3).some(v=>Math.abs(v)>65504))throw new EngineError('E_GPU_FLOAT_PRECISION','ink RGB exceeds the direct Half drawing profile; use rgba32float or explicitly rescale the scene-linear ink',{details:{parameter:'ink',format:output.format,maximumAbsoluteRgb:65504}});
  if(options.transform!==undefined&&typeof options.transform!=='function')fail('transform','pure unit/context transform callback');if(options.inkForUnit!==undefined&&typeof options.inkForUnit!=='function')fail('inkForUnit','pure unit/context/linear-base callback');
  const unitInks=options.inkForUnit?new Float32Array(data.columns*data.rows*8):undefined;const matrices=new Float32Array(data.units.length*12),opacities=new Float32Array(data.columns*data.rows*2);
  for(const [i,u]of data.units.entries()){
   active(options.signal);const transform=options.transform?.(u,context)??{matrix:[1,0,0,1,0,0],opacity:1},a=affinity(transform.matrix),alpha=finite(transform.opacity,`units[${i}].opacity`);if(alpha<0||alpha>1)fail(`units[${i}].opacity`,'fraction in [0,1]');a.forEach((n,j)=>matrices.set(split(n,`units[${i}].matrix[${j}]`),i*12+j*2));opacities.set(split(alpha,`units[${i}].opacity`),i*2);if(unitInks){const unitInk=checkedInk(options.inkForUnit!(u,context,Object.freeze([...ink]) as unknown as readonly[number,number,number,number]));if(output.format==='rgba16float'&&unitInk.slice(0,3).some(v=>Math.abs(v)>65504))throw new EngineError('E_GPU_FLOAT_PRECISION','Per-unit ink exceeds direct Half profile; use rgba32float');unitInk.forEach((v,j)=>unitInks.set(split(v,`units[${i}].ink[${j}]`),i*8+j*2));}
  }
  if(!data.vertices){const image=await g.run(await g.compile(blank),[],{output,signal:options.signal});if(closed||options.signal?.aborted){await g.release(image);active(options.signal);}return image;}
  return withGpuResources(g,async arena=>{
   const controls=arena.buffer(await g.createBuffer({type:'f32',length:matrices.length},matrices)),alpha=arena.buffer(await g.createField({type:'f32',dimensions:[data.columns,data.rows,1],components:2,semantic:'generic',channels:['glyph-opacity-high','glyph-opacity-residual']},opacities)),positions=arena.buffer(await g.createField({type:'f32',dimensions:[data.vertices,1,1],components:3,semantic:'position',space:'stage',units:'px'}));active(options.signal);
   await g.dispatch(await g.compileCompute(transformKernel),[data.base!,data.unitIds!,controls,positions],{workItems:[data.vertices,1,1],parameters:new Uint32Array(9),signal:options.signal});active(options.signal);
   const colors=unitInks?arena.buffer(await g.createBuffer({type:'f32',length:unitInks.length},unitInks)):undefined;const palette=arena.image(await g.run(await g.compile(colors?unitCoverage:coverage),[],{parameters:inkWords,data:colors?[alpha,colors]:[alpha],output:{width:data.columns,height:data.rows,color,format:'rgba32float',alpha:'premultiplied'},signal:options.signal}));active(options.signal);
   const image=arena.image(await g.drawMesh({positions,texture:{version:1,image:palette,uvs:data.uv!,filter:'nearest',addressU:'clamp',addressV:'clamp'},matrix:[2/width,0,0,0,0,-2/height,0,0,0,0,1,0,-1,1,0,1],count:data.vertices,raster:{version:1,mode:'depth-peel'},output}));active(options.signal);return arena.keep(image);
  });
 }
 function draw(handle:NativeGlyphHandle,options:NativeGlyphDrawOptions,context:FrameContext){
  try{active(options?.signal);if(preparing||pending)throw new EngineError('E_PA_TEXT_BUSY','Await the current glyph preparation/draw');}catch(error){return Promise.reject(namedError('createNativeGlyphRenderer.draw',error));}started=true;const promise=record(handle,options,context).catch(error=>{throw namedError('createNativeGlyphRenderer.draw',error);});pending=promise;void promise.then(()=>{pending=undefined;},()=>{pending=undefined;});return promise;
 }
 return {prepare,draw,at(context:FrameContext){return {draw:(handle:NativeGlyphHandle,options:NativeGlyphDrawOptions={})=>draw(handle,options,context)};},dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await Promise.all([pending?.catch(()=>{}),preparation?.catch(()=>{})]);for(const buffer of owned)await g.releaseBuffer(buffer);owned.clear();})();}};
}
