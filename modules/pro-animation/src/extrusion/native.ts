// SPDX-License-Identifier: Apache-2.0
// Existing A4 CharacterDocument mesh/material/GPU consumer. No copied lighting/raster/scene engine.
import {Matrix4} from 'three';import {EngineError} from '../../../../src/core/errors.ts';import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';import type {NativeStageInit} from '../../../native-gpu/authoring.ts';
import {linear709} from '../../../../src/media/surface.ts';import type {GpuPixelImage,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import {createCharacterRenderer,type CharacterRenderOptions} from '../../../spatial-creation/character-renderer.ts';import {characterDocument,characterFingerprint} from '../../../spatial-creation/character-animation.ts';
import type {CharacterDocument,CharacterMaterial,CharacterSample,Matrix4 as Matrix} from '../../../spatial-creation/character-assets.ts';
import type {ShapeRunOptions} from '../font-shaping.ts';import type {BidiFont} from '../bidi-line.ts';import type {GlyphTransform3D} from '../live-text/controls.ts';import {checkedPose} from '../live-text/controls.ts';
import {prepareTextExtrusion,type PreparedExtrusion,type ExtrusionUnit,type UnitExtrusionOptions} from './text.ts';import type {ExtrusionSurface} from './geometry.ts';
export type ExtrusionMaterial=Partial<Omit<CharacterMaterial,'id'|'texture'|'extensions'|'unsupportedMaps'>>;
export interface ExtrusionDrawOptions {
 format?:'rgba16float'|'rgba32float';originPixels?:readonly[number,number];camera?:CharacterRenderOptions['camera'];
 material?:ExtrusionMaterial|((unit:ExtrusionUnit,surface:ExtrusionSurface,context:FrameContext)=>ExtrusionMaterial);
 transform?:GlyphTransform3D;modelForUnit?:(unit:ExtrusionUnit,context:FrameContext)=>{matrix:readonly number[];opacity:number};
 lighting?:Pick<CharacterRenderOptions,'ambient'|'lights'>;shading?:'standard'|'unlit';maxBytes?:number;maxRayTests?:number;signal?:AbortSignal;
}
const identity=()=>new Matrix4().elements as Matrix;
const blank:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/extrusion/empty',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'};
/** Borrow one admitted Native owner. Geometry generation stays in the owned CPU adapter;
 * A4 executes deformation, supplied normals, BRDF and complete Alpha layers on GPU. */
