import {createPathTools} from './path-tools.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {PluginInit,PluginDefinition,PluginFrame,PluginInstance} from '../../../src/plugins/sdk.ts';
import type {PathData,PathCommand,PathPoint} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import {wiggleReference} from './noise.ts';
export type {PathData};
export const compatibility={id:'pro-animation',version:'0.7.3',engines:['web'] as const};
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
function number(v:number,name:string,min=-1e9,max=1e9){if(!Number.isFinite(v)||v<min||v>max)fail('E_PA_PARAMETER',`${name} must be finite in [${min},${max}]`);return v;}
function scalar(signal:Signal<number>,context:FrameContext,name:string,min=0,max=1){return number(evaluate(signal,context),name,min,max);}
/** Absolute-time prefix reveal using existing Signal and Intl grapheme/word segmentation; no glyph shaping engine. */
export function revealText(text:string,options:{progress:Signal<number>;unit?:'grapheme'|'word';locale?:string},context:FrameContext):string{
 if(typeof text!=='string'||text.length>16384)fail('E_PA_LIMIT','Text must be a string up to 16384 UTF-16 units');
 const unit=options.unit??'grapheme';if(!['grapheme','word'].includes(unit))fail('E_PA_PARAMETER','Unknown reveal unit');
 const progress=scalar(options.progress,context,'progress');if(progress===0)return '';if(progress===1)return text;
 const parts=[...new Intl.Segmenter(options.locale??'und',{granularity:unit==='word'?'word':'grapheme'}).segment(text)];
 const selected=unit==='word'?parts.filter(s=>s.isWordLike):parts;
 const count=Math.floor(progress*selected.length);return count?text.slice(0,selected[count-1].index+selected[count-1].segment.length):'';
}
/** EffectCraft-derived seeded offsets in amplitude units, from Stage-local seconds; pure random access, no integrated state. */
export function wiggle(options:{frequency:Signal<number>;amplitude:Signal<number>;seed?:number;dimensions?:number;octaves?:number;amplitudeMultiplier?:number},context:FrameContext):number[]{
 const f=scalar(options.frequency,context,'frequency',0,1000),a=scalar(options.amplitude,context,'amplitude',0,1e6),dims=options.dimensions??2,oct=options.octaves??1,mult=options.amplitudeMultiplier??.5,seed=options.seed??context.seed;
 if(!Number.isSafeInteger(seed)||!Number.isInteger(dims)||dims<1||dims>4||!Number.isInteger(oct)||oct<1||oct>8)fail('E_PA_PARAMETER','Expected safe seed, 1..4 dimensions, 1..8 integer octaves');
 number(mult,'amplitudeMultiplier',0,1);number(context.time,'time',-1e6,1e6);if(Math.abs(f*2**(oct-1)*context.time)>2**40)fail('E_PA_PARAMETER','Wiggle lattice exceeds exact supported domain');
 return wiggleReference(BigInt(seed),dims,f,a,oct,mult,context.time);
}
/** Canonical Graphics Contracts v1 tools; same-topology Morph and bounded native SVG trim sampling. */
export function createVectorTools(graphics:Pick<typeof Graphics,'validatePathData'|'pathCommands'>){
 // A separately bundled Graphics package can own a different Error class; retain its existing structured code.
 const validate=(input:unknown):PathData=>{try{return graphics.validatePathData(input);}catch(error){if(error instanceof EngineError)throw error;const e=error as {code?:string;message?:string;details?:unknown};throw new EngineError(e.code&&/^E_GRAPHICS_[A-Z0-9_]+$/.test(e.code)?e.code:'E_PA_GRAPHICS',e.message??'Graphics validation failed',{details:e.details});}};
 return {
  morphPath(from:PathData,to:PathData,progress:Signal<number>,context:FrameContext):PathData{
   const a=validate(from),b=validate(to),t=scalar(progress,context,'progress');
   if(JSON.stringify(a.coordinates)!==JSON.stringify(b.coordinates)||a.fillRule!==b.fillRule)fail('E_PA_SPACE','Morph requires identical coordinate spaces and fill rule');
   if(a.commands.length!==b.commands.length||a.commands.some((c,i)=>c.op!==b.commands[i].op))fail('E_PA_TOPOLOGY','Morph v0.1 requires matching command topology');
   const point=(p:PathPoint,q:PathPoint)=>{if(p.id!==q.id)fail('E_PA_TOPOLOGY','Point IDs must correspond');return {...p,x:t===0?p.x:t===1?q.x:p.x+(q.x-p.x)*t,y:t===0?p.y:t===1?q.y:p.y+(q.y-p.y)*t};};
   const commands=a.commands.map((c,i):PathCommand=>{const d=b.commands[i];if(c.op==='Z')return c;const out={...c} as any;for(const key of ['point','control','control1','control2'])if(key in c)out[key]=point((c as any)[key],(d as any)[key]);return out;});
   return validate({...a,commands});
  },
  /** Native SVG arc-length sampling; single contour, polyline approximation in declared path units. */
  trimPaths(input:PathData,options:{start?:Signal<number>;end:Signal<number>;step?:number},context:FrameContext):PathData{
   const p=validate(input);if(p.coordinates.unit!=='px')fail('E_PA_SPACE','Trim v0.1 requires explicit pixel coordinates');const start=scalar(options.start??0,context,'start'),end=scalar(options.end,context,'end'),step=number(options.step??1,'step',.05,64);
   if(start>end)fail('E_PA_PARAMETER','Trim requires start <= end; wrapping is not implemented');
   if(p.commands.filter(c=>c.op==='M').length!==1)fail('E_PA_TOPOLOGY','Trim v0.1 supports one contour only');
   return createPathTools(graphics).trimCurves(p,{mode:'curves',start,end,tolerance:step},context);

  },
 };
}
export {glow,blur,displacement,applyFloatKernel} from './professional.ts';
export type {FloatFormat,FloatEffectOptions,GlowOptions,BlurOptions,DisplacementOptions,FloatKernel,FloatKernelImage} from './professional.ts';
export {surfaceFromCoverage} from './coverage.ts';
export type {CoverageOptions,RasterOptions} from './coverage.ts';

export {createPathTools} from './path-tools.ts';
export type {PathMeasureOptions,CurveTrimOptions,MatchPathOptions,PathSample} from './path-tools.ts';

export {rangeSelector,combineSelectors,selectorOrder,randomSelector,stagger,segmentText} from './selectors.ts';
export type {RangeShape,RangeSelectorOptions,TextUnit} from './selectors.ts';
export {createAnimatedTextTools} from './animated-text.ts';
export type {AnimatedTextUnit,AnimatedTextOptions,TextTransform} from './animated-text.ts';

export {noiseField,createDeformationTools,createDisplacementMap,displaceWithMap} from './procedural.ts';
export type {VectorField,DisplacementMapOptions,MapWarpOptions} from './procedural.ts';
export {emitParticles,rasterizeParticles} from './particles.ts';
export type {Particle,ParticleEmitterOptions} from './particles.ts';

export {createShapeModifiers} from './shape-modifiers.ts';
export type {ShapeWork,RepeaterOptions,RepeatedPath,PuckerBloatOptions,RoundCornersOptions} from './shape-modifiers.ts';

export * from './advanced.ts';
