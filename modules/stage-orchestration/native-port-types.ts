import type {Json} from '../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
/** Native runtime ports. Resident images are not CPU-owned PortValues. */
export type NativeStagePorts=Record<string,Json|GpuPixelImage>;
/** Private record/reply metadata; indices belong to one admitted owner program. */
export interface NativePortPacket {values:Record<string,Json>;images:Record<string,{image:number;info:GpuPixelImageInfo}>}
