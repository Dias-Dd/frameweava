import type {NativePluginInit} from '../../src/plugins/sdk.ts';
import {nativeLibraryBindings} from '../native-gpu/library-bindings.ts';
import * as sceneFactories from './rendering.ts';

/** Reuse the admitted library lease and lifecycle; make explicit author disposal
 * and the loader's final cleanup refer to the same disposal operation. */
export function sceneBindings(init:NativePluginInit,factories:Record<string,unknown>=sceneFactories){
  const functions=Object.fromEntries(Object.entries(factories).filter(([,fn])=>typeof fn==='function').map(([name,fn])=>[
    name,async(...args:unknown[])=>{
      const instance=await (fn as (...args:unknown[])=>unknown)(...args) as {dispose?:()=>unknown};
      if(instance&&typeof instance.dispose==='function'){
        const dispose=instance.dispose.bind(instance);let closing:Promise<unknown>|undefined;
        instance.dispose=()=>closing??=Promise.resolve().then(dispose);
      }
      return instance;
    },
  ]));
  return nativeLibraryBindings(init,functions);
}
