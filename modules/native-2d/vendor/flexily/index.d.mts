import { a as Style, c as createValue, i as MeasureFunc, l as DEFAULT_PRESET, o as Value, r as Layout, s as createDefaultStyle, t as BaselineFunc, u as DefaultsPreset } from "./types-CF1ysYmu.mjs";
import { $ as UNIT_CQMIN, A as GUTTER_ALL, B as MEASURE_MODE_EXACTLY, C as EDGE_START, D as FLEX_DIRECTION_COLUMN_REVERSE, E as FLEX_DIRECTION_COLUMN, F as JUSTIFY_FLEX_START, G as OVERFLOW_VISIBLE, H as MEASURE_MODE_UNDEFINED, I as JUSTIFY_SPACE_AROUND, J as POSITION_TYPE_STATIC, K as POSITION_TYPE_ABSOLUTE, L as JUSTIFY_SPACE_BETWEEN, M as GUTTER_ROW, N as JUSTIFY_CENTER, O as FLEX_DIRECTION_ROW, P as JUSTIFY_FLEX_END, Q as UNIT_CQI, R as JUSTIFY_SPACE_EVENLY, S as EDGE_RIGHT, T as EDGE_VERTICAL, U as OVERFLOW_HIDDEN, V as MEASURE_MODE_MIN_CONTENT, W as OVERFLOW_SCROLL, X as UNIT_CALC, Y as UNIT_AUTO, Z as UNIT_CH, _ as EDGE_ALL, a as ALIGN_FLEX_START, at as UNIT_UNDEFINED, b as EDGE_HORIZONTAL, c as ALIGN_SPACE_EVENLY, ct as WRAP_WRAP_REVERSE, d as CONTAINER_TYPE_NORMAL, et as UNIT_FIT_CONTENT, f as DIRECTION_INHERIT, g as DISPLAY_NONE, h as DISPLAY_FLEX, i as ALIGN_FLEX_END, it as UNIT_SNUG_CONTENT, j as GUTTER_COLUMN, k as FLEX_DIRECTION_ROW_REVERSE, l as ALIGN_STRETCH, m as DIRECTION_RTL, n as ALIGN_BASELINE, nt as UNIT_PERCENT, o as ALIGN_SPACE_AROUND, ot as WRAP_NO_WRAP, p as DIRECTION_LTR, q as POSITION_TYPE_RELATIVE, r as ALIGN_CENTER, rt as UNIT_POINT, s as ALIGN_SPACE_BETWEEN, st as WRAP_WRAP, t as ALIGN_AUTO, tt as UNIT_LH, u as CONTAINER_TYPE_INLINE_SIZE, v as EDGE_BOTTOM, w as EDGE_TOP, x as EDGE_LEFT, y as EDGE_END, z as MEASURE_MODE_AT_MOST } from "./constants-Dz_aFRMf.mjs";
import { t as Node } from "./node-zero-CGRK7iQB.mjs";
//#region src/text-layout.d.ts
/**
 * Text Layout Service — pluggable text measurement for Flexily.
 *
 * The TextLayoutService interface decouples text measurement from the layout engine.
 * Different backends handle different environments:
 * - MonospaceMeasurer: terminal (1 char = 1 cell)
 * - DeterministicTestMeasurer: tests/CI (fixed grapheme widths)
 * - PretextMeasurer: proportional fonts (Canvas measureText)
 *
 * See silvery-internal/design/v05-layout/pretext-integration.md for design rationale.
 */
