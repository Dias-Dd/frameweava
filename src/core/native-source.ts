import type { StageFactory } from './types.ts';
import type {AuthoredAudioStage} from '../audio/contract.ts';
type NativeFactory=StageFactory<any,any,any>|AuthoredAudioStage<any,any,any>|import('../../modules/native-gpu/authoring.ts').NativeStageFactory<any,any,any>;

/** Authoring metadata only. The build worker resolves identity to an ESM export.
 * Symbols survive normal object spreads but are never written to the JSON TVG.
 * Keep this protocol key in sync with compiler/evaluate.mjs (a plain Node worker).
 */
export const NATIVE_STAGE_FACTORY = Symbol.for('@frameweave/engine.native-stage-factory');
export function attachStageFactory<T extends object>(source:T, factory:NativeFactory):T {
  Object.defineProperty(source,NATIVE_STAGE_FACTORY,{value:factory,enumerable:true,configurable:true});
  return source;
}
export function stageFactory(source:object):NativeFactory|undefined {
  return (source as Record<symbol,NativeFactory>)[NATIVE_STAGE_FACTORY];
}
