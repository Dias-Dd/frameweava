/** R1 Stage binding. Context comes from the existing package initializer. */
export type * from './types.ts';
export declare function createPuppet(mesh:import('./types.ts').MeshData,options?:import('./types.ts').PuppetOptions):Promise<import('./types.ts').Puppet>;
export declare const createPuppetRenderer:typeof import('./renderer.ts').createPuppetRenderer;
export type {PuppetRendererOptions,PuppetRenderOptions} from './renderer.ts';

export declare function createPuppetProcessor(options?:import('./types.ts').PuppetOptions):Promise<import('./types.ts').PuppetProcessor>;
