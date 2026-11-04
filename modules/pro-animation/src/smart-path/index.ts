// SPDX-License-Identifier: Apache-2.0
export {pathToCubics,splitPathContours,joinPathContours,selectPathContours,reorderPathContours,openPathContours,closePathContours} from './geometry.ts';
export {createSmartMorphEngine,createSmartMorphEngineFromKernel,reverseSmartPath,rotateSmartPath,insertPathVertices,resampleSmartPath,prepareSmartMorph,interpolateSmartMorph,morphMatchCost,morphCrossings,morphShapeContexts,morphMetrics,morphVertexPaths} from './kernel.ts';
export type {SmartMorphKernel,SmartMorphFactory,MorphQuery,SmartMorphOptions,PreparedSmartMorph,SmartMorphEngine} from './kernel.ts';
export {normalizePathFill,preparePathFillMesh,drawPathFill} from './fill.ts';
export type {PathFillOptions,PreparedPathFill} from './fill.ts';
