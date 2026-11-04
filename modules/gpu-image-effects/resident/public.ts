import {EngineError} from '../../../src/core/errors.ts';
import type {ProfessionalSurface} from '../../../src/media/surface.ts';
import type {ImageRecipe,ProcessOptions} from './processor.ts';
export async function processImage(_input:ProfessionalSurface,_recipe:ImageRecipe,_options?:ProcessOptions):Promise<ProfessionalSurface>{throw new EngineError('E_GPU_IMAGE_BINDING','Use the managed Stage binding or createImageProcessor(init).process');}
export function imageStats():ReturnType<ReturnType<typeof import('./processor.ts').createImageProcessor>['stats']>{throw new EngineError('E_GPU_IMAGE_BINDING','Use the managed Stage binding');}
