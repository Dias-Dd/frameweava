// SPDX-License-Identifier: Apache-2.0 AND MIT
// Original HarfRust/Skrifa observations -> existing sealed font import -> Native textured mesh.
import {Matrix4} from 'three';
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import {linear709} from '../../../../src/media/surface.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {Coordinates2D,TextLayoutData} from '../../../graphics-contracts/types.ts';
import {fontGlyphResource,type NativeStageInit,type NativeFontGlyphResource} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createGlyphAnimator} from '../glyph-animation.ts';
import type {ShapedRun} from '../font-shaping.ts';
import type {InspectedFont} from '../typography/fonts.ts';
import {sourceText,frozen} from '../text-layout/common.ts';
import {checkedInk,type GlyphRgba,type GlyphInk} from '../text-styling/ink.ts';
import {checkedPose,orthographicTextCamera,type GlyphTransform3D,type TextCamera} from '../live-text/controls.ts';
import {readDirectedFontRun,readEmbeddedFontGlyph,type EmbeddedFontFormat,type DirectedFontRunOptions} from './kernel.ts';

export type EmbeddedGlyphSource =
 | {format:Exclude<EmbeddedFontFormat,'svg'>;strikeIndex:number;foreground?:readonly [number,number,number,number]}
 | {format:'svg';viewBox:readonly [number,number,number,number];/** Output raster pixels per font em. Omission uses fontSize. */pixelsPerEm?:number;foreground?:readonly [number,number,number,number]};
