import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
export interface CompositeOptions {format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;opacity?:Signal<number>;signal?:AbortSignal}
export interface RationalOptions extends CompositeOptions {epsilon?:Signal<number>}
export interface DissolveOptions extends CompositeOptions {seed?:number;animated?:boolean}
export interface NativeCompositeFilters {
 softLight(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 colorDodge(source:GpuPixelImage,destination:GpuPixelImage,options?:RationalOptions):Promise<GpuPixelImage>;
 colorBurn(source:GpuPixelImage,destination:GpuPixelImage,options?:RationalOptions):Promise<GpuPixelImage>;
 vividLight(source:GpuPixelImage,destination:GpuPixelImage,options?:RationalOptions):Promise<GpuPixelImage>;
 hardMix(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 hueBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 saturationBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 colorBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 luminosityBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 lighterColor(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 darkerColor(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 divideBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:RationalOptions):Promise<GpuPixelImage>;
 negationBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 phoenixBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 destinationOver(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 sourceOut(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 sourceAtop(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 destinationAtop(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 xorComposite(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 saturateComposite(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
 dissolve(source:GpuPixelImage,destination:GpuPixelImage,options?:DissolveOptions):Promise<GpuPixelImage>;
 linearDodgeBlend(source:GpuPixelImage,destination:GpuPixelImage,options?:CompositeOptions):Promise<GpuPixelImage>;
}
export const nativeCompositeNames=['softLight','colorDodge','colorBurn','vividLight','hardMix','hueBlend','saturationBlend','colorBlend','luminosityBlend','lighterColor','darkerColor','divideBlend','negationBlend','phoenixBlend','destinationOver','sourceOut','sourceAtop','destinationAtop','xorComposite','saturateComposite','dissolve','linearDodgeBlend'] as const satisfies readonly (keyof NativeCompositeFilters)[];
