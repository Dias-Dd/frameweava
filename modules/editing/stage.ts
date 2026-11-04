import {defineNativeStage} from '../native-gpu/authoring.ts';
import {timeline} from './authoring.ts';
import {createEditingStage} from './runtime-entry.ts';
import {EDITING_PLAN,type EditStageFactory,type TimelineOptions} from './types.ts';
/** A named exported callable Stage, using the compiler's existing ESM identity.
 * The same ordinary module evaluates in the execution host; no closure serialization or new protocol. */
export function editingStage(options:TimelineOptions):EditStageFactory {
 const plan=timeline(options),factory=defineNativeStage(init=>createEditingStage(init,{plan}));
 Object.defineProperty(factory,EDITING_PLAN,{value:plan});return factory as EditStageFactory;
}
