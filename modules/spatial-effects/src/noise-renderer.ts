/** Shared Native parameter types; the browser renderer was removed. */
import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {NoiseOptions} from './noise.ts';
import type {Vec3} from './types.ts';
export interface NoiseTextureOptions {
  noise?:NoiseOptions;dimensions?:2|3;
  /** Pixel-center domain: row0/col0 is origin, stepY follows image rows (top to bottom).
   * Motion is an explicit world-coordinate offset per Stage-local second. */
  origin?:Vec3;stepX?:Vec3;stepY?:Vec3;motion?:Vec3;
  ink?:Vec3;base?:Vec3;alpha?:Signal<number>;gain?:Signal<number>;bias?:Signal<number>;
}
export interface NoiseTextureRendererOptions {width:number;height:number;workingColor?:ColorEncoding;maxBufferBytes?:number;maxSampleOperations?:number}
