export {createFeedbackParticles,particleAcceleration} from './simulation.ts';

export type {ParticleRendererOptions} from './renderer.ts';
export type * from './types.ts';
export {createNoise} from './noise.ts';
export type {NoiseOptions,NoiseAlgorithm,NoiseFractal,FractalOptions} from './noise.ts';

export type {NoiseTextureOptions,NoiseTextureRendererOptions} from './noise-renderer.ts';

export {createImageEmitter} from './image-emitter.ts';

export {evaluateParticleLife} from './appearance.ts';
export type {ParticleLifeKey,ParticleLifeCurves,ParticleLifeValue} from './appearance.ts';
