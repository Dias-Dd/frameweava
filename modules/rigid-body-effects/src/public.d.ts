/** Context-bound R1 import, initialized with the existing verified ModuleLoader. */
export type * from './types.ts';
export declare function createRigidBodies(config:import('./types.ts').RigidWorldOptions,options?:import('./types.ts').RigidClientOptions):Promise<import('./types.ts').RigidSimulation>;

export declare function createCollisionEnvironment(config:import('./types.ts').RigidWorldOptions,options?:import('./types.ts').StaticCollisionClientOptions):Promise<import('./types.ts').StaticCollisionEnvironment>;
