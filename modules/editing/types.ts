import type {Rational,Signal,Transform} from '../../src/core/types.ts';
import type {ColorEncoding,AlphaMode} from '../../src/media/surface.ts';
import type {NativeStageFactory} from '../native-gpu/authoring.ts';
import type {TextAsset} from './text.ts';
import type {EditImageEffect} from './effects.ts';
import type {EditTransition} from './transitions.ts';
import type {AudioEditTrack} from './audio.ts';

export interface VideoAsset {
 readonly kind:'video'; readonly id:string; readonly src:string;
 readonly width:number; readonly height:number;
 readonly decoder:'cpu'|'hardware'; readonly interpretation:ColorEncoding;
 readonly metadataPolicy:'validate'|'override'; readonly cacheBytes?:number;
}
export interface ImageAsset {
 readonly kind:'image'; readonly id:string; readonly src:string;
 readonly width:number; readonly height:number;
 readonly decode:'icc-sdr'|'surface-v2'; readonly missingProfile:'error'|'assume-srgb';
 readonly alpha:AlphaMode;
}
export type EditAsset=VideoAsset|ImageAsset|TextAsset;
/** All edit positions, trims and durations use PROJECT frames, including sourceIn.
 * Video sampling converts these frames to rational presentation seconds, not nominal source frame numbers. */
export interface EditClip {
 readonly asset:EditAsset; readonly sourceIn:number|Rational; readonly duration:number;
 readonly rate?:Rational;
 /** Absolute source position in project-frame units, evaluated by Core against the actual Stage FrameContext. */
 readonly sourceFrame?:Signal<number>;
 readonly fit:'contain'|'cover'|'stretch'; readonly sampling:'linear'|'nearest';
 readonly transform:Transform;
 readonly effects?:readonly EditImageEffect[];
}
export interface PlacedClip {readonly at:number;readonly clip:EditClip;readonly transition?:EditTransition}
export type EditTrack=readonly PlacedClip[];
export interface EditPlan {
 readonly version:1; readonly fps:Rational; readonly duration:number;
 readonly tracks:readonly EditTrack[];
 /** Scene-linear Rec709, straight RGBA. Alpha is applied exactly once by the existing GPU primitive. */
 readonly background:readonly [number,number,number,number];
 readonly format:'rgba16float'|'rgba32float';
 readonly effects?:readonly EditImageEffect[];
}
export interface ClipOptions {
 from?:number|Rational; duration:number; speed?:number|Rational; sourceFrame?:Signal<number>; fit?:EditClip['fit']; sampling?:EditClip['sampling'];
 transform?:Transform;
 effects?:readonly EditImageEffect[];
}
export interface TimelineOptions {
 fps:number|Rational; tracks:readonly EditTrack[]; duration?:number;
 background?:readonly [number,number,number,number]; format?:EditPlan['format'];
 effects?:readonly EditImageEffect[];
}
export const EDITING_PLAN=Symbol.for('@frameweave/editing.plan');
export type EditStageFactory=NativeStageFactory<any,any>&{readonly [EDITING_PLAN]:EditPlan};
interface EditDimensions {
 id?:string;width:number;height:number;seed?:number;
 audio?:readonly AudioEditTrack[];
}
export type EditCompositionOptions=EditDimensions&(
 | (TimelineOptions&{factory:NativeStageFactory<any,any>})
 | {factory:EditStageFactory;fps?:never;tracks?:never;duration?:never;background?:never;format?:never;effects?:never}
);
export type AnimatedEditNumber=Signal<number>;
