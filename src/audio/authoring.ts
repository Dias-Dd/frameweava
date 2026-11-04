import {Stage,type StageProps,type StageNode} from '../core/authoring.ts';
import {NATIVE_STAGE_FACTORY} from '../core/native-source.ts';
import {AUDIO_STAGE,type AuthoredAudioStage} from './contract.ts';
import type {PortValue} from '../core/types.ts';
/** Thin compatibility source helper; returns the existing Stage node and factory binding.
 * FW-1's ordinary Stage(factory) inference can consume the same marker after integration. */
export function audioStageSource<I,P,O extends Record<string,PortValue>>(options:Omit<StageProps,'engine'|'entry'|'exportName'|'factory'|'children'>&{factory:AuthoredAudioStage<I,P,O>}):StageNode {
  const {factory,...props}=options,node=Stage({...props,engine:'audio',outputs:props.outputs??{audio:'audio'}});
  node.spec.audio={...factory[AUDIO_STAGE]};Object.defineProperty(node.spec,NATIVE_STAGE_FACTORY,{value:factory,enumerable:true,configurable:true});return node;
}