/** Resolved text style — consumed by both measurement and painting. */
interface ResolvedTextStyle {
  fontShorthand: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  lineHeight: number;
}
/** Input for text preparation. */
interface TextPrepareInput {
  text: string;
  style: ResolvedTextStyle;
  direction?: "auto" | "ltr" | "rtl";
  locale?: string;
}
/** Intrinsic text sizes for flexbox min/max-content. */
interface IntrinsicSizes {
  minContentWidth: number;
  maxContentWidth: number;
}
/** Constraints for text layout. */
interface TextConstraints {
  maxWidth?: number;
  maxHeight?: number;
  maxLines?: number;
  wrap?: "normal" | "anywhere" | "none";
  overflow?: "clip" | "ellipsis";
  shrinkWrap?: boolean;
}
/** A single laid-out line of text. */
interface TextLine {
  text: string;
  width: number;
  startIndex: number;
  endIndex: number;
}
/** Result of laying out prepared text at a specific width. */
interface TextLayout {
  width: number;
  height: number;
  lineCount: number;
  firstBaseline: number;
  lastBaseline: number;
  truncated: boolean;
  lines?: readonly TextLine[];
}
/** Prepared text — measured and segmented, ready for layout at any width. */
interface PreparedText {
  intrinsicSizes(): IntrinsicSizes;
  layout(constraints: TextConstraints, options?: {
    includeLines?: boolean;
  }): TextLayout;
}
/** Pluggable text measurement backend. */
interface TextLayoutService {
  prepare(input: TextPrepareInput): PreparedText;
}
//#endregion
//#region src/create-flexily.d.ts
/** A Node with text content methods. */
interface FlexilyNode extends Node {
  setTextContent(text: string, style?: Partial<ResolvedTextStyle>): void;
  getTextContent(): string | null;
}
/** The composable Flexily engine. */
interface FlexilyEngine {
  createNode(): FlexilyNode;
  calculateLayout(root: FlexilyNode, width?: number, height?: number, direction?: number): void;
  textLayout?: TextLayoutService;
}
/** A plugin that extends or configures the engine. */
type FlexilyPlugin = (engine: FlexilyEngine) => FlexilyEngine;
/**
 * Create a bare Flexily engine — no plugins, just nodes and layout.
 * Add plugins via pipe() for text measurement.
 *
 * @param preset - Defaults preset for `engine.createNode()`. Captured in
 *   closure; no module-level state. Defaults to undefined (uses
 *   {@link DEFAULT_PRESET}).
 */
declare function createBareFlexily(preset?: DefaultsPreset): FlexilyEngine;
/**
 * Apply plugins to an engine, left to right.
 *
 * @example
 * ```typescript
 * const flex = pipe(createBareFlexily(), withMonospace(), withTestMeasurer())
 * ```
 */
declare function pipe(engine: FlexilyEngine, ...plugins: FlexilyPlugin[]): FlexilyEngine;
/** Options for {@link createFlexily}. */
interface FlexilyOptions {
  /** Character width in layout units (default: 1, suitable for terminal cells). */
  charWidth?: number;
  /** Character height in layout units (default: 1). */
  charHeight?: number;
  /**
   * Defaults preset for nodes created via `engine.createNode()`:
   * - `"css"` — `flexShrink: 1`, `alignContent: stretch` (browser-correct, multi-target).
   * - `"yoga"` — `flexShrink: 0`, `alignContent: flex-start` (drop-in replacement
   *   for yoga-layout). This is the current flexily default.
   *
   * Captured in the engine's closure — no module-level state. Bare
   * `Node.create()` is unaffected; use `Node.create({ defaults })` for
   * per-Node overrides.
   */
  defaults?: DefaultsPreset;
}
/**
 * Create a batteries-included Flexily engine.
 *
 * Includes monospace text measurement (1 char = charWidth units).
 * For terminal UIs, the default charWidth/charHeight of 1 maps to terminal cells.
 *
 * @example
 * ```typescript
 * import { createFlexily } from "flexily"
 * const flex = createFlexily()
 * const node = flex.createNode()
 * node.setTextContent("Hello world")
 * flex.calculateLayout(node, 80, 24)
 *
 * // CSS-correct defaults (multi-target):
 * const cssFlex = createFlexily({ defaults: "css" })
 * ```
 */
declare function createFlexily(options?: FlexilyOptions): FlexilyEngine;
//#endregion
//#region src/monospace-measurer.d.ts
/**
 * Create a monospace text measurement service.
 *
 * @param charWidth - Width of each character cell (default: 1 for terminal grids)
 * @param charHeight - Height of each character cell (default: 1 for terminal grids)
 */
declare function createMonospaceMeasurer(charWidth?: number, charHeight?: number): TextLayoutService;
/**
 * Plugin: add monospace text measurement to the engine.
 *
 * @param charWidth - Width per character cell (default: 1)
 * @param charHeight - Height per character cell (default: 1)
 */
declare function withMonospace(charWidth?: number, charHeight?: number): FlexilyPlugin;
//#endregion
//#region src/test-measurer.d.ts
/**
 * Create a deterministic text measurement service for testing.
 *
 * Uses fixed grapheme widths: Latin 0.8, CJK 1.0, emoji 1.8 (relative to fontSize).
 */
declare function createTestMeasurer(): TextLayoutService;
/**
 * Plugin: add deterministic test text measurement to the engine.
 */
