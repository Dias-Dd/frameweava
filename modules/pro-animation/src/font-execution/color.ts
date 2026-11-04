// SPDX-License-Identifier: Apache-2.0
// Original COLRv0 layer geometry + existing Native glyph coverage/over. No CPU text pixels.
import {renderNativeColrRun} from './colr/native.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {NativeStageInit} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {linear709} from '../../../../src/media/surface.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
import type {ShapedRun,ShapeRunOptions} from '../font-shaping.ts';
import type {InspectedFont} from '../typography/fonts.ts';
import type {createPathOperations} from '../path-operations.ts';
import {createGlyphAnimator} from '../glyph-animation.ts';
import {prepareLayoutGlyphMeshes} from '../text-animation/geometry.ts';
import {createNativeGlyphRenderer} from '../text-animation/native.ts';
import {checkedInk,type GlyphRgba} from '../text-styling/ink.ts';
import {readColorGlyphPaint,readColorPalette,readFontGlyphPath} from './kernel.ts';
const fail=(message:string):never=>{throw new EngineError('E_PA_FONT_COLOR',message);};
/** Only palette control values are converted on CPU. Pixel raster/Alpha composition stays GPU-only. */
export function cpalLinearInk(palette:Awaited<ReturnType<typeof readColorPalette>>,index:number,alpha:number,foreground:GlyphRgba=[1,1,1,1]):GlyphRgba{
 if(!Number.isSafeInteger(index)||index<0||index>65535||!Number.isFinite(alpha)||alpha<0||alpha>1)fail('Declared palette index and bounded COLR alpha required');const source=index===65535?checkedInk(foreground):palette.colors[index];if(!source)fail('COLR palette index outside actual CPAL entries');if(index!==65535&&(source.length!==4||source.some(v=>!Number.isFinite(v)||v<0||v>1)))fail('CPAL source must contain four encoded [0,1] components');const eotf=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;return checkedInk([index===65535?source[0]:eotf(source[0]),index===65535?source[1]:eotf(source[1]),index===65535?source[2]:eotf(source[2]),source[3]*alpha]);
}
export interface ColorGlyphLayer {glyphIndex:number;path:PathData;ink:GlyphRgba;origin:'outline'|'colr-v0'}
/** Preserve original glyph order and COLRv0 layer order. COLRv1 never silently becomes monochrome/v0. */
export async function prepareColorGlyphLayers(font:InspectedFont,run:ShapedRun,options:{paletteIndex?:number;foreground?:GlyphRgba;signal?:AbortSignal}={}):Promise<readonly ColorGlyphLayer[]>{
 const layout=graphics.validateTextLayoutData(run.layout);if(layout.fonts.length!==1||JSON.stringify(layout.fonts[0].source)!==JSON.stringify(run.fontInstance.source)||layout.fonts[0].faceIndex!==run.fontInstance.faceIndex)fail('Single canonical font instance must match color-run provenance');const seen=new Set<number>();for(const v of run.colorGlyphs??[]){if(!Number.isSafeInteger(v.glyphIndex)||v.glyphIndex<0||v.glyphIndex>=layout.glyphs.length||seen.has(v.glyphIndex))fail('Unique original color glyph indices required');seen.add(v.glyphIndex);}
 const {signal}=options,foreground=checkedInk(options.foreground??[1,1,1,1]),paletteIndex=options.paletteIndex??0,colorGlyphs=new Map(run.colorGlyphs?.map(v=>[v.glyphIndex,v.format])??[]);if([...colorGlyphs.values()].some(v=>v!=='colr-v0'))fail('COLRv1 paint execution requires the full gradient/composite adapter; no raster or outline fallback');if(JSON.stringify(run.fontInstance.source)!==JSON.stringify(font.instance.source)||run.fontInstance.faceIndex!==font.instance.faceIndex)fail('Color run belongs to a different font Resource/face');
 let palette:Awaited<ReturnType<typeof readColorPalette>>|undefined;const paths=new Map(run.glyphPaths.map(v=>[v.glyphIndex,v.path])),layers:ColorGlyphLayer[]=[];
 for(const [glyphIndex,glyph]of run.layout.glyphs.entries()){
  signal?.throwIfAborted();if(!colorGlyphs.has(glyphIndex)){const path=paths.get(glyphIndex);if(path)layers.push({glyphIndex,path,ink:foreground,origin:'outline'});continue;}
  const paint=await readColorGlyphPaint(font,glyph.glyphId,{signal,variations:run.fontInstance.variations});if(paint.format!=='colr-v0')fail('Declared color paint does not match the original font table');palette??=await readColorPalette(font,paletteIndex,{signal});let clip:number|undefined;for(const event of paint.events){if(event.op==='push-clip-glyph'){if(clip!==undefined)fail('Unexpected nested COLRv0 clip');clip=event.glyphId;}else if(event.op==='pop-clip'){if(clip===undefined)fail('Unmatched COLRv0 clip');clip=undefined;}else if(event.op==='solid'){if(clip===undefined)fail('Unbounded COLRv0 fill');const path=await readFontGlyphPath(font,clip!,{coordinates:run.layout.coordinates,fontSize:run.layout.styles.find(s=>s.id===glyph.styleId)!.fontSize,x:glyph.x,y:glyph.y,id:'glyph.'+glyphIndex+'.layer.'+layers.length,variations:run.fontInstance.variations,signal});if(!path.commands.length)continue;layers.push({glyphIndex,path,ink:cpalLinearInk(palette!,event.paletteIndex,event.alpha,foreground),origin:'colr-v0'});}else fail('Unexpected COLRv0 paint callback; not reduced to an approximate solid');}if(clip!==undefined)fail('Unclosed COLRv0 clip');
 }
 signal?.throwIfAborted();return Object.freeze(layers);
}
const blank:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/color-glyphs/empty',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'};
export interface NativeColorTextOptions extends Omit<ShapeRunOptions,'paint'> {text:Signal<string>;paletteIndex?:number;foreground?:GlyphRgba;format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
/** Uses the existing Native owner, canonical glyph mesh/coverage and compensated over. Caller owns output. */
export function createNativeColorText(init:Pick<NativeStageInit,'gpu'|'width'|'height'>,services:{font:InspectedFont;pathOperations:Pick<Awaited<ReturnType<typeof createPathOperations>>,'booleanPathsStream'>}){
 const g=init.gpu,fx=createGpuPixelEffects(g);let closed=false,busy=false,last:ShapedRun|undefined;return Object.freeze({
  async draw(options:NativeColorTextOptions,context:FrameContext):Promise<GpuPixelImage>{if(closed)throw new EngineError('E_PA_TEXT_CLOSED','Color text disposed');if(busy)throw new EngineError('E_PA_TEXT_BUSY','Await current color text');const {text,paletteIndex,foreground,format='rgba32float',signal,...shape}=options;if(!['rgba16float','rgba32float'].includes(format))fail('Professional F16/F32 output required');const ink=checkedInk(foreground??[1,1,1,1]),input=structuredClone(shape),value=evaluate(text,context);if(typeof value!=='string')fail('Text Signal must yield Unicode source');busy=true;
   try{signal?.throwIfAborted();const run=await services.font.shapeRun(value,{...input,paint:'color'});if(run.colorGlyphs?.some(g=>g.format==='colr-v1')){const image=await renderNativeColrRun(init,services,run,context,{paletteIndex,foreground:ink,format,signal});last=run;return image;}const layers=await prepareColorGlyphLayers(services.font,run,{paletteIndex,foreground:ink,signal}),animator=createGlyphAnimator(graphics,run),units=animator.units().map(u=>({...u,direction:run.layout.paragraphs[0].direction}));
    const image=await withGpuResources(g,async arena=>{let image=arena.image(await g.run(await g.compile(blank),[],{output:{width:init.width,height:init.height,format:layers.length?'rgba32float':format,color:linear709,alpha:'premultiplied'},signal}));for(const [index,layer]of layers.entries()){signal?.throwIfAborted();const mesh=await prepareLayoutGlyphMeshes({layout:run.layout,units,glyphPaths:[{glyphIndex:layer.glyphIndex,path:layer.path}],diagnostics:run.diagnostics},{pathOperations:services.pathOperations,tolerance:.02,signal}),renderer=createNativeGlyphRenderer(init);let drawn:GpuPixelImage;try{const handle=await renderer.prepare(mesh);drawn=arena.image(await renderer.at(context).draw(handle,{ink:layer.ink,format:'rgba32float',signal}));}finally{await renderer.dispose();}const next=arena.image(await fx.over(drawn,image,{format:index===layers.length-1?format:'rgba32float',signal}));await g.release(arena.keep(drawn));await g.release(arena.keep(image));image=next;}return arena.keep(image);});last=run;return image;
   }finally{busy=false;}
  },layout:()=>last,dispose(){if(busy)throw new EngineError('E_PA_TEXT_BUSY','Await current color text recording');closed=true;last=undefined;},
 });
}
