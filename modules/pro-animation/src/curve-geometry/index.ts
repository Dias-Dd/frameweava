// SPDX-License-Identifier: Apache-2.0
export {createCurveGeometry} from './session.ts';
export type {CurveGeometry,CurveGeometryKernel,CurveGeometryFactory,GeometryQuery,GeometrySegment,GeometryPoint} from './session.ts';
export {curveBounds,curveControlBounds,curveSignedArea,curveWindingAt,nearestCurvePoints,curveContact,curveJets,curveExtrema,curveInflections,curveTangentsFrom,curveLineCrossings} from './queries.ts';
export type {GeometryNearest} from './queries.ts';
export {curvePortion,curveSplit,curveMonotonePieces,curveInflectionPieces,curveFlatten,curveQuadraticPieces,curveClipRect} from './pieces.ts';
export type {CurvePiece} from './pieces.ts';
export {curveNormals,curveOsculatingCircles,curveProjectionMotion,curveProjectionLeaders} from './motion.ts';
