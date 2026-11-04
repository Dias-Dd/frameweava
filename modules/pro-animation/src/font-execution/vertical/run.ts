// SPDX-License-Identifier: Apache-2.0
// Original HarfRust TTB/BTT or whole horizontal-run shaping -> existing vertical geometry contract.
import {EngineError} from '../../../../../src/core/errors.ts';
import type {TextLayoutData,TextGlyphOrientation,TextWritingMode} from '../../../../graphics-contracts/types.ts';
import * as graphics from '../../../../graphics-contracts/index.ts';
import type {InspectedFont} from '../../typography/fonts.ts';
import type {ShapeRunOptions,ShapedRun} from '../../font-shaping.ts';
import {sourceText,finite} from '../../text-layout/common.ts';
import {readDirectedFontRun,readOptionalFontGlyphPath,readColorGlyphPaint} from '../kernel.ts';
import {readFontMetrics} from '../../typography/fonts.ts';
import {verticalTsume} from './inline.ts';
export interface VerticalRunOptions extends Omit<ShapeRunOptions,'x'|'baseline'|'paint'> {
 /** Embedded shaping leaves glyph IDs/metrics to the original font, without demanding outlines. */
 paint?:'outline'|'color'|'embedded';
 /** Fixed column baseline x and initial inline y, in Stage pixels. */
 baseline?:number;y?:number;
 writingMode?:Exclude<TextWritingMode,'horizontal-tb'>;
 orientation?:TextGlyphOrientation;
 /** Actual original vertical direction; sideways uses original ltr/rtl and its signed quarter-turn. */
 inlineDirection?:'ttb'|'btt';signal?:AbortSignal;
 /** A horizontal, unscaled shaping group centered in one vertical em cell. */
 tateChuYoko?:boolean;
 /** 0..1 symmetric removal of measured inline side bearings; glyph ink is never scaled. */
 tsume?:number;
}
export interface VerticalRun extends ShapedRun {readonly advance:readonly [number,number]}
const fail=(message:string,details?:unknown):never=>{throw new EngineError('E_PA_TEXT_VERTICAL',message,{details});};
/** Positioned paths remain UNROTATED. Core orientGlyphPath consumes orientation exactly once. */
export async function shapeVerticalRun(font:InspectedFont,text:string,p:VerticalRunOptions):Promise<VerticalRun>{
 sourceText(text);const options=structuredClone({...p,signal:undefined}),signal=p.signal;
 if(/[\r\n\u000b\u000c\u0085\u2028\u2029\t\p{Bidi_Control}]/u.test(text))fail('One clean itemized run required; use layoutVerticalText for paragraphs/bidi controls');
 const {fontSize:size,baseline:sizeX=size,y=0,writingMode='vertical-rl',orientation='upright',inlineDirection='ttb',direction='ltr',missingGlyph='error',paint='outline',tateChuYoko=false,tsume=0,...shaping}=options;
 [size,sizeX,y].forEach(v=>finite(v,'vertical run px'));
 if(!(size>0)||!['vertical-rl','vertical-lr'].includes(writingMode)||!['upright','sideways-right','sideways-left'].includes(orientation)||!['ttb','btt'].includes(inlineDirection)||!['ltr','rtl'].includes(direction)||!['error','notdef'].includes(missingGlyph)||!['outline','color','embedded'].includes(paint))fail('Known writing mode/orientation/direction/paint and positive font size required');
 if(orientation!=='upright'&&inlineDirection!=='ttb')fail('Sideways inline sign follows its declared quarter-turn, not a second direction override');
 if(typeof tateChuYoko!=='boolean'||tateChuYoko&&(orientation!=='upright'||inlineDirection!=='ttb')||!Number.isFinite(tsume)||tsume<0||tsume>1)fail('Tate-chu-yoko requires upright TTB placement and Tsume must be 0..1');
 const check=()=>signal?.throwIfAborted();check();
 const raw=await readDirectedFontRun(font,text,{...shaping,direction:tateChuYoko?direction:orientation==='upright'?inlineDirection:direction,signal});check();
 const metrics=tateChuYoko?await readFontMetrics(font,{signal}):undefined;check();
 const seed=await font.shapeRun('',{...shaping,script:options.script,fontSize:size,baseline:0,direction,missingGlyph});check();
 const starts=[...new Set(raw.glyphs.map(g=>g.clusterStart))].sort((a,b)=>a-b),ends=new Map(starts.map((v,i)=>[v,starts[i+1]??text.length])),scale=size/font.unitsPerEm,turn=orientation==='sideways-right'?1:orientation==='sideways-left'?-1:0;
 const horizontalAdvance=tateChuYoko?raw.glyphs.reduce((n,g)=>n+g.advanceX,0)*scale:0;let px=0,py=0;
 const glyphs:TextLayoutData['glyphs']=raw.glyphs.map((g,i)=>{
  const gx=(px+g.offsetX)*scale,gy=-(py+g.offsetY)*scale,dx=g.advanceX*scale,dy=-g.advanceY*scale;
  const value={id:'glyph.'+i,lineId:'line',styleId:'style',glyphId:g.glyphId,cluster:{start:g.clusterStart,end:ends.get(g.clusterStart)!},x:sizeX+(tateChuYoko?gx-horizontalAdvance/2:turn?-turn*gy:gx),y:y+(tateChuYoko?gy+(size+(metrics!.ascent+metrics!.descent)*scale)/2:turn?turn*gx:gy),advanceX:tateChuYoko?0:turn?-turn*dy:dx,advanceY:tateChuYoko?(i===raw.glyphs.length-1?size:0):turn?turn*dx:dy,orientation};px+=g.advanceX;py+=g.advanceY;return value;
 });
 const layout=graphics.validateTextLayoutData({...seed.layout,id:'shaped.vertical-run',text,paragraphs:[{id:'paragraph',start:0,end:text.length,direction,writingMode}],lines:[{id:'line',paragraphId:'paragraph',start:0,end:text.length,baseline:sizeX,baselineAxis:'x'}],glyphs}),diagnostics:ShapedRun['diagnostics']=[];
 const missing=glyphs.filter(g=>g.glyphId===0);if(missing.length){if(missingGlyph==='error')throw new EngineError('E_PA_FONT_MISSING_GLYPH','Font returned .notdef; no fallback selected',{details:{clusters:missing.map(g=>g.cluster)}});diagnostics.push({code:'W_PA_FONT_MISSING_GLYPH',severity:'warning',message:'Original .notdef retained',details:{clusters:missing.map(g=>g.cluster)}});}
 const glyphPaths:ShapedRun['glyphPaths']=[],colorGlyphs:NonNullable<ShapedRun['colorGlyphs']>=[];let invisibleSpace:number|null|undefined;
 for(const [glyphIndex,g]of glyphs.entries()){
  check();if(paint==='embedded')continue;if(paint==='color'){const color=await readColorGlyphPaint(font,g.glyphId,{variations:raw.fontInstance.variations,signal});if(color.format!=='none'){colorGlyphs.push({glyphIndex,format:color.format});continue;}}
  const path=await readOptionalFontGlyphPath(font,g.glyphId,{coordinates:layout.coordinates,fontSize:size,x:g.x,y:g.y,id:g.id,variations:raw.fontInstance.variations,signal});
  if(path?.commands.length)glyphPaths.push({glyphIndex,path});
  else {
   const cluster=text.slice(g.cluster.start,g.cluster.end);let invisible=false;
   if(!/^[\s\p{Default_Ignorable_Code_Point}]*$/u.test(cluster)&&g.advanceX===0&&g.advanceY===0&&/\p{Default_Ignorable_Code_Point}/u.test(cluster)){
    // Same original-space differential as the existing horizontal shaper: a format placeholder
    // may share the visible letter's cluster. Do not exempt arbitrary zero-ink visible glyphs.
    if(invisibleSpace===undefined){const probe=await readDirectedFontRun(font,' ',{...shaping,direction:raw.direction,signal}),s=probe.glyphs[0];invisibleSpace=null;if(probe.glyphs.length===1&&s.glyphId>0&&await readOptionalFontGlyphPath(font,s.glyphId,{coordinates:layout.coordinates,fontSize:size,variations:raw.fontInstance.variations,signal})===null)invisibleSpace=s.glyphId;}
    invisible=invisibleSpace!==null&&invisibleSpace===g.glyphId;
   }
   if(!/^[\s\p{Default_Ignorable_Code_Point}]*$/u.test(cluster)&&!invisible)throw new EngineError('E_PA_FONT_OUTLINE','Original vertical glyph lacks an outline; use the explicit color/embedded consumer',{details:{glyphId:g.glyphId,cluster:g.cluster}});
  }
 }
 const measured=[...glyphPaths],measuredIndices=new Set(measured.map(p=>p.glyphIndex));if(tsume>0&&paint!=='outline')for(const [glyphIndex,g]of glyphs.entries())if(!measuredIndices.has(glyphIndex)){const path=await readOptionalFontGlyphPath(font,g.glyphId,{coordinates:layout.coordinates,fontSize:size,x:g.x,y:g.y,id:g.id,variations:raw.fontInstance.variations,signal});if(path?.commands.length)measured.push({glyphIndex,path});}
 check();return verticalTsume({layout,glyphPaths,diagnostics,fontInstance:raw.fontInstance,...colorGlyphs.length?{colorGlyphs}:{},advance:tateChuYoko?[0,glyphs.length?size:0]:turn?[turn*py*scale,turn*px*scale]:[px*scale,-py*scale]},tsume,measured,tateChuYoko);
}
