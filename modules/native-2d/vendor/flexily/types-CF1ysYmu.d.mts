//#region src/defaults.d.ts
/**
 * Flexily defaults preset — `"css"` vs `"yoga"`.
 *
 * Flexily's default style sits between CSS and Yoga: row direction (CSS), but
 * `flexShrink: 0` and `alignContent: flex-start` (Yoga). This module exposes a
 * preset selector so consumers can opt into either pure-CSS or pure-Yoga
 * defaults explicitly via `createFlexily({ defaults })` or
 * `Node.create({ defaults })`.
 *
 * - `"css"` — flexShrink: 1, alignContent: stretch (browser-correct, multi-target)
 * - `"yoga"` — flexShrink: 0, alignContent: flex-start (drop-in replacement for
 *   yoga-layout)
 *
 * No module-level state: presets are passed explicitly. The `createFlexily`
 * engine captures its preset in a closure so every `engine.createNode()` call
 * inherits it without relying on global state.
 *
 * Static default (when no preset is passed) is currently `"yoga"` to preserve
 * existing behavior. Phase 6 of the migration (`km-silvery.flexshrink-default`)
 * flips this static default to `"css"`.
 */
type DefaultsPreset = "css" | "yoga";
/** Static default preset. Phase 6 flips this to `"css"`. */
declare const DEFAULT_PRESET: DefaultsPreset;
//#endregion
//#region src/types.d.ts
/**
 * A value with a unit (point, percent, cqi, auto, or calc).
 *
 * For `UNIT_CALC` values, `value` is ignored and `expr` carries the parsed
 * math-function tree (min/max/clamp). Other unit kinds leave `expr` undefined.
 */
interface Value {
  value: number;
  unit: number;
  expr?: MathExpr;
  /** Original parsed input, retained for deferred style/layout diagnostics. */
  source?: string;
}
/**
 * Math-function expression tree (A0.3). Late-bound: evaluated at the same
 * resolveValue call site as plain leaves, against the same `availableSize`
 * and `queryInlineSize`. No epoch crossing.
 *
 *   - `Value` leaves: any non-CALC value (POINT, PERCENT, CQI, CQMIN, etc.)
 *   - `{ fn: "min", args }`: minimum of resolved args
 *   - `{ fn: "max", args }`: maximum of resolved args
 *   - `{ fn: "clamp", args: [min, val, max] }`: clamp val between min and max
 *
 * Nesting is allowed: a `MathExpr` arg can be another `MathExpr` (recursively
 * evaluated) or a `Value` leaf.
 */
type MathExpr = Value | {
  readonly fn: "min";
  readonly args: readonly MathExpr[];
} | {
  readonly fn: "max";
  readonly args: readonly MathExpr[];
} | {
  readonly fn: "clamp";
  readonly args: readonly [MathExpr, MathExpr, MathExpr];
} | {
  readonly op: "+" | "-" | "*" | "/";
  readonly left: MathExpr;
  readonly right: MathExpr;
};
/**
 * Measure function signature for intrinsic sizing.
 * Called by the layout algorithm to determine a node's natural size.
 */
type MeasureFunc = (width: number, widthMode: number, height: number, heightMode: number) => {
  width: number;
  height: number;
};
/**
 * Baseline function signature for baseline alignment.
 * Called by the layout algorithm to determine a node's baseline offset from its top edge.
 * Used with ALIGN_BASELINE to align text baselines across siblings.
 *
 * @param width - The computed width of the node
 * @param height - The computed height of the node
 * @returns The baseline offset from the top of the node (in points)
 */
type BaselineFunc = (width: number, height: number) => number;
/**
 * Per-node flex calculation state for zero-allocation layout.
 *
 * This interface enables the layout engine to avoid heap allocations during
 * layout passes by storing all intermediate calculation state directly on
 * each Node. Fields are mutated (not recreated) each pass.
 *
 * Design rationale:
 * - Eliminates ChildLayout object allocation (previously created per child per pass)
 * - Enables filtered iteration via relativeIndex (avoids temporary array allocation)
 * - Stores line membership for flex-wrap (avoids FlexLine[] allocation)
 *
 * All numeric fields use number (Float64 in V8) for precision. Boolean fields
 * track state that affects the CSS Flexbox algorithm's iterative distribution.
 *
 * @see layout.ts for usage in layoutNode() and distributeFlexSpaceForLine()
 */
