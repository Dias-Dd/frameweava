/** Context-bound existing R1 exports, not an ambient WASM/GPU permission grant. */
export type * from './types.ts';export {ropeOptions,clothOptions} from './factories.ts';export type {RopeOptions,ClothOptions} from './factories.ts';
export declare function createDeformables(config:import('./types.ts').DeformableOptions&{rod:import('./rod-types.ts').CosseratRod},options?:import('./types.ts').DeformableClientOptions):Promise<import('./rod-types.ts').RodSimulation>;
export declare function createDeformables(config:import('./types.ts').DeformableOptions,options?:import('./types.ts').DeformableClientOptions):Promise<import('./types.ts').DeformableSimulation>;

export {softBodyOptions} from './soft-body.ts';export type {SoftBodyOptions,Tetrahedron} from './soft-body.ts';

export {rodOptions} from './rod-factory.ts';export {rodMeshDraws} from './rod-geometry.ts';
