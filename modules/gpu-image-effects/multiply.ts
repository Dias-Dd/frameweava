import type {FrameContext} from '../../src/core/types.ts';

import {fields} from './parameters.ts';
import {resolveOver,type OverOptions} from './over.ts';


/** Multiply in scene-linear working colour using existing coverage-aware blend
 * semantics. Native PM/opaque output only; not raw gain-map modulation or display-gamma blending. */
export interface MultiplyOptions extends OverOptions {}
export function resolveMultiply(options:MultiplyOptions={},ctx?:FrameContext){
 fields(options,['opacity','workingColor','format','alpha','maxBufferBytes','signal'],'multiply');
 return resolveOver(options,ctx);
}
