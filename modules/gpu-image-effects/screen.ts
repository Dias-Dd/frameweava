import type {FrameContext} from '../../src/core/types.ts';

import {fields} from './parameters.ts';
import {resolveOver,type OverOptions} from './over.ts';


/** Screen in scene-linear working colour using existing coverage-aware blend
 * semantics. Native PM/opaque output only; no display-gamma blending/clipping. */
export interface ScreenOptions extends OverOptions {}
export function resolveScreen(options:ScreenOptions={},ctx?:FrameContext){
 fields(options,['opacity','workingColor','format','alpha','maxBufferBytes','signal'],'screen');
 return resolveOver(options,ctx);
}
