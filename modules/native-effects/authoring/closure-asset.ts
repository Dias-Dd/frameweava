import {createNativeClosureEffects} from '../closure-filters/index.ts';
import {prepareImageEffects} from './prepared.ts';
/** Declaration only. Each admitted Stage initializes its own async processor. */
export const closureEffects=prepareImageEffects(init=>createNativeClosureEffects(init));