interface FlexInfo {
  /** Computed main-axis size after flex distribution */
  mainSize: number;
  /** Original base size before flex distribution (used for weighted shrink) */
  baseSize: number;
  /** Total main-axis margin (non-auto margins only) */
  mainMargin: number;
  /** flex-grow factor from style */
  flexGrow: number;
  /** flex-shrink factor from style */
  flexShrink: number;
  /** Resolved min-width/height constraint on main axis */
  minMain: number;
  /** Resolved max-width/height constraint on main axis (Infinity if none) */
  maxMain: number;
  /** Whether main-start margin is auto (absorbs free space) */
  mainStartMarginAuto: boolean;
  /** Whether main-end margin is auto (absorbs free space) */
  mainEndMarginAuto: boolean;
  /** Resolved main-start margin value (0 if auto, computed later) */
  mainStartMarginValue: number;
  /** Resolved main-end margin value (0 if auto, computed later) */
  mainEndMarginValue: number;
  /** Cached resolved margin values [left, top, right, bottom] */
  marginL: number;
  marginT: number;
  marginR: number;
  marginB: number;
  /** Frozen in flex distribution (clamped to min/max constraint) */
  frozen: boolean;
  /** Line index for flex-wrap (0-based, which line this child belongs to) */
  lineIndex: number;
  /**
   * Relative index for filtered iteration.
   * -1 = absolute positioned or display:none (skip in flex layout)
   * 0+ = index among relative children (participates in flex layout)
   */
  relativeIndex: number;
  /** Computed baseline offset for ALIGN_BASELINE (zero-alloc: avoids per-pass array) */
  baseline: number;
  /**
   * Phase 5 derived this child's base size from `measureNode`, and the answer
   * is an under-estimate because the shrink-wrap shortcut met an overflowing
   * row somewhere below (see layout-measure.ts). Phase 5 re-derives the base
   * size through the real algorithm only if this container will actually
   * distribute from it.
   */
  baseApprox: boolean;
  /**
   * The absolute origin (flow margin-box, as layoutNode's absX/absY) this
   * node's parent passed it in Phase 8, in either mode. Phase 9b re-lays a
   * stretched child at it. The fingerprint's lastAbsX/lastAbsY are not a
   * substitute: a MEASURE call writes no fingerprint (#26840).
   */
  passedAbsX: number;
  passedAbsY: number;
  /** Last availableWidth passed to layoutNode */
  lastAvailW: number;
  /** Last availableHeight passed to layoutNode */
  lastAvailH: number;
  /** @internal Percentage-containing context for the cached layout. */
  lastContainingW: number;
  lastContainingH: number;
  /** @internal Parent-committed border-box allocation, or NaN when intrinsic. */
  lastAllocatedW: number;
  lastAllocatedH: number;
  /** Last offsetX passed to layoutNode */
  lastOffsetX: number;
  /** Last offsetY passed to layoutNode */
  lastOffsetY: number;
  /** Last absX passed to layoutNode (affects edge-based rounding) */
  lastAbsX: number;
  /** Last absY passed to layoutNode (affects edge-based rounding) */
  lastAbsY: number;
  /** Whether cached layout is valid (fingerprint matched, not dirty) */
  layoutValid: boolean;
  /**
   * Percentage widths the last LAYOUT pass under this fingerprint counted as
   * content (`unknownBaseWidthCount`). A fingerprint hit replays it, so a row
   * above still sees the #26660 rise the skipped descent would have made.
   */
  lastUnknownWidths: number;
  /** Last direction passed to layoutNode */
  lastDir: number;
}
/**
 * Computed layout result for a node.
 */
interface Layout {
  left: number;
  top: number;
  width: number;
  height: number;
}
/**
 * Internal style properties for a node.
 */
interface Style {
  display: number;
  positionType: number;
  position: [Value, Value, Value, Value, Value, Value];
  flexDirection: number;
  flexWrap: number;
  flexGrow: number;
  flexShrink: number;
  flexBasis: Value;
  alignItems: number;
  alignSelf: number;
  alignContent: number;
  justifyContent: number;
  width: Value;
  height: Value;
  minWidth: Value;
  minHeight: Value;
  maxWidth: Value;
  maxHeight: Value;
  aspectRatio: number;
  margin: [Value, Value, Value, Value, Value, Value];
  padding: [Value, Value, Value, Value, Value, Value];
  border: [Value, Value, Value, Value, Value, Value];
  gap: [Value, Value];
  overflow: number;
  containerType: number;
  containSize: boolean;
  fitWidth: readonly Value[] | undefined;
}
/**
 * Create a default Value (undefined).
 */
declare function createValue(value?: number, unit?: number): Value;
/**
 * Create default style.
 *
 * Two presets:
 * - `"css"` — `flexShrink: 1`, `alignContent: stretch` (browser-correct, multi-target).
 * - `"yoga"` — `flexShrink: 0`, `alignContent: flex-start` (drop-in for yoga-layout).
 *
 * `flexDirection` is `row` in both presets. Yoga's native default is `column`,
 * but flexily diverged to `row` (CSS-correct) before this preset system existed
 * and consumers have built around that. The "yoga" preset preserves Yoga's
 * `flexShrink: 0` + `alignContent: flex-start` divergences without flipping
 * direction. Strict-Yoga consumers can call `setFlexDirection(COLUMN)` per-tree.
 *
 * If `preset` is omitted, the module-level current preset is used (set via
 * `setDefaultsPreset()` or `createFlexily({ defaults })`). Default is `"yoga"`.
 */
declare function createDefaultStyle(preset?: DefaultsPreset): Style;
//#endregion
export { Style as a, createValue as c, MeasureFunc as i, DEFAULT_PRESET as l, FlexInfo as n, Value as o, Layout as r, createDefaultStyle as s, BaselineFunc as t, DefaultsPreset as u };
//# sourceMappingURL=types-CF1ysYmu.d.mts.map