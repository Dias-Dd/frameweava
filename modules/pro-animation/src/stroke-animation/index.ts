// SPDX-License-Identifier: Apache-2.0
export {constantStrokeWidth,rampStrokeWidth,taperStrokeWidth,bellStrokeWidth,waveStrokeWidth,noiseStrokeWidth,knotStrokeWidth,addStrokeWidths,multiplyStrokeWidth,clampStrokeWidth,remapStrokeWidth,solidStrokeInk,gradientStrokeInk,reverseStrokeInk,repeatStrokeInk,fadeStrokeInk,mixStrokeInks} from './profiles.ts';
export type {StrokeWidth,StrokeInk,StrokeInkStop,StrokeColor} from './profiles.ts';
export {sampleStrokePath,createStrokeLocator,prepareStrokeMesh,strokeMeshBounds,hitTestStrokeMesh} from './geometry.ts';
export type {StrokeCenterline,StrokeSample,PreparedStrokeMesh} from './geometry.ts';
export {createNativeStrokeRenderer} from './native.ts';
export type {NativeStrokeEnvironment,NativeStrokeOptions,NativeStrokeHandle} from './native.ts';
