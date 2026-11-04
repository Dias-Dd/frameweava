import {createHash} from 'node:crypto';
import {layoutParagraph,type ParagraphOptions} from '../pro-animation/src/text-layout/layout.ts';
import {createParagraphIndex,paragraphMetrics} from '../pro-animation/src/text-layout/queries.ts';
import {prepareParagraphMeshes,type PreparedParagraphMeshes} from '../pro-animation/src/text-layout/native.ts';
import type {PrepareGlyphOptions} from '../pro-animation/src/text-animation/geometry.ts';
import type {Rational} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {preparedText,textError,type TextAsset} from './text.ts';
import {subtitleFrames,subtitleError,type SubtitleCue} from './subtitles.ts';
import {at,clip,editInteger} from './authoring.ts';
import type {EditTrack,PlacedClip} from './types.ts';
/** Borrow already admitted original font/itemization/path services. Caller retains ownership. */
export interface CaptionPreparationServices extends Pick<ParagraphOptions,'font'|'itemizer'|'fontForRun'|'scriptForRun'> {pathOperations:PrepareGlyphOptions['pathOperations']}
/** Structural seam for the existing official Node typography provider. */
export interface CaptionParagraphProvider {prepareParagraph(text:string,options:Omit<ParagraphOptions,'font'|'itemizer'|'fontForRun'|'scriptForRun'>&{font:string}):Promise<PreparedParagraphMeshes>}
export interface CaptionStyle {
 fontSize?:number;lineHeight?:number;margin?:number;padding?:number;align?:ParagraphOptions['align'];
 placement?:'top'|'center'|'bottom';ink?:TextAsset['ink'];plate?:false|NonNullable<TextAsset['plate']>['color'];
 language?:string;baseDirection?:ParagraphOptions['baseDirection'];
}
export interface TextPreparationOptions {width:number;height:number;services:CaptionPreparationServices|CaptionParagraphProvider;font?:string;style?:CaptionStyle;signal?:AbortSignal}
/** Real Node preparation, once per unique text/style. No rasterization or font algorithm here. */
export async function prepareTitle(text:string,options:TextPreparationOptions):Promise<TextAsset>{
 if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Text preparation cancelled');
 const {width,height,services,signal}=options,style=options.style??{};editInteger(width,'text viewport width',1);editInteger(height,'text viewport height',1);
 for(const k of Object.keys(style))if(!['fontSize','lineHeight','margin','padding','align','placement','ink','plate','language','baseDirection'].includes(k))textError('Unknown caption style option '+k);
 const fontSize=style.fontSize??Math.max(18,height*.055),lineHeight=style.lineHeight??fontSize*1.25,margin=style.margin??Math.min(width,height)*.07,padding=style.padding??fontSize*.35;
 if([fontSize,lineHeight,margin,padding].some(n=>!Number.isFinite(n))||fontSize<=0||lineHeight<=0||margin<0||padding<0||2*margin>=width||2*margin>=height)textError('Text size, line height, margin and padding must fit the viewport');
 if(style.placement!==undefined&&!['top','center','bottom'].includes(style.placement))textError('Unknown text placement');
 const common={width:width-2*margin,fontSize,lineHeight,x:margin,baseline:fontSize,align:style.align??'center',baseDirection:style.baseDirection??'auto',language:style.language??'und',missingGlyph:'error' as const,wrap:'word' as const,overflow:'error' as const,signal};
 let prepared:PreparedParagraphMeshes;
 if('prepareParagraph'in services){if(!options.font)textError('Select a configured typography font id');prepared=await services.prepareParagraph(text,{...common,font:options.font});}
 else {const paragraph=await layoutParagraph(text,{...common,font:services.font,itemizer:services.itemizer,fontForRun:services.fontForRun,scriptForRun:services.scriptForRun});prepared=await prepareParagraphMeshes(createParagraphIndex(paragraph),{pathOperations:services.pathOperations,tolerance:.1,signal});}
 const index=prepared.index,metrics=paragraphMetrics(index),box=metrics.inkBounds??metrics.advanceBounds;
 if(prepared.layout.coordinates.width!==width||prepared.layout.coordinates.height!==height)textError('Font preparation services must use this viewport');
 if(!box)textError('Caption has no visible layout');if(box.height+2*padding>height-2*margin)textError('Caption does not fit; reduce font size or split the cue');
 const placement=style.placement??'bottom',offsetY=placement==='top'?margin+padding-box.top:placement==='center'?(height-box.height)/2-box.top:height-margin-padding-box.bottom;
 const id='text-'+createHash('sha256').update(JSON.stringify([prepared,style,offsetY])).digest('hex').slice(0,24);
 if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Text preparation cancelled');
 return preparedText(id,prepared,{ink:style.ink,offsetY,...style.plate===false?{}:{plate:{box:[box.left-padding,box.top+offsetY-padding,box.width+2*padding,box.height+2*padding],color:style.plate??[0,0,0,.68]}}});
}
export async function prepareSubtitles(cues:readonly SubtitleCue[],options:TextPreparationOptions&{fps:number|Rational;overlap?:'error'|'layer';empty?:'error'|'skip'}){
 if(options.overlap!==undefined&&!['error','layer'].includes(options.overlap)||options.empty!==undefined&&!['error','skip'].includes(options.empty))subtitleError('Invalid subtitle overlap/empty policy');
 const tracks:PlacedClip[][]=[],ends:number[]=[],cache=new Map<string,TextAsset>(),skipped:string[]=[];
 for(const cue of [...cues].sort((a,b)=>a.startMs-b.startMs)){
  if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Subtitle preparation cancelled');const {start,end}=subtitleFrames(cue,options.fps);if(start===end){if(options.empty!=='skip')subtitleError('Cue has no sampled video frame; retime it or explicitly skip it',{cue:cue.id});skipped.push(cue.id);continue;}
  let lane=ends.findIndex(n=>n<=start);if(lane<0){if(tracks.length&&options.overlap!=='layer')subtitleError('Overlapping cues need an explicit overlap:"layer" policy',{cue:cue.id});lane=tracks.length;tracks.push([]);ends.push(0);}
  let asset=cache.get(cue.text);if(!asset){asset=await prepareTitle(cue.text,options);cache.set(cue.text,asset);}tracks[lane].push(at(start,clip(asset,{duration:end-start})));ends[lane]=end;
 }
 return {tracks:tracks as readonly EditTrack[],diagnostics:{skipped,uniqueTextLayouts:cache.size,cues:cues.length}};
}
