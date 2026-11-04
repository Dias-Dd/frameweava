// SPDX-License-Identifier: Apache-2.0
// Scoped build injection only. Original WHATWG implementation supplies events;
// native globals win, and no property on globalThis is changed.
import {AbortController as Controller,AbortSignal as Signal} from './vendor/abort-controller/abort-controller.mjs';
const reasons=new WeakMap();
function abortError(){const value=new Error('The operation was aborted');value.name='AbortError';return value;}
class ScopedController extends Controller {
 abort(reason){if(!this.signal.aborted){reasons.set(this.signal,reason===undefined?abortError():reason);super.abort();}}
}
if(!Object.hasOwn(Signal.prototype,'reason'))Object.defineProperty(Signal.prototype,'reason',{configurable:true,get(){return reasons.get(this);}});
if(!Object.hasOwn(Signal.prototype,'throwIfAborted'))Object.defineProperty(Signal.prototype,'throwIfAborted',{configurable:true,value(){if(this.aborted)throw this.reason;}});
export const AbortController=typeof globalThis.AbortController==='function'?globalThis.AbortController:ScopedController;
export const AbortSignal=typeof globalThis.AbortSignal==='function'?globalThis.AbortSignal:Signal;
