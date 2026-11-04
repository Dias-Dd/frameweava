import type {ModuleLoader} from '../../src/plugins/sdk.ts';import {createRigidBodyTools} from './src/api.ts';import {nativeWasmOptions} from '../spidermonkey-host/wasm-client-options.ts';
import type {RigidWorldOptions,RigidClientOptions,StaticCollisionClientOptions} from './src/types.ts';
/** Original pinned Rapier WASM, same Core fixed step/checkpoints and loader. */
export function createNativeRigidBodyTools(load:ModuleLoader){const tools=createRigidBodyTools(load);return {createRigidBodies:(world:RigidWorldOptions,options:Omit<RigidClientOptions,'worker'>={})=>tools.createRigidBodies(world,nativeWasmOptions(options)),createCollisionEnvironment:(world:RigidWorldOptions,options:StaticCollisionClientOptions={})=>{nativeWasmOptions({});return tools.createCollisionEnvironment(world,options);}};}
export type * from './src/types.ts';
