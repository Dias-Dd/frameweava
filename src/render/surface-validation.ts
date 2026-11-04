import {EngineError} from '../core/errors.ts';
import {assertProfessionalSurface,pixelsFromSurface,type ProfessionalSurface} from '../media/surface.ts';
import {surfaceBytes} from '../media/surface-storage.ts';

/** Validate the original sample contract without materializing a throwaway F32
 * image for RGBA8 transport. Every byte already denotes a finite [0,1] sample;
 * only opaque Alpha imposes an additional sample constraint. Float/10-bit
 * formats keep the original reference validation and error behavior. */
export function assertSurfaceSampleRange(surface:ProfessionalSurface):void {
  assertProfessionalSurface(surface);
  if(surface.format!=='rgba8unorm'){pixelsFromSurface(surface);return;}
  const bytes=surfaceBytes(surface);
  if(bytes.length!==surface.rowStride*surface.height)throw new EngineError('E_MEDIA_BYTES','Decoded length mismatch');
  if(surface.alpha==='opaque')for(let y=0;y<surface.height;y++){
    const end=y*surface.rowStride+surface.width*4;
    for(let offset=y*surface.rowStride+3;offset<end;offset+=4)if(bytes[offset]!==255)throw new EngineError('E_MEDIA_RANGE','Invalid finite samples/alpha');
  }
}
