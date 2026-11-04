import {nativeDispatcher} from '../spidermonkey-host/bootstrap.ts';
import type {NativeStageFactory} from './authoring.ts';
import {EngineError} from '../../src/core/errors.ts';
/** Register compiled logic only with the isolated SpiderMonkey execution host. */
export function installNativeLogic(factory:NativeStageFactory<any,any,any>){
 const host=(globalThis as any).__frameweaveNativeHost;
 if(!host)throw new EngineError('E_NATIVE_LOGIC_HOST','Native Stage bundles require the SpiderMonkey host.');
 host.register(nativeDispatcher(factory,host.setFrame,host.stopFrame));
}
