// SPDX-License-Identifier: Apache-2.0 AND ISC
export {clusterRangeSelector,indexSetSelector,wordRangeSelector,lineSelector,textMatchSelector,distanceSelector,axisSelector,noiseSelector,selectorUnion,selectorIntersection,selectorSubtract,selectorInvert,selectorThreshold,selectorEase,staggerGlyphSelector} from './selectors.ts';
export {glyphTranslate,glyphRotate,glyphScale,glyphOpacity,glyphTracking,composeGlyphTransforms} from './transforms.ts';
export {prepareGlyphMeshes} from './geometry.ts';
export {createNativeGlyphRenderer} from './native.ts';
export type {PreparedGlyphGeometry,PrepareGlyphOptions} from './geometry.ts';
export type {NativeGlyphHandle,NativeGlyphDrawOptions,NativeGlyphEnvironment} from './native.ts';
export type {GlyphSelector,GlyphTransform,GlyphTransformValue,TextGlyphUnit,TextSourceRange} from './common.ts';