export interface EmbeddedRunOptions extends Omit<DirectedFontRunOptions,'direction'> {
 direction?:'ltr'|'rtl';fontSize:number;x?:number;baseline?:number;coordinates:Coordinates2D;source:EmbeddedGlyphSource;
}
export interface EmbeddedGlyphPlacement {
 readonly glyphIndex:number;readonly glyphId:number;readonly source:Omit<NativeFontGlyphResource,'output'>;
 /** Stage pixels, top-left x/y, width/height. No implicit vertical image flip. */
 readonly rect:readonly [number,number,number,number];readonly rasterSize:readonly [number,number];
 readonly originalMetrics:Readonly<Record<string,unknown>>;
}
export interface EmbeddedFontRun extends ShapedRun {readonly embeddedGlyphs:readonly EmbeddedGlyphPlacement[]}
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_FONT_EMBEDDED',message,{details});};
const finite=(n:number)=>{if(!Number.isFinite(n))fail('Finite physical coordinates required');return n;};
function abort(signal?:AbortSignal){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Embedded font draw cancelled before publication');}
/** Skrifa 0.49 BitmapGlyph bearings: outer font units, inner pixels, and explicit placement origin.
 * Original shaped advance is authoritative; bitmap advance never replaces HarfRust positioning. */
export function embeddedBitmapRect(metadata:Extract<Awaited<ReturnType<typeof readEmbeddedFontGlyph>>,{kind:'bitmap'}>['metadata'],
 glyph:{x:number;y:number},fontSize:number,unitsPerEm:number):readonly [number,number,number,number]{
 const m=metadata;if(!(fontSize>0&&unitsPerEm>0&&m.ppemX>0&&m.ppemY>0&&m.width>0&&m.height>0)||!['top-left','bottom-left'].includes(m.origin))fail('Positive original bitmap size/ppem and explicit origin required');
 const sx=fontSize/m.ppemX,sy=fontSize/m.ppemY,w=m.width*sx,h=m.height*sy;
 const rect=[glyph.x+m.bearingX*fontSize/unitsPerEm+m.innerBearingX*sx,glyph.y-m.bearingY*fontSize/unitsPerEm-m.innerBearingY*sy-(m.origin==='bottom-left'?h:0),w,h];rect.forEach(finite);return Object.freeze(rect) as unknown as readonly [number,number,number,number];
}
function validateEmbeddedSource(source:EmbeddedGlyphSource,fontSize:number){
 if(!source||!['sbix','cbdt','ebdt','svg'].includes(source.format)||Object.keys(source).some(k=>!['format','strikeIndex','viewBox','pixelsPerEm','foreground'].includes(k)))fail('Explicit embedded table/strike or SVG crop required');
 if(source.format==='svg'){
  if('strikeIndex'in source||!Array.isArray(source.viewBox)||source.viewBox.length!==4||source.viewBox.some(n=>!Number.isFinite(n))||source.viewBox[2]<=0||source.viewBox[3]<=0||!Number.isFinite(source.pixelsPerEm??fontSize)||(source.pixelsPerEm??fontSize)<=0)fail('SVG requires finite positive font-unit crop and raster pixelsPerEm');
 }else if(!Number.isSafeInteger(source.strikeIndex)||source.strikeIndex<0||'viewBox'in source||'pixelsPerEm'in source)fail('Bitmap requires an exact original strike index');
 // Mask/currentColor codecs need a neutral source so the separate linear HDR ink
 // remains authoritative. Intrinsic bitmap/explicit SVG colors are unchanged.
 const foreground=checkedInk(source.foreground??[1,1,1,1]);if(foreground.some(v=>v<0||v>1))fail('Intrinsic currentColor is explicitly SDR/sRGB; use separate linear HDR GPU tint');
 return foreground;
}
/** Prepare only metadata/geometry. Encoded payload observations are never used as GPU admission receipts. */
export async function prepareEmbeddedFontRun(font:InspectedFont,text:string,options:EmbeddedRunOptions):Promise<EmbeddedFontRun>{
 sourceText(text);const {coordinates:input,source:inputSource,fontSize,x=0,baseline=fontSize,direction='ltr',signal,...shape}=options,coordinates=structuredClone(input),source=structuredClone(inputSource);
 if(!['ltr','rtl'].includes(direction)||!(fontSize>0)||coordinates.unit!=='px')fail('Horizontal itemized run, positive pixel fontSize and existing pixel coordinates required');[fontSize,x,baseline].forEach(finite);abort(signal);
 validateEmbeddedSource(source,fontSize);
 const directed=await readDirectedFontRun(font,text,{...shape,direction,signal}),scale=fontSize/font.unitsPerEm;
 const starts=[...new Set(directed.glyphs.map(g=>g.clusterStart))].sort((a,b)=>a-b),ends=new Map(starts.map((v,i)=>[v,starts[i+1]??text.length]));let px=x,py=baseline;
 const glyphs:TextLayoutData['glyphs']=directed.glyphs.map((g,i)=>{if(g.glyphId===0)fail('Original font returned .notdef; no invented fallback glyph',{cluster:g.clusterStart});const value={id:'glyph.'+i,lineId:'line',styleId:'style',glyphId:g.glyphId,cluster:{start:g.clusterStart,end:ends.get(g.clusterStart)!},x:px+g.offsetX*scale,y:py-g.offsetY*scale,advanceX:g.advanceX*scale,advanceY:-g.advanceY*scale};px+=value.advanceX;py+=value.advanceY;return value;});
 const layout=graphics.validateTextLayoutData({schema:'frameweave.text-layout',version:1,id:'embedded.run',coordinates,text,layout:{engine:'harfrust',version:'0.15.0',clusterUnit:'utf16'},fonts:[{id:'font',source:directed.fontInstance.source,faceIndex:directed.fontInstance.faceIndex}],styles:[{id:'style',fontId:'font',fontSize,fill:{space:'srgb',alpha:'straight',rgba:[1,1,1,1]}}],paragraphs:[{id:'paragraph',start:0,end:text.length,direction}],lines:[{id:'line',paragraphId:'paragraph',start:0,end:text.length,baseline}],glyphs});return prepareEmbeddedFontLayout(font,{layout,glyphPaths:[],diagnostics:[],fontInstance:directed.fontInstance},source,{signal});
}
/** Attach original bitmap/SVG observations to an already shaped horizontal OR vertical canonical run. */
export async function prepareEmbeddedFontLayout(font:InspectedFont,run:ShapedRun,input:EmbeddedGlyphSource,query:{signal?:AbortSignal}={}):Promise<EmbeddedFontRun>{
 const layout=graphics.validateTextLayoutData(run.layout),text=layout.text,signal=query.signal,source=structuredClone(input),foreground=validateEmbeddedSource(source,layout.styles[0]?.fontSize??1),placements:EmbeddedGlyphPlacement[]=[],seen=new Map<number,Awaited<ReturnType<typeof readEmbeddedFontGlyph>>>();
 if(layout.fonts.length!==1||JSON.stringify(run.fontInstance.source)!==JSON.stringify(font.instance.source)||run.fontInstance.faceIndex!==font.instance.faceIndex)fail('Original font Resource/face and shaped run must agree');
 for(const [glyphIndex,glyph]of layout.glyphs.entries()){
  abort(signal);const fontSize=layout.styles.find(s=>s.id===glyph.styleId)!.fontSize,scale=fontSize/font.unitsPerEm;if(/^[\s\p{Default_Ignorable_Code_Point}]*$/u.test(text.slice(glyph.cluster.start,glyph.cluster.end)))continue;
  let observed=seen.get(glyph.glyphId);if(!observed){observed=await readEmbeddedFontGlyph(font,{glyphId:glyph.glyphId,format:source.format,...source.format==='svg'?{}:{strikeIndex:source.strikeIndex}},{signal});seen.set(glyph.glyphId,observed);}
  const identity={version:1 as const,id:font.instance.source.resourceId,decode:'font-glyph-v1' as const,faceIndex:font.instance.faceIndex,glyphId:glyph.glyphId,format:source.format,...foreground?{foreground}:{}};
  if(source.format==='svg'&&observed.kind==='svg'){
   const [vx,vy,vw,vh]=source.viewBox,resolution=(source.pixelsPerEm??fontSize)/font.unitsPerEm,rasterSize=[Math.ceil(vw*resolution),Math.ceil(vh*resolution)] as const;if(rasterSize.some(n=>!Number.isSafeInteger(n)||n<1))fail('SVG raster size exceeds process addressing');
   placements.push({glyphIndex,glyphId:glyph.glyphId,source:{...identity,svg:{viewBox:source.viewBox}},rect:[glyph.x+vx*scale,glyph.y+vy*scale,vw*scale,vh*scale],rasterSize,originalMetrics:{document:observed.document,sourceColor:'sRGB SDR',sourcePrecision:'static SVG codec raster'}});
  }else if(observed.kind==='bitmap'&&source.format!=='svg')placements.push({glyphIndex,glyphId:glyph.glyphId,source:{...identity,strikeIndex:source.strikeIndex},rect:embeddedBitmapRect(observed.metadata,glyph,fontSize,font.unitsPerEm),rasterSize:[observed.metadata.width,observed.metadata.height],originalMetrics:{...observed.metadata}});
  else fail('Original embedded glyph format differs from the explicit source selector');
 }
 abort(signal);return frozen({...run,layout,embeddedGlyphs:placements});
}
export interface NativeEmbeddedTextOptions extends Omit<EmbeddedRunOptions,'coordinates'|'fontSize'|'x'|'baseline'> {
 text:Signal<string>;fontSize:Signal<number>;x?:Signal<number>;baseline?:Signal<number>;format?:'rgba16float'|'rgba32float';
 /** Scene-linear multiplicative Straight ink over intrinsic source artwork. */
 ink?:GlyphRgba;inkForUnit?:GlyphInk;transform?:GlyphTransform3D;camera?:TextCamera;
}
const blank:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/embedded-glyphs/empty',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'};
/** Ordinary call inside one existing Stage. Output is caller-owned/frame-local; no image cache or owner is created. */
export interface NativeEmbeddedRunDrawOptions {format?:'rgba16float'|'rgba32float';ink?:GlyphRgba;inkForUnit?:GlyphInk;transform?:GlyphTransform3D;camera?:TextCamera;signal?:AbortSignal}
export function createNativeEmbeddedText(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:InspectedFont}){
 const g=init.gpu,cap=g.capabilities();if(cap.backend!=='native-wgpu'||!cap.hardwareVerified)throw new EngineError('E_PA_TEXT_DEVICE','Embedded font text requires the admitted Native GPU owner');
 const fx=createGpuPixelEffects(g),coordinates={spaceId:'stage',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:init.width,height:init.height};let closed=false,pending:Promise<GpuPixelImage>|undefined,last:EmbeddedFontRun|undefined,closing:Promise<void>|undefined;
 const active=(signal?:AbortSignal)=>{if(closed)throw new EngineError('E_PA_TEXT_CLOSED','Embedded text disposed');abort(signal);};
 async function record(run:EmbeddedFontRun,options:NativeEmbeddedRunDrawOptions,context:FrameContext){
  active(options.signal);if(!context||![context.frame,context.time,context.globalFrame,context.globalTime].every(Number.isFinite))fail('Existing explicit finite FrameContext required');
  const {format='rgba32float',ink:inputInk,inkForUnit,transform,camera:inputCamera}=options,ink=checkedInk(inputInk??[1,1,1,1]),camera=structuredClone(inputCamera??orthographicTextCamera(init.width,init.height)),layout=graphics.validateTextLayoutData(run.layout);
  if(!['rgba16float','rgba32float'].includes(format)||camera.width!==init.width||camera.height!==init.height||camera.matrix.length!==16||camera.matrix.some(n=>!Number.isFinite(n))||layout.coordinates.width!==init.width||layout.coordinates.height!==init.height||JSON.stringify(run.fontInstance.source)!==JSON.stringify(services.font.instance.source)||run.fontInstance.faceIndex!==services.font.instance.faceIndex)fail('Stage-sized original font layout/camera and professional output required');
  const units=createGlyphAnimator(graphics,run).units().map(u=>({...u,direction:layout.paragraphs.find(p=>p.id===layout.lines.find(l=>l.id===u.lineId)!.paragraphId)!.direction})),byGlyph=new Map(units.flatMap(u=>u.glyphIndices.map(i=>[i,u] as const))),seen=new Set<number>();
  for(const placement of run.embeddedGlyphs){const glyph=layout.glyphs[placement.glyphIndex];if(!glyph||seen.has(placement.glyphIndex)||placement.glyphId!==glyph.glyphId||placement.source.id!==services.font.instance.source.resourceId||placement.source.faceIndex!==services.font.instance.faceIndex||placement.rect.length!==4||placement.rect.some(v=>!Number.isFinite(v))||placement.rect[2]<=0||placement.rect[3]<=0||placement.rasterSize.length!==2||placement.rasterSize.some(v=>!Number.isSafeInteger(v)||v<1))fail('Original glyph identity, unique finite rectangle and positive raster size required');seen.add(placement.glyphIndex);}
  const image=await withGpuResources(g,async arena=>{
   const output={width:init.width,height:init.height,color:linear709,alpha:'premultiplied' as const,format};let image=arena.image(await g.run(await g.compile(blank),[],{output:{...output,format:run.embeddedGlyphs.length?'rgba32float':format},signal:options.signal}));
   for(const [i,placement]of run.embeddedGlyphs.entries()){
    active(options.signal);const unit=byGlyph.get(placement.glyphIndex)!,pose=checkedPose(transform?.(unit,context)??{matrix:new Matrix4().elements,opacity:1}),tint=checkedInk(inkForUnit?.(unit,context,ink)??ink),color=[tint[0],tint[1],tint[2],tint[3]*pose.opacity] as const,glyph=run.layout.glyphs[placement.glyphIndex],turn=glyph.orientation==='sideways-right'?1:glyph.orientation==='sideways-left'?-1:0,orientation=new Matrix4().makeTranslation(glyph.x,glyph.y,0).multiply(new Matrix4().makeRotationZ(turn*Math.PI/2)).multiply(new Matrix4().makeTranslation(-glyph.x,-glyph.y,0)),matrix=new Matrix4().fromArray(camera.matrix).multiply(new Matrix4().fromArray(pose.matrix)).multiply(orientation).elements;
    const texture=arena.image(await g.importResource(fontGlyphResource({...placement.source,output:{width:placement.rasterSize[0],height:placement.rasterSize[1],format:'rgba32float',color:linear709,alpha:'premultiplied'}}),{signal:options.signal}));active(options.signal);
    const [x,y,w,h]=placement.rect,positions=arena.buffer(await g.createField({type:'f32',dimensions:[6,1,1],components:3,semantic:'position',space:'stage',units:'px'},Float32Array.from([x,y,0,x+w,y,0,x,y+h,0,x+w,y,0,x+w,y+h,0,x,y+h,0]))),uvs=arena.buffer(await g.createField({type:'f32',dimensions:[6,1,1],components:2,semantic:'generic',channels:['u','v']},Float32Array.from([0,0,1,0,0,1,1,0,1,1,0,1])));
    const drawn=arena.image(await g.drawMesh({positions,count:6,matrix,color,texture:{version:1,image:texture,uvs,filter:'linear',addressU:'transparent',addressV:'transparent'},raster:{version:1,mode:'depth-peel'},output:{...output,format:'rgba32float'}})),next=arena.image(await fx.over(drawn,image,{format:i===run.embeddedGlyphs.length-1?format:'rgba32float',signal:options.signal}));
    await g.release(arena.keep(drawn));await g.release(arena.keep(image));await g.release(arena.keep(texture));await g.releaseBuffer(arena.keep(positions));await g.releaseBuffer(arena.keep(uvs));image=next;
   }
   active(options.signal);return arena.keep(image);
  });if(closed||options.signal?.aborted){await g.release(image);active(options.signal);}last=run;return image;
 }
 function schedule(signal:AbortSignal|undefined,work:()=>Promise<GpuPixelImage>){try{active(signal);if(pending)throw new EngineError('E_PA_TEXT_BUSY','Await the current embedded text recording');}catch(e){return Promise.reject(e);}const p=work();pending=p;void p.then(()=>{pending=undefined;},()=>{pending=undefined;});return p;}
 return Object.freeze({draw(options:NativeEmbeddedTextOptions,context:FrameContext){const {text,fontSize,x,baseline,format,ink,inkForUnit,transform,camera,...shape}=options;return schedule(options.signal,async()=>{const run=await prepareEmbeddedFontRun(services.font,evaluate(text,context),{...shape,coordinates,fontSize:evaluate(fontSize,context),x:evaluate(x??0,context),baseline:evaluate(baseline??fontSize,context)});return record(run,{format,ink,inkForUnit,transform,camera,signal:options.signal},context);});},drawRun(run:EmbeddedFontRun,options:NativeEmbeddedRunDrawOptions,context:FrameContext){return schedule(options.signal,()=>record(frozen(structuredClone(run)),options,context));},layout:()=>last,dispose(){closed=true;return closing??=(async()=>{await pending?.catch(()=>{});last=undefined;})();}});
}
