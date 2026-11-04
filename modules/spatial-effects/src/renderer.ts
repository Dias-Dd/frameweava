/** Shared Native parameter types; the browser renderer was removed. */
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {Vec3,ParticleSpriteAtlas} from './types.ts';
export interface ParticleRendererOptions {
  width:number;height:number;workingColor?:ColorEncoding;
  /** Orthographic camera in Graphics world meters. Vertical extent scales with image aspect. */
  viewHeight?:number; camera?:{position:Vec3;target:Vec3;near?:number;far?:number};
  chunkInstances?:number;maxBufferBytes?:number;
  /** Optional immutable, copied-once scene-linear float texture. No per-frame re-import. */
  spriteAtlas?:ParticleSpriteAtlas;
}
