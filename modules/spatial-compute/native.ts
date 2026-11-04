/** The same explicit-input compute operators on the existing Native Scope.
 * Stateful use must reset/replay managed Native leases, not retain frame-local
 * buffers or treat a previous output as an implicit simulation checkpoint. */
export {cellularVolume,vortexField,curlNoiseField,advectField,diffuseField,projectVelocity,vorticityConfinement,reactionDiffusion,waveStep,thermalErosion,approximateDistance,advectParticles,flockParticles,splatParticles,renderVolume} from './index.ts';
export {createNativeReplay} from './native-replay.ts';
export type {NativeReplayOptions,NativeReplayStep} from './native-replay.ts';
export type * from './types.ts';
