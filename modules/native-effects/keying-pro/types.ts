import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {KeyingOutput,Color,Point} from '../keying/types.ts';
export type Output=KeyingOutput;
export interface Screen extends Output {color?:Color;alphaBias?:Color;gain?:Signal<number>;balance?:Signal<number>;preblurSigma?:Signal<number>}
export interface Clip extends Output {black?:Signal<number>;white?:Signal<number>;rollback?:Signal<number>;gamma?:Signal<number>}
export interface Tone extends Output {midpoint?:Signal<number>;shadows?:Signal<number>;midtones?:Signal<number>;highlights?:Signal<number>}
export type Component='alpha'|'inverted-alpha'|'luma'|'inverted-luma';
export interface Garbage extends Output {insideComponent?:Component;outsideComponent?:Component;sourceAlpha?:'ignore'|'inside'|'normal'}
export interface Despot extends Output {blackRadius?:Signal<number>;whiteRadius?:Signal<number>}
export interface Unmix extends Output {screen?:Color;strength?:Signal<number>;sourceAlpha?:'normal'|'ignore'}
export type Replacement='none'|'source'|'hard-color'|'soft-color';
export interface Replace extends Output {method?:Replacement;color?:Color;sourceAlpha?:'normal'|'ignore'}
export interface Bias extends Output {bias?:Color}
export interface SpillBias extends Bias {screen?:'red'|'green'|'blue';amount?:Signal<number>;preserveLuma?:boolean}
export interface Grade extends Output {hue?:Signal<number>;lift?:Color;gamma?:Color;gain?:Color;saturation?:Signal<number>;contrast?:Signal<number>;pivot?:Signal<number>;exposure?:Signal<number>}
export interface Status extends Output {epsilon?:Signal<number>}
export interface Hair extends Output {epsilon?:Signal<number>}
export interface Band extends Output {inside?:Signal<number>;outside?:Signal<number>;threshold?:Signal<number>}
export interface Temporal extends Output {amount?:Signal<number>;colourTolerance?:Signal<number>;confidenceThreshold?:Signal<number>}
export interface VectorBlur extends Output {open?:Signal<number>;close?:Signal<number>;samples?:number}
export interface RotoStroke {points:readonly Point[];radius:Signal<number>;label:'foreground'|'background'}
/** Recipe-local signed labels: -1 unknown, 0 background, 1 foreground. */
export interface TrimapField {readonly kind:'native-trimap';readonly version:1;readonly width:number;readonly height:number;readonly buffer:GpuDataBuffer}
export interface MatteSolve {readonly kind:'native-matte-solve';readonly version:1;readonly image:GpuPixelImage;readonly diagnostics:GpuDataBuffer}
export interface Walker extends Output {iterations?:number;beta?:Signal<number>;epsilon?:Signal<number>;priorWeight?:Signal<number>;prior?:Signal<number>;tolerance?:Signal<number>}
export type Address='color'|'repeat'|'reflect'|'wrap';
export interface Crop extends Output {left?:Signal<number>;right?:Signal<number>;top?:Signal<number>;bottom?:Signal<number>;x?:Address;y?:Address;color?:Color;alpha?:Signal<number>}
export interface Advanced extends Screen,Clip,Tone,Despot {grow?:Signal<number>;softness?:Signal<number>;despillBias?:Color;useAlphaBiasForDespill?:boolean;despill?:Signal<number>;screenReplace?:Replacement;screenReplaceColor?:Color;insideReplace?:Replacement;insideReplaceColor?:Color;inside?:GpuPixelImage;outside?:GpuPixelImage;background?:GpuPixelImage;insideComponent?:Component;outsideComponent?:Component;sourceAlpha?:'ignore'|'inside'|'normal';foreground?:Grade;edge?:Grade;edgeWidth?:Signal<number>;view?:'source'|'source-alpha'|'corrected-source'|'colour-correction-edges'|'screen-matte'|'inside'|'outside'|'combined-matte'|'status'|'intermediate'|'final'|'composite'}
export interface NativeProKeyFilters {
 screenMatte(image:GpuPixelImage,options?:Screen):Promise<GpuPixelImage>;
 matteClipRollback(matte:GpuPixelImage,options?:Clip):Promise<GpuPixelImage>;
 matteTone(matte:GpuPixelImage,options?:Tone):Promise<GpuPixelImage>;
 matteGarbage(matte:GpuPixelImage,source:GpuPixelImage,inside:GpuPixelImage,outside:GpuPixelImage,options?:Garbage):Promise<GpuPixelImage>;
 matteDespot(matte:GpuPixelImage,options?:Despot):Promise<GpuPixelImage>;
 keyUnmix(image:GpuPixelImage,matte:GpuPixelImage,options?:Unmix):Promise<GpuPixelImage>;
 keyReplace(image:GpuPixelImage,foreground:GpuPixelImage,rawMatte:GpuPixelImage,matte:GpuPixelImage,options?:Replace):Promise<GpuPixelImage>;
 keyBias(image:GpuPixelImage,options?:Bias):Promise<GpuPixelImage>;
 spillBias(image:GpuPixelImage,options?:SpillBias):Promise<GpuPixelImage>;
 foregroundGrade(image:GpuPixelImage,options?:Grade):Promise<GpuPixelImage>;
 edgeGrade(image:GpuPixelImage,edge:GpuPixelImage,options?:Grade):Promise<GpuPixelImage>;
 keyStatus(matte:GpuPixelImage,options?:Status):Promise<GpuPixelImage>;
 keyDifference(image:GpuPixelImage,keyed:GpuPixelImage,options?:Output):Promise<GpuPixelImage>;
 hairMatte(image:GpuPixelImage,foreground:GpuPixelImage,background:GpuPixelImage,options?:Hair):Promise<GpuPixelImage>;
 refineBand(matte:GpuPixelImage,options?:Band):Promise<GpuPixelImage>;
 temporalMatte(matte:GpuPixelImage,previous:GpuPixelImage,guide:GpuPixelImage,previousGuide:GpuPixelImage,motion:GpuDataBuffer,options?:Temporal):Promise<GpuPixelImage>;
 matteVectorBlur(matte:GpuPixelImage,motion:GpuDataBuffer,options?:VectorBlur):Promise<GpuPixelImage>;
 strokeTrimap(image:GpuPixelImage,strokes:readonly RotoStroke[],options?:Output):Promise<TrimapField>;
 randomWalkerMatte(image:GpuPixelImage,trimap:TrimapField,options?:Walker):Promise<MatteSolve>;
 keyCrop(image:GpuPixelImage,options?:Crop):Promise<GpuPixelImage>;
 keyAdvanced(image:GpuPixelImage,options?:Advanced):Promise<GpuPixelImage>;
}
export const nativeProKeyNames=['screenMatte','matteClipRollback','matteTone','matteGarbage','matteDespot','keyUnmix','keyReplace','keyBias','spillBias','foregroundGrade','edgeGrade','keyStatus','keyDifference','hairMatte','refineBand','temporalMatte','matteVectorBlur','strokeTrimap','randomWalkerMatte','keyCrop','keyAdvanced'] as const satisfies readonly (keyof NativeProKeyFilters)[];
