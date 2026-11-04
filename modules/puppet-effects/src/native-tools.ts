import type {ModuleLoader} from '../../../src/plugins/sdk.ts';import {validateMeshData} from '../../graphics-contracts/validate.ts';
import {createPuppetTools} from './solver.ts';import {createPuppetProcessorTools} from './processor.ts';import {nativeWasmOptions} from '../../spidermonkey-host/wasm-client-options.ts';
import type {PuppetOptions,MeshData} from './types.ts';
/** Same EffectCraft-derived solver/mesher and existing R1 ModuleLoader. */
export function createNativePuppetTools(load:ModuleLoader){const tools=createPuppetTools({validateMeshData},load);return {createPuppet:(mesh:MeshData,options:Omit<PuppetOptions,'worker'>={})=>tools.createPuppet(mesh,nativeWasmOptions(options))};}
export function createNativePuppetProcessorTools(load:ModuleLoader){const tools=createPuppetProcessorTools({validateMeshData},load);return {createPuppetProcessor:(options:Omit<PuppetOptions,'worker'>={})=>tools.createPuppetProcessor(nativeWasmOptions(options))};}
