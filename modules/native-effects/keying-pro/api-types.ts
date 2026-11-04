import type {NativeProKeyFilters,TrimapField} from './types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
export function typeAssertions(f:NativeProKeyFilters,i:GpuPixelImage,b:GpuDataBuffer,t:TrimapField){
// @ts-expect-error Unknown documented option is not accepted.
void f.screenMatte(i,{arbitrary:true});
// @ts-expect-error A runtime GPU field cannot be replaced by JSON.
void f.temporalMatte(i,i,i,i,{values:[0,0,1]});
// @ts-expect-error RGB bias has exactly three leaves.
void f.keyBias(i,{bias:[1,1]});
// @ts-expect-error Model/data fields are not color images.
void f.keyUnmix(b,i);
void f.randomWalkerMatte(i,t).then(r=>{const image:GpuPixelImage=r.image;const quality:GpuDataBuffer=r.diagnostics;return [image,quality];});
}
