/** CPU geometry/configuration helpers are host independent. The explicit Native
 * solver adapter below requires authorized ModuleLoader bytes and host WASM. */
export {ropeOptions,clothOptions} from './src/factories.ts';
export {softBodyOptions} from './src/soft-body.ts';
export {rodOptions} from './src/rod-factory.ts';
export {rodMeshDraws} from './src/rod-geometry.ts';
export type * from './src/types.ts';
import type {ModuleLoader} from '../../src/plugins/sdk.ts';import {createDeformableTools} from './src/api.ts';import {nativeWasmOptions} from '../spidermonkey-host/wasm-client-options.ts';
import type {DeformableOptions,DeformableClientOptions} from './src/types.ts';
/** Original XPBD solver; authorization and resource admission stay in R1. */
export function createNativeDeformableTools(load:ModuleLoader){const tools=createDeformableTools(load);return {createDeformables:(input:DeformableOptions,options:Omit<DeformableClientOptions,'worker'>={})=>tools.createDeformables(input,nativeWasmOptions(options))};}
