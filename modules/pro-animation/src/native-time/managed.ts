// SPDX-License-Identifier: Apache-2.0
// Consumer-only projection of the frozen Core temporal binding, not a second source service or ABI.
import {EngineError} from '../../../../src/core/errors.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import {createNativeTimeEffects,type NativeTimeEffects} from './index.ts';
import type {NativeTimeEnvironment,NativeTimeSource} from './types.ts';
/** Deliberately no Core token/reader/lease types copied into PA. Concrete window options
 * are inferred from the actual supplied Core binding; its own brand/signal types survive.
 * Unknown return type avoids bridging two independently installed SDK image brands.
 * Main can substitute its canonical type import after the shared Core commit is integrated. */
export interface NativeManagedTimeBinding {
 readonly info:{readonly version:1;readonly profile:'native-pixel-prefix-v1';readonly ownership:'stage-local';readonly id:string;readonly packageRef:string;readonly module:string;readonly integrity:string};
 window:(...args:never[])=>Promise<unknown>;
}
/** Additional structural projection only; the existing prefix interface retains its exact required identity fields. */
export interface NativeDeclaredTimeBinding extends Omit<NativeManagedTimeBinding,'info'> {
 readonly info:{readonly version:1;readonly profile:'declared-input-v1'|'declared-resource-v1';readonly ownership:'stage-local';readonly id:string};
}
export type NativeTimeBinding=NativeManagedTimeBinding|NativeDeclaredTimeBinding;
export type ManagedWindowOptions<B extends NativeTimeBinding>=Parameters<B['window']>[1];
type Options<K extends keyof NativeTimeEffects>=NativeTimeEffects[K] extends (...args:infer A)=>unknown?K extends 'timeCrossfade'|'timeDifference'?A[2]:A[1]:never;
/** Bind once to a real Core source.window. Borrows it: caller disposes the actual Core
 * binding after pending work. This creates no source/lease registry or cancel controller.
 * Exact Core parameter/token options are forwarded unchanged; Core performs authentication,
 * snapshots, context checks, rollback and cancellation. GPU arithmetic stays the old reducer. */
export function createNativeManagedTimeEffects<B extends NativeTimeBinding>(environment:NativeTimeEnvironment,binding:B){
 if(!binding||typeof binding.window!=='function'||binding.info?.version!==1||!['native-pixel-prefix-v1','declared-input-v1','declared-resource-v1'].includes(binding.info.profile)||binding.info.ownership!=='stage-local')throw new EngineError('E_PA_TIME_BINDING','An actual Stage-local Core temporal prefix, declared input or Resource binding is required');
 const fx=createNativeTimeEffects(environment);
 const window=(context:FrameContext,options:ManagedWindowOptions<B>|undefined,consume:(source:NativeTimeSource)=>Promise<GpuPixelImage>)=>Reflect.apply(binding.window,binding,[context,options??{},consume]) as Promise<GpuPixelImage>;
 return Object.freeze({
  sourceInfo:binding.info as B['info'],
  retime:(o:Options<'retime'>={},c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.retime(s,o,c)),
  frameBlend:(o:Options<'frameBlend'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.frameBlend(s,o,c)),
  echo:(o:Options<'echo'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.echo(s,o,c)),
  trails:(o:Options<'trails'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.trails(s,o,c)),
  shutterBlur:(o:Options<'shutterBlur'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.shutterBlur(s,o,c)),
  wideTime:(o:Options<'wideTime'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.wideTime(s,o,c)),
  posterize:(o:Options<'posterize'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.posterize(s,o,c)),
  strobe:(o:Options<'strobe'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.strobe(s,o,c)),
  // One authenticated window, same sealed source sampled at two different times.
  // Distinct sources remain separate bindings; no nested Core window or implicit DAG edge is invented.
  timeCrossfade:(o:Options<'timeCrossfade'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.timeCrossfade(s,s,o,c)),
  timeDifference:(o:Options<'timeDifference'>,c:FrameContext,w?:ManagedWindowOptions<B>)=>window(c,w,s=>fx.timeDifference(s,s,o,c)),
  stats:fx.stats,
 });
}
export type NativeManagedTimeEffects<B extends NativeTimeBinding>=ReturnType<typeof createNativeManagedTimeEffects<B>>;
