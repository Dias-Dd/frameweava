import type {NativeEstimationFilters,MotionField,GrainProfile} from './types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
export function typeAssertions(f:NativeEstimationFilters,i:GpuPixelImage,m:MotionField,p:GrainProfile){
// @ts-expect-error GPU field is not an image.
void f.opticalFlow(m,i);
// @ts-expect-error unrecognized option is rejected.
void f.opticalFlow(i,i,{arbitrary:true});
// @ts-expect-error profiles are runtime typed owner-local data.
void f.synthesizeGrain(i,{spectrum:[]});
// @ts-expect-error timestamps require an exact rational.
void f.stabilizeSequence(i,[{image:i,time:0}],{time:{num:0,den:1}});
// @ts-expect-error A data field cannot have image opacity/format options.
void f.opticalFlow(i,i,{format:'rgba16float'});
void f.synthesizeGrain(i,p);
}
