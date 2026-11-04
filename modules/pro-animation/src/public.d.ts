/** Callable Stage bindings. Runtime values are provided by the declared R1 initializer. */
export {revealText,wiggle,blur,surfaceFromCoverage,applyFloatKernel,rangeSelector,combineSelectors,selectorOrder,randomSelector,stagger,segmentText,noiseField,createDisplacementMap,displaceWithMap,emitParticles,rasterizeParticles} from './index.ts';
export type * from './index.ts';
type Curves=ReturnType<typeof import('./index.ts').createPathTools>;
export declare function trimPaths(...args:Parameters<Curves['trimCurves']>):ReturnType<Curves['trimCurves']>;
export declare function trimPaths(...args:Parameters<ReturnType<typeof import('./index.ts').createVectorTools>['trimPaths']>):import('./index.ts').PathData;
export declare const measurePath:Curves['measurePath'];
export declare const createPathSampler:Curves['createPathSampler'];
export declare const matchPaths:Curves['matchPaths'];
export declare const morphPath:ReturnType<typeof import('./index.ts').createVectorTools>['morphPath'];
import type {ProfessionalSurface,FrameContext} from '@frameweave/engine';
import type {GlowOptions,DisplacementOptions} from './professional.js';
type Legacy=Awaited<ReturnType<typeof import('./index.ts').createImageEffects>>;
export declare function glow(input:ProfessionalSurface,options:GlowOptions,context?:FrameContext):ProfessionalSurface;
/** Legacy/SDR only; not a professional pixel path. */
export declare function glow(...args:Parameters<Legacy['glow']>):ReturnType<Legacy['glow']>;
export declare function displacement(input:ProfessionalSurface,options:DisplacementOptions,context?:FrameContext):ProfessionalSurface;
/** Legacy/SDR only; keeps PA-0 nearest/Canvas8 semantics. */
export declare function displacement(...args:Parameters<Legacy['displacement']>):ReturnType<Legacy['displacement']>;
export declare const rasterizeText:ReturnType<typeof import('./index.ts').createCoverageRasterizer>['rasterizeText'];
export declare const rasterizePath:ReturnType<typeof import('./index.ts').createCoverageRasterizer>['rasterizePath'];

export declare const rasterizeAnimatedText:ReturnType<typeof import('./index.ts').createAnimatedTextTools>['rasterizeAnimatedText'];

export declare const deformPath:ReturnType<typeof import('./index.ts').createDeformationTools>['deformPath'];

export declare const repeatPath:ReturnType<typeof import('./index.ts').createShapeModifiers>['repeatPath'];
export declare const roundCorners:ReturnType<typeof import('./index.ts').createShapeModifiers>['roundCorners'];
export declare const puckerBloat:ReturnType<typeof import('./index.ts').createShapeModifiers>['puckerBloat'];

// Explicit value exports take precedence over the earlier type-only star export.
export {createAim2D,createBidiAnimator,shapeBidiLine,createCurveSampler,createFontShaper,createGlyphAnimator,glyphsOnPath,createInertia,createPathDasher,createPathMotion,createPathOperations,createPathTwist,createPathZigzag,shutterSamples,createTextItemizer,remapTime,posterizeTime,sampleSignalAtTime,createSpeedRamp} from './advanced.ts';
