/** Stage-safe public typography entry. Node IO and Kit preparation live in the
 * separate /typography/node entry; these are existing algorithms/adapters. */
export {layoutParagraph,createParagraphIndex,prepareParagraphMeshes,createNativeParagraphRenderer,paragraphMetrics,paragraphInkBounds,selectionRects,hitTestParagraph} from './src/text-layout/index.ts';
export type {PreparedParagraphMeshes,ParagraphOptions,ParagraphLayout,NativeParagraphHandle,NativeParagraphDrawOptions} from './src/text-layout/index.ts';
export {createFontShaper,createFontShaperFromKernel} from './src/font-shaping.ts';
export {createTextItemizer,createTextItemizerFromKernel} from './src/text-itemizer.ts';
export {createPathOperations,createPathOperationsFromKernel} from './src/path-operations.ts';
export {createFontExecutionFont,createFontExecutionFontFromKernel} from './src/font-execution/kernel.ts';
