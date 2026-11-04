// SPDX-License-Identifier: Apache-2.0
export {unicodeLineBreaks,textGraphemes,textWords} from './breaks.ts';
export type {TextSegment} from './breaks.ts';
export {layoutParagraph} from './layout.ts';
export type {ParagraphLayout,ParagraphFlow,ParagraphOptions,ParagraphItemizer} from './layout.ts';
export {createParagraphIndex,paragraphMetrics,paragraphInkBounds,lineInkBounds,glyphInkBounds,lineAdvanceBox,rangeInkBounds,glyphsInRange,clustersInRange,linesInRange,runsInRange,paragraphAtIndex,lineAtIndex,clusterAtIndex,wordAtIndex,caretAtIndex,hitTestParagraph,selectionRects,moveCaretVisual,moveCaretVertical} from './queries.ts';
export type {ParagraphIndex,ParagraphCluster,TextCaret,CaretQuery} from './queries.ts';
export {prepareParagraphMeshes,createNativeParagraphRenderer} from './native.ts';
export type {PreparedParagraphMeshes,NativeParagraphDrawOptions,NativeParagraphHandle} from './native.ts';
export type {SourceRange,TextBox} from './common.ts';