declare function withTestMeasurer(): FlexilyPlugin;
//#endregion
//#region src/pretext-measurer.d.ts
/** Pretext API shape (from @chenglou/pretext). Defined here to avoid a hard dependency. */
interface PretextAPI {
  prepare(text: string, font: string): PretextPrepared;
}
interface PretextPrepared {
  layout(maxWidth: number, lineHeight?: number): PretextLayout;
}
interface PretextLayout {
  width: number;
  height: number;
  lines?: Array<{
    text: string;
    width: number;
  }>;
}
/**
 * Create a Pretext-based text measurement service.
 *
 * @param pretext - The pretext module (import from "@chenglou/pretext")
 */
declare function createPretextMeasurer(pretext: PretextAPI): TextLayoutService;
/**
 * Plugin: add Pretext-based proportional text measurement.
 *
 * @param pretext - The pretext module (import from "@chenglou/pretext")
 */
declare function withPretext(pretext: PretextAPI): FlexilyPlugin;
//#endregion
//#region src/length.d.ts
interface LengthScale {
  readonly ch: number;
  readonly lh: number;
}
declare class LengthError extends Error {
  readonly input: string;
  readonly reason: string;
  readonly prop?: string | undefined;
  constructor(input: string, reason: string, prop?: string | undefined);
}
/** Parse once at style set. Changing an adapter's scale requires re-setting its styles. */
declare function parseLength(input: string, scale: LengthScale): Value;
//#endregion
//#region src/layout-stats.d.ts
/**
 * Layout Statistics Counters
 *
 * Mutable counters for debugging and benchmarking.
 * Separated to avoid circular dependencies between layout modules.
 */
declare let layoutNodeCalls: number;
declare let layoutSizingCalls: number;
declare let layoutPositioningCalls: number;
declare let layoutCacheHits: number;
declare function resetLayoutStats(): void;
//#endregion
export { ALIGN_AUTO, ALIGN_BASELINE, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_FLEX_START, ALIGN_SPACE_AROUND, ALIGN_SPACE_BETWEEN, ALIGN_SPACE_EVENLY, ALIGN_STRETCH, type BaselineFunc, CONTAINER_TYPE_INLINE_SIZE, CONTAINER_TYPE_NORMAL, DEFAULT_PRESET, DIRECTION_INHERIT, DIRECTION_LTR, DIRECTION_RTL, DISPLAY_FLEX, DISPLAY_NONE, type DefaultsPreset, EDGE_ALL, EDGE_BOTTOM, EDGE_END, EDGE_HORIZONTAL, EDGE_LEFT, EDGE_RIGHT, EDGE_START, EDGE_TOP, EDGE_VERTICAL, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_COLUMN_REVERSE, FLEX_DIRECTION_ROW, FLEX_DIRECTION_ROW_REVERSE, type FlexilyEngine, type FlexilyNode, type FlexilyOptions, type FlexilyPlugin, GUTTER_ALL, GUTTER_COLUMN, GUTTER_ROW, type IntrinsicSizes, JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_FLEX_START, JUSTIFY_SPACE_AROUND, JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_EVENLY, type Layout, LengthError, type LengthScale, MEASURE_MODE_AT_MOST, MEASURE_MODE_EXACTLY, MEASURE_MODE_MIN_CONTENT, MEASURE_MODE_UNDEFINED, type MeasureFunc, Node, OVERFLOW_HIDDEN, OVERFLOW_SCROLL, OVERFLOW_VISIBLE, POSITION_TYPE_ABSOLUTE, POSITION_TYPE_RELATIVE, POSITION_TYPE_STATIC, type PreparedText, type PretextAPI, type PretextLayout, type PretextPrepared, type ResolvedTextStyle, type Style, type TextConstraints, type TextLayout, type TextLayoutService, type TextLine, type TextPrepareInput, UNIT_AUTO, UNIT_CALC, UNIT_CH, UNIT_CQI, UNIT_CQMIN, UNIT_FIT_CONTENT, UNIT_LH, UNIT_PERCENT, UNIT_POINT, UNIT_SNUG_CONTENT, UNIT_UNDEFINED, type Value, WRAP_NO_WRAP, WRAP_WRAP, WRAP_WRAP_REVERSE, createBareFlexily, createDefaultStyle, createFlexily, createMonospaceMeasurer, createPretextMeasurer, createTestMeasurer, createValue, layoutCacheHits, layoutNodeCalls, layoutPositioningCalls, layoutSizingCalls, parseLength, pipe, resetLayoutStats, withMonospace, withPretext, withTestMeasurer };
//# sourceMappingURL=index.d.mts.map