export function createNativeExtrusionRenderer(init:Pick<NativeStageInit,'gpu'|'width'|'height'>){
 const gpu=init.gpu,caps=gpu.capabilities();if(caps.backend!=='native-wgpu'||caps.hardwareVerified!==true)throw new EngineError('E_PA_EXTRUSION_DEVICE','Admitted Native hardware owner required');let closed=false,pending:Promise<GpuPixelImage>|undefined,closing:Promise<void>|undefined,last:unknown;
 async function record(input:PreparedExtrusion,c:FrameContext,options:ExtrusionDrawOptions){
  const {signal,material,transform,modelForUnit,...raw}=options,o=structuredClone(raw),scale=input.unitsPerPixel,origin=o.originPixels??[init.width/2,init.height/2],format=o.format??'rgba32float';signal?.throwIfAborted();
  if(!['rgba16float','rgba32float'].includes(format)||!Number.isFinite(scale)||scale<=0||origin.length!==2||origin.some(v=>!Number.isFinite(v))||transform&&modelForUnit)throw new EngineError('E_PA_EXTRUSION','Explicit professional format, common physical scale/origin and one transform convention required');
  const stageToWorld=new Matrix4().makeScale(scale,-scale,scale);stageToWorld.setPosition(-origin[0]*scale,origin[1]*scale,0);const inverse=stageToWorld.clone().invert(),models:Matrix[]=[],opacities:number[]=[];
  for(const unit of input.units){signal?.throwIfAborted();const at=new Matrix4().makeTranslation((unit.anchor[0]-origin[0])*scale,(origin[1]-unit.anchor[1])*scale,0);let pose=modelForUnit?checkedPose(modelForUnit(unit,c)):transform&&unit.glyph?checkedPose(transform(unit.glyph,c)):{matrix:identity(),opacity:1};const matrix=modelForUnit?new Matrix4().fromArray(pose.matrix).multiply(at):stageToWorld.clone().multiply(new Matrix4().fromArray(pose.matrix)).multiply(inverse).multiply(at);models.push(matrix.elements as Matrix);opacities.push(pose.opacity);}
  if(!input.parts.length){last={units:input.units.length,triangles:0,backend:'native-wgpu'};return gpu.run(await gpu.compile(blank),[],{output:{width:init.width,height:init.height,format,color:linear709,alpha:'premultiplied'},signal});}
  const asset:CharacterDocument={format:'frameweave.character-asset/1',id:'pro-animation.extrusion',nodes:input.units.map(u=>({id:u.id,name:u.id,parent:null,matrix:identity()})),primitives:[],clips:[],images:[],diagnostics:[]};
  for(const [i,part]of input.parts.entries()){
   const unit=input.units[part.unitIndex];if(!unit)throw new EngineError('E_PA_EXTRUSION','Mesh part references an unknown prepared unit');const value=structuredClone(typeof material==='function'?material(unit,part.surface,c):material??{}),opacity=(value.color?.[3]??1)*opacities[part.unitIndex],colour=value.color??[.25,.4,.8,1],alphaMode=opacity<1?'blend':value.alphaMode??'opaque';
   asset.primitives.push({id:'part.'+i,node:unit.id,mesh:part.mesh,normals:part.normals,material:{id:'material.'+i,color:[colour[0],colour[1],colour[2],opacity],emissive:value.emissive??[0,0,0],roughness:value.roughness??.5,metalness:value.metalness??0,alphaMode,alphaCutoff:value.alphaCutoff??.5,doubleSided:value.doubleSided??true,unlit:value.unlit??false},morphs:[],weights:[]});
  }
  const document=characterDocument(asset),hash=await characterFingerprint(document),renderer=await createCharacterRenderer(gpu,document,{width:init.width,height:init.height,camera:o.camera??{projection:'orthographic',viewHeight:init.height*scale,position:[0,0,8],target:[0,0,0],near:.01,far:100},format,shading:o.shading,maxBytes:o.maxBytes,maxRayTests:o.maxRayTests,ambient:o.lighting?.ambient,lights:o.lighting?.lights});
  try{const pose:CharacterSample={assetId:document.id,assetHash:hash,frame:c.frame,time:c.time,fps:c.fps,localMatrices:models,globalMatrices:models,morphWeights:document.primitives.map(()=>[]),diagnostics:[]},image=await renderer.render(pose,{}, {signal});if(closed||signal?.aborted){await gpu.release(image);signal?.throwIfAborted();throw new EngineError('E_PA_TEXT_CLOSED','Extrusion renderer closed before publication');}last={...renderer.stats(),units:input.units.length,geometry:input.geometry,diagnostics:input.diagnostics};return image;}finally{await renderer.dispose();}
 }
 return Object.freeze({draw(input:PreparedExtrusion,context:FrameContext,options:ExtrusionDrawOptions={}){if(closed)return Promise.reject(new EngineError('E_PA_TEXT_CLOSED','Extrusion renderer disposed'));if(pending)return Promise.reject(new EngineError('E_PA_TEXT_BUSY','Await current extrusion recording'));const task=record(input,context,options);pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;},stats:()=>last,dispose(){closed=true;return closing??=(async()=>{await pending?.catch(()=>{});last=undefined;})();}});
}
export interface NativeExtrudedTextOptions extends Omit<ShapeRunOptions,'fontSize'> {text:Signal<string>;fontSize:Signal<number>;geometry:UnitExtrusionOptions;draw?:ExtrusionDrawOptions}
export function createNativeExtrudedText(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:BidiFont}&Parameters<typeof prepareTextExtrusion>[2]){
 const renderer=createNativeExtrusionRenderer(init);let busy=false,closed=false,last:PreparedExtrusion|undefined;
 return {async draw(options:NativeExtrudedTextOptions,context:FrameContext){if(closed||busy)throw new EngineError(closed?'E_PA_TEXT_CLOSED':'E_PA_TEXT_BUSY','Await open extrusion text');const {text,fontSize,geometry,draw,...shape}=options;busy=true;try{const run=await services.font.shapeRun(evaluate(text,context),{...structuredClone(shape),fontSize:evaluate(fontSize,context)}),prepared=await prepareTextExtrusion(run,geometry,services,context),image=await renderer.draw(prepared,context,draw);last=prepared;return image;}finally{busy=false;}},layout:()=>last,stats:()=>renderer.stats(),async dispose(){if(busy)throw new EngineError('E_PA_TEXT_BUSY','Await extrusion preparation before disposal');closed=true;await renderer.dispose();last=undefined;}};
}
