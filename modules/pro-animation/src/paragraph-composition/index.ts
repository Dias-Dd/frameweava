// Independent Agent-2 entry. Public root/R1 identity/pins remain Main-owned.
export {solveJustification} from './fit.ts';
export type {JustificationVariable,JustificationFit} from './fit.ts';
export {optimizeParagraphBreaks} from './breaks.ts';
export type {LineCandidate,ParagraphBreakOptions} from './breaks.ts';
export {unicodeJoiningType} from './joining.ts';
export type {JoiningType} from './joining.ts';
export {shapeKashidaRun,kashidaOpportunities} from './kashida.ts';
export type {KashidaRun,KashidaInsertion} from './kashida.ts';
export {composeParagraph} from './compose.ts';
export type {ParagraphCompositionOptions,ComposedParagraph} from './compose.ts';
export type {CompositionSpacing,AdjustmentRange} from './policies.ts';
export {createNativeComposedText} from './native.ts';
export type {NativeComposedTextOptions} from './native.ts';
