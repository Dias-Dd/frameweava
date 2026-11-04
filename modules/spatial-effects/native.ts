/** Explicit Native GPU authoring path; no browser renderer or resource import. */
export {createFeedbackParticles,particleAcceleration} from './src/simulation.ts';
export {createNativeParticleRenderer,prepareNativeParticles} from './src/native-particles.ts';
export type {NativeParticleOptions,NativeParticleInputs,NativeParticlePlan} from './src/native-particles.ts';
export type {NativeSpriteAtlas} from './src/native-atlas.ts';
export {evaluateParticleLife} from './src/appearance.ts';
export {createNoise} from './src/noise.ts';
export {createNativeNoiseTextureRenderer} from './src/noise-native.ts';
export {createImageEmitter} from './src/image-emitter.ts';
export type * from './src/types.ts';
