// SPDX-License-Identifier: Apache-2.0 AND MIT
// Execute original ColorPainter callbacks using the admitted owner, existing outline/Clipper/mesh and A3 matte.
import type {FrameContext} from '../../../../../src/core/types.ts';
import {EngineError} from '../../../../../src/core/errors.ts';
import {linear709} from '../../../../../src/media/surface.ts';
import * as graphics from '../../../../graphics-contracts/index.ts';
import type {PathData,PathPoint} from '../../../../graphics-contracts/types.ts';
import type {NativeStageInit} from '../../../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../../gpu-effects/resource-arena.ts';
import {matteKernel} from '../../../../native-effects/raster/kernels.ts';
import type {ShapedRun} from '../../font-shaping.ts';
import type {InspectedFont} from '../../typography/fonts.ts';
import type {createPathOperations} from '../../path-operations.ts';
import {createGlyphAnimator} from '../../glyph-animation.ts';
import {prepareLayoutGlyphMeshes} from '../../text-animation/geometry.ts';
import {createNativeGlyphRenderer} from '../../text-animation/native.ts';
import {checkedInk,type GlyphRgba,type GlyphInk} from '../../text-styling/ink.ts';
import {affinity,type GlyphTransform} from '../../text-animation/common.ts';
import {assertColrPaintProfile,readColorGlyphPaint,readColorPalette,readFontGlyphPath} from '../kernel.ts';
import {cpalLinearInk} from '../color.ts';
import {splitTextCoefficient} from '../../live-text/gaussian-weight.ts';
import {compose,invert,resolveColrColorLine,type ColrAffine} from './gradient.ts';
import {colrGradientKernel} from './gradient-kernel.ts';
import {colrCompositeKernel} from './composite-kernel.ts';
const empty:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/colr/empty',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'};
const fail=(message:string):never=>{throw new EngineError('E_PA_COLR_PAINT',message);};
const bounded=(mode:number,s:boolean,d:boolean)=>mode===0?true:mode===5||mode===6?s||d:mode===1||mode===7?s:mode===2||mode===8?d:s&&d;
/** This is a font-local execution adapter, not a new stored graph/schema or general image effects registry. */
export async function renderNativeColrRun(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:InspectedFont;pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>},run:ShapedRun,context:FrameContext,options:{paletteIndex?:number;foreground:GlyphRgba;format:'rgba16float'|'rgba32float';signal?:AbortSignal;transform?:GlyphTransform;inkForUnit?:GlyphInk}):Promise<GpuPixelImage>{
 const g=init.gpu,check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','COLR draw cancelled before publication');};check();
 const layout=graphics.validateTextLayoutData(run.layout),font=services.font;
 if(layout.fonts.length!==1||JSON.stringify(run.fontInstance.source)!==JSON.stringify(font.instance.source)||run.fontInstance.faceIndex!==font.instance.faceIndex||layout.coordinates.width!==init.width||layout.coordinates.height!==init.height)fail('Original run must match the borrowed font Resource/face and Stage dimensions');
 const maskLayout={...layout,glyphs:layout.glyphs.map(g=>({...g,...g.orientation?{orientation:'upright' as const}:{}}))},geometry=graphics.createTextLayoutGeometry(layout);
 await assertColrPaintProfile(font,{signal:options.signal});
 const units=createGlyphAnimator(graphics,run).units().map(u=>({...u,direction:layout.paragraphs.find(p=>p.id===layout.lines.find(l=>l.id===u.lineId)!.paragraphId)!.direction})),byGlyph=new Map(units.flatMap(u=>u.glyphIndices.map(i=>[i,u]as const))),colors=new Map(run.colorGlyphs?.map(v=>[v.glyphIndex,v.format])??[]),palette=await readColorPalette(font,options.paletteIndex??0,{signal:options.signal}),output={width:init.width,height:init.height,format:'rgba32float' as const,color:linear709,alpha:'premultiplied' as const};
 return withGpuResources(g,async arena=>{
  const clear=async()=>arena.image(await g.run(await g.compile(empty),[],{output,signal:options.signal}));
  const drop=async(v:GpuPixelImage)=>g.release(arena.keep(v));
  async function composite(s:GpuPixelImage,d:GpuPixelImage,mode:number,format:'rgba16float'|'rgba32float'='rgba32float'){
   if(!Number.isSafeInteger(mode)||mode<0||mode>27)fail('Original COLR CompositeMode0..27 required');const words=new Uint32Array(128),f=new Float32Array(words.buffer);words[0]=mode;f.set(splitTextCoefficient(2**-20),10);for(const [i,l]of [.3,.59,.11].entries())f.set(splitTextCoefficient(l),88+2*i);
   return arena.image(await g.run(await g.compile(colrCompositeKernel),[s,d],{parameters:words,output:{...output,format},signal:options.signal}));
  }
  async function mask(paths:readonly PathData[],glyphIndex:number){
   if(!paths.length)return clear();const renderer=createNativeGlyphRenderer(init);try{const mesh=await prepareLayoutGlyphMeshes({layout:maskLayout,units,glyphPaths:paths.map(path=>({glyphIndex,path})),diagnostics:[]},{pathOperations:services.pathOperations,tolerance:.02,signal:options.signal}),handle=await renderer.prepare(mesh);return arena.image(await renderer.at(context).draw(handle,{ink:[1,1,1,1],format:'rgba32float',signal:options.signal}));}finally{await renderer.dispose();}
  }
  let result=await clear();
  for(const [glyphIndex,glyph]of layout.glyphs.entries()){
   check();const unit=byGlyph.get(glyphIndex)!,pose=options.transform?.(unit,context)??{matrix:[1,0,0,1,0,0],opacity:1},poseMatrix=affinity(pose.matrix),foreground=checkedInk(options.inkForUnit?.(unit,context,options.foreground)??options.foreground);if(!Number.isFinite(pose.opacity)||pose.opacity<0||pose.opacity>1)fail('Physical unit opacity must be in [0,1]');
   const size=layout.styles.find(s=>s.id===glyph.styleId)!.fontSize,scale=size/font.unitsPerEm,unrotated:ColrAffine=[scale,0,0,-scale,glyph.x,glyph.y],turn=glyph.orientation==='sideways-right'?1:glyph.orientation==='sideways-left'?-1:0,base:ColrAffine=compose(poseMatrix,turn?compose([0,turn,-turn,0,glyph.x+turn*glyph.y,glyph.y-turn*glyph.x],unrotated):unrotated);let matrix=base,target=await clear(),targetBounded=true;
   const transforms:ColrAffine[]=[],layers:{image:GpuPixelImage;mode:number;bounded:boolean}[]=[],clips:{paths:readonly PathData[]|undefined;image:GpuPixelImage|undefined}[]=[];let clipPaths:readonly PathData[]|undefined,clipImage:GpuPixelImage|undefined;
   const point=(p:PathPoint):PathPoint=>({...p,x:matrix[0]*p.x-matrix[2]*p.y+matrix[4],y:matrix[1]*p.x-matrix[3]*p.y+matrix[5]});
   const transformed=(p:PathData):PathData=>graphics.validatePathData({...p,commands:p.commands.map(c=>c.op==='Z'?c:c.op==='C'?{...c,control1:point(c.control1),control2:point(c.control2),point:point(c.point)}:c.op==='Q'?{...c,control:point(c.control),point:point(c.point)}:{...c,point:point(c.point)})});
   async function pushClip(shape:PathData){
    clips.push({paths:clipPaths,image:clipImage});if(clipPaths===undefined)clipPaths=shape.commands.length?[shape]:[];
    else{const intersection:PathData[]=[];if(shape.commands.length)for(const old of clipPaths)for await(const face of services.pathOperations.booleanPathsStream([old,shape],{operation:'intersection',tolerance:.02,signal:options.signal}))intersection.push(face);clipPaths=intersection;}
    clipImage=await mask(clipPaths,glyphIndex);check();
   }
   if(!colors.has(glyphIndex)){
    const path=run.glyphPaths.find(p=>p.glyphIndex===glyphIndex)?.path;if(path){const original=geometry.orientGlyphPath(glyphIndex,path),move=(p:PathPoint)=>({...p,x:poseMatrix[0]*p.x+poseMatrix[2]*p.y+poseMatrix[4],y:poseMatrix[1]*p.x+poseMatrix[3]*p.y+poseMatrix[5]}),posed={...original,commands:original.commands.map(c=>c.op==='Z'?c:c.op==='C'?{...c,point:move(c.point),control1:move(c.control1),control2:move(c.control2)}:c.op==='Q'?{...c,point:move(c.point),control:move(c.control)}:{...c,point:move(c.point)})};const coverage=await mask([posed],glyphIndex),line=resolveColrColorLine([{at:0,paletteIndex:65535,alpha:1}],'pad',(index,a)=>cpalLinearInk(palette,index,a,foreground)),data=arena.buffer(await g.createBuffer({type:'f32',length:10},Float32Array.from(line.stops.flatMap(s=>[s.at,...s.color].flatMap(splitTextCoefficient))))),words=new Uint32Array(128);words[2]=1;const fill=arena.image(await g.run(await g.compile(colrGradientKernel),[],{parameters:words,data:[data],output,signal:options.signal})),params=new Float32Array(8);params[4]=1;const painted=arena.image(await g.run(await g.compile(matteKernel),[fill,coverage],{parameters:params,output,signal:options.signal}));await drop(target);target=painted;await drop(fill);await drop(coverage);await g.releaseBuffer(arena.keep(data));}
   }else{
    const paint=await readColorGlyphPaint(font,glyph.glyphId,{signal:options.signal,variations:run.fontInstance.variations});if(paint.format!==colors.get(glyphIndex))fail('Original declared color glyph format changed');
    for(const event of paint.events){check();if(event.op==='push-transform'){transforms.push(matrix);matrix=compose(matrix,event.matrix as ColrAffine);}
     else if(event.op==='pop-transform'){if(!transforms.length)fail('Unmatched original transform');matrix=transforms.pop()!;}
     else if(event.op==='push-clip-glyph'){const path=await readFontGlyphPath(font,event.glyphId,{coordinates:layout.coordinates,fontSize:font.unitsPerEm,x:0,y:0,variations:run.fontInstance.variations,signal:options.signal});await pushClip(transformed(path));}
     else if(event.op==='push-clip-box'){const [x0,y0,x1,y1]=event.bounds;const p=(x:number,y:number,id:string)=>({x,y:-y,id});await pushClip(transformed({schema:'frameweave.path',version:1,id:'colr.clip.box',coordinates:layout.coordinates,fillRule:'nonzero',commands:[{op:'M',point:p(x0,y0,'p0')},{op:'L',point:p(x1,y0,'p1')},{op:'L',point:p(x1,y1,'p2')},{op:'L',point:p(x0,y1,'p3')},{op:'Z'}]}));}
     else if(event.op==='pop-clip'){if(!clips.length)fail('Unmatched original clip');if(clipImage)await drop(clipImage);const previous=clips.pop()!;clipPaths=previous.paths;clipImage=previous.image;}
     else if(event.op==='push-layer'){layers.push({image:target,mode:event.mode,bounded:targetBounded});target=await clear();targetBounded=true;}
     else if(event.op==='pop-layer'){if(!layers.length)fail('Unmatched original layer');const previous=layers.pop()!,next=await composite(target,previous.image,previous.mode);targetBounded=bounded(previous.mode,targetBounded,previous.bounded);await drop(target);await drop(previous.image);target=next;}
     else{
      const line=resolveColrColorLine(event.op==='solid'?[{at:0,paletteIndex:event.paletteIndex,alpha:event.alpha}]:event.stops,event.op==='solid'?'pad':event.extend,(index,a)=>cpalLinearInk(palette,index,a,foreground)),words=new Uint32Array(128),f=new Float32Array(words.buffer),inverse=invert(matrix);words[0]=event.op==='solid'?0:event.op==='linear'?1:event.op==='radial'?2:3;words[1]=['pad','repeat','reflect'].indexOf(line.extend);words[2]=line.stops.length;words[3]=inverse?0:1;
      const inv=inverse??base,geometry=event.op==='solid'?[]:event.geometry,args=[inv[0],inv[2],inv[4],inv[1],inv[3],inv[5],...geometry];for(const [i,value]of args.entries())f.set(splitTextCoefficient(value),8+2*i);
      const dataValues=Float32Array.from(line.stops.flatMap(s=>[s.at,...s.color].flatMap(splitTextCoefficient))),data=arena.buffer(await g.createBuffer({type:'f32',length:Math.max(10,dataValues.length)},dataValues.length?dataValues:new Float32Array(10)));let fill=arena.image(await g.run(await g.compile(colrGradientKernel),[],{parameters:words,data:[data],output,signal:options.signal}));
      if(clipImage){const params=new Float32Array(8);params[4]=1;const clipped=arena.image(await g.run(await g.compile(matteKernel),[fill,clipImage],{parameters:params,output,signal:options.signal}));await drop(fill);fill=clipped;}
      const next=await composite(fill,target,3);targetBounded=targetBounded&&(clipPaths!==undefined||!inverse||line.stops.length===0);await drop(fill);await drop(target);await g.releaseBuffer(arena.keep(data));target=next;
     }
    }
    if(transforms.length||clips.length||layers.length)fail('Unclosed original paint callback');if(!targetBounded)fail('Unbounded color glyph definition: supply a bounded original COLR paint/clip, not a Stage-sized fake glyph');
   }
   if(pose.opacity!==1){const words=new Uint32Array(128);words[2]=1;const values=[0,pose.opacity,pose.opacity,pose.opacity,pose.opacity].flatMap(splitTextCoefficient),data=arena.buffer(await g.createBuffer({type:'f32',length:10},Float32Array.from(values))),coverage=arena.image(await g.run(await g.compile(colrGradientKernel),[],{parameters:words,data:[data],output,signal:options.signal})),params=new Float32Array(8);params[4]=1;const faded=arena.image(await g.run(await g.compile(matteKernel),[target,coverage],{parameters:params,output,signal:options.signal}));await drop(target);await drop(coverage);await g.releaseBuffer(arena.keep(data));target=faded;}
   const next=await composite(target,result,3,glyphIndex===layout.glyphs.length-1?options.format:'rgba32float');await drop(target);await drop(result);result=next;
  }
  if(!layout.glyphs.length&&options.format==='rgba16float'){const copy=await composite(result,result,1,options.format);await drop(result);result=copy;}
  check();return arena.keep(result);
 });
}
