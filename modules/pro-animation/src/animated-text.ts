import type {ProfessionalSurface} from '../../../src/media/surface.ts';
import {EngineError} from '../../../src/core/errors.ts';import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';import type {PathData} from '../../graphics-contracts/types.ts';import type * as Graphics from '../../graphics-contracts/index.ts';
import {rasterizeCoverage,type RasterOptions} from './coverage.ts';import {createPathTools} from './path-tools.ts';import {segmentText,type TextUnit} from './selectors.ts';
export interface AnimatedTextUnit extends TextUnit {x:number;y:number;advance:number;count:number}
export interface TextTransform {dx?:Signal<number>;dy?:Signal<number>;rotation?:Signal<number>;scaleX?:Signal<number>;scaleY?:Signal<number>;opacity?:Signal<number>}
export interface AnimatedTextOptions extends RasterOptions {font:string;x:number;y:number;unit?:'grapheme'|'word';locale?:string;letterSpacing?:number;path?:PathData;pathOffset?:Signal<number>;overflow?:'error'|'clip';transform?:(unit:AnimatedTextUnit,context:FrameContext)=>TextTransform}
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
function scalar(s:Signal<number>,ctx:FrameContext,min:number,max:number){const v=evaluate(s,ctx);if(!Number.isFinite(v)||v<min||v>max)fail('E_PA_TEXT_TRANSFORM',`Transform value must be finite [${min},${max}]`);return v;}
export function createAnimatedTextTools(graphics:Pick<typeof Graphics,'validatePathData'>){
 const paths=createPathTools(graphics);
 return {rasterizeAnimatedText(text:string,options:AnimatedTextOptions,context:FrameContext):ProfessionalSurface{
  // Honest independently drawable-unit subset. Full shaped glyph runs need a separate verified font/layout adapter.
  if(/[\r\n\p{Bidi_Control}]/u.test(text)||[...text].some(ch=>!/[\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Common}\p{Script=Inherited}]/u.test(ch)))fail('E_PA_TEXT_SHAPING','Animated units support single-line LTR Latin/CJK/Common clusters only; joining/RTL shaping is not implemented');
  if(typeof options.font!=='string'||!CSS.supports('font',options.font)||![options.x,options.y,options.letterSpacing??0].every(Number.isFinite))fail('E_PA_PARAMETER','Valid explicit CSS font and finite coordinates/spacing required');
  if(options.overflow!==undefined&&!['error','clip'].includes(options.overflow)||options.pathOffset!==undefined&&!options.path)fail('E_PA_TEXT_PATH','Invalid path overflow/offset');
  const units=segmentText(text,options),count=units.filter(u=>u.kind==='unit').length,sampler=options.path?paths.createPathSampler(options.path):undefined;
  if(options.path&&(options.path.coordinates.width!==options.width||options.path.coordinates.height!==options.height||sampler!.metrics.contours.length!==1||sampler!.metrics.length<=0))fail('E_PA_TEXT_PATH','Text baseline needs one nondegenerate contour in matching physical px coordinates');
  const offset=scalar(options.pathOffset??0,context,-1e6,1e6);
  return rasterizeCoverage(options,c=>{c.font=options.font;c.fontKerning='none';c.textAlign='left';c.textBaseline='alphabetic';c.direction='ltr';let advance=0;
   for(const u of units){const width=c.measureText(u.text).width,pos=advance;advance+=width+(options.letterSpacing??0);if(u.kind==='separator')continue;
    let x=options.x+pos,y=options.y,angle=0;if(sampler){const at=offset+pos+width/2;if(at<0||at>sampler.metrics.length){if(options.overflow==='clip')continue;fail('E_PA_TEXT_PATH','Unit center exceeds path; explicitly request clip');}const p=sampler.sample(at/sampler.metrics.length);x=options.x+p.x;y=options.y+p.y;angle=p.angleRadians;}
    const transform=options.transform?.({...u,x,y,advance:width,count},context)??{};if(typeof transform!=='object'||'then' in transform||Object.keys(transform).some(k=>!['dx','dy','rotation','scaleX','scaleY','opacity'].includes(k)))fail('E_PA_TEXT_TRANSFORM','Return synchronous numeric/Signal unit transforms');
    const dx=scalar(transform.dx??0,context,-1e6,1e6),dy=scalar(transform.dy??0,context,-1e6,1e6),rotation=scalar(transform.rotation??0,context,-1e6,1e6),sx=scalar(transform.scaleX??1,context,-100,100),sy=scalar(transform.scaleY??1,context,-100,100),opacity=scalar(transform.opacity??1,context,0,1);
    c.save();c.translate(x+dx,y+dy);c.rotate(angle+rotation);c.scale(sx,sy);c.globalAlpha=opacity;c.fillText(u.text,sampler?-width/2:0,0);c.restore();
   }
  });
 }};
}
