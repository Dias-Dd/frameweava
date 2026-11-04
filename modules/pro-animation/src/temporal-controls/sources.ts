// SPDX-License-Identifier: Apache-2.0
import type {FrameContext} from '../../../../src/core/types.ts';import type {NativeTemporalBinding,NativeTemporalSourceBinding,NativeTemporalWindowOptions} from '../../../native-gpu/temporal-types.ts';import type {NativeTimeEnvironment,NativeTimeSource} from '../native-time/types.ts';import {copyKernel,fail} from './common.ts';
export type ManagedTemporalBinding=NativeTemporalBinding|NativeTemporalSourceBinding;
/** One authenticated Core window per call, never nested. Its newly copied result
 * is promoted by existing Core lease rules and may feed another sequential window.
 * This borrows the binding; no source/lease registry, scheduler or authority is created. */
export function managedTemporalSource(environment:NativeTimeEnvironment,binding:ManagedTemporalBinding,enclosingContext:FrameContext,options:NativeTemporalWindowOptions={}):NativeTimeSource{
 if(!binding||typeof binding.window!=='function'||binding.info?.version!==1||binding.info.ownership!=='stage-local'||!['native-pixel-prefix-v1','declared-input-v1','declared-resource-v1'].includes(binding.info.profile))fail('Actual admitted Stage-local Core binding required');
 return sample=>binding.window(enclosingContext,options,async at=>{const borrowed=await at(sample),{version,...output}=borrowed.info;return environment.gpu.run(await environment.gpu.compile(copyKernel),[borrowed],{output});});
}
