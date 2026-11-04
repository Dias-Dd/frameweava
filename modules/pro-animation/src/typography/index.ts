// SPDX-License-Identifier: Apache-2.0
export {createFontInspector,readFontMetrics,readFontAxes,resolveFontLocation,mapFontCharacters,mapFontVariationSequences,readGlyphMetrics,fontCoverageReport,chooseFontForRun,prepareFontFallback,fontLineBox,fontDecoration,measureFontKerning} from './fonts.ts';
export type {FontMetadataKernel,FontMetadataFactory,InspectedFont,FontGlobalMetrics,FontAxis,FontCharacter,FontVariant,FontGlyphMetrics,FontQuery} from './fonts.ts';
export {alignParagraphLines,spaceParagraphWords,trackParagraphClusters,justifyParagraphLines,setParagraphLeading,shiftParagraphBaseline,snapParagraphBaselines,indentParagraphLines,flowParagraphColumns,fitParagraphBox,paragraphLayoutTransform} from './layout.ts';
