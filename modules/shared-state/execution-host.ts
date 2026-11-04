import type {StageSpec} from '../../src/core/types.ts';
import type {FrameExecution} from '../../src/render/frame-execution.ts';
import {CONFIG,RUNTIME,fail} from './protocol.ts';

/** Common execution preflight. Unsupported CLI routes must also call this BEFORE
 * creating a Renderer, so they do not initialize native factories first.
 * This is a host-presence check, not authorization or publication validation. */
export function assertSharedExecution(stages:readonly Pick<StageSpec,'id'|'props'>[],execution?:FrameExecution):void{
  for(const stage of stages){
    if(!Object.hasOwn(stage.props,CONFIG))continue;
    const props=execution?.stageProps&&Object.hasOwn(execution.stageProps,stage.id)?execution.stageProps[stage.id]:undefined;
    if(!props||!Object.hasOwn(props,RUNTIME)||typeof props[RUNTIME]!=='string')fail('E_SHARED_HOST_REQUIRED','This entry requires the shared-state host in RenderSession; no Stage was executed');
  }
}
