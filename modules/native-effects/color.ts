import type {ColorEncoding} from '../../src/media/surface.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {samePixelColor} from '../gpu-effects/pixel-shader.ts';
import type {NativeGpuScope} from '../native-gpu/authoring.ts';

/** An explicit workingColor is an operation boundary, never a metadata relabel.
 * Use F32 before the effect, even for Half input; logical Half publication stays
 * at the original effect output. The recipe lease owns any converted image. */
export async function nativeWorkingImage(gpu:NativeGpuScope,image:GpuPixelImage,color:ColorEncoding,signal?:AbortSignal):Promise<GpuPixelImage>{
 return samePixelColor(image.info.color,color)?image:gpu.convertColor(image,{version:1,color,format:'rgba32float',signal});
}
