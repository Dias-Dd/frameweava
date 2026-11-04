// SPDX-License-Identifier: Apache-2.0
export {preparePathTextLine,layoutPathText,pathTextTransform,composePathTextFrames,adjustPathTextFrame} from './layout.ts';
export type {LayoutPathTextOptions} from './layout.ts';
export {pathTextInkBounds,pathTextAdvanceQuads,hitTestPathText,pathTextCaret,nearestPathTextCaret,pathTextSelection,pathTextMetrics,pathTextSourceLeaders} from './queries.ts';
export {pathTextTracking,pathTextWordSpacing,pathTextNormalWave,pathTextNormalNoise,pathTextFan,pathTextTaper,pathTextStagger,composePathTextControls,selectPathTextControl} from './controls.ts';
export type {PathTextUnit,PathTextLine,PathTextAdjustment,PathTextControl,PathTextPlacement,PathTextFrame} from './common.ts';
