/** CPU geometry, skeleton control and sampling retain their existing numerical
 * algorithms in Native JS. Rendering adapters are provided separately; no Web
 * renderer/context is created by importing these factories. */
export {createSkeletonRig} from './src/rig.ts';
export {createNativeMeshRenderer} from './src/native-mesh.ts';
export type {NativeMeshRendererOptions} from './src/native-mesh.ts';
export type * from './src/mesh-types.ts';
export type * from './src/instance-types.ts';
export {createNativeInstancedMeshRenderer} from './src/native-instance.ts';
export {createNativeSkinnedRenderer,decodeNativePositionProbe} from './src/native-skinned.ts';
export {createSurfaceSampler} from './src/surface-sampler.ts';
export {createTrailGeometry} from './src/trail-geometry.ts';
export {createLightningGeometry} from './src/lightning-geometry.ts';
export {createIsosurfaceGeometry} from './src/isosurface-geometry.ts';
export type * from './src/types.ts';
export type * from './src/trail-types.ts';
export type * from './src/lightning-types.ts';
export type * from './src/isosurface-types.ts';
