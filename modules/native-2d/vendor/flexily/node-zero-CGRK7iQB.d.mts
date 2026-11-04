import { a as Style, i as MeasureFunc, n as FlexInfo, o as Value, r as Layout, t as BaselineFunc, u as DefaultsPreset } from "./types-CF1ysYmu.mjs";
//#region src/node-zero.d.ts
/** Options for `Node.create()`. */
interface NodeCreateOptions {
  /**
   * Override the active defaults preset for this Node only.
   * Defaults to the module-level preset (set by `createFlexily({ defaults })`
   * or `setDefaultsPreset()`; initially `"yoga"`).
   */
  defaults?: DefaultsPreset;
}
/**
 * A layout node in the flexbox tree.
 */
declare class Node {
  private _parent;
  private _children;
  private _style;
  private _measureFunc;
  private _baselineFunc;
  private _m0?;
  private _m1?;
  private _m2?;
  private _m3?;
  private _lc?;
  private _lcNext;
  private _flexShrinkExplicit;
  private _cqResolve;
  private _minContentRow;
  private _minContentCol;
  private _measureResult;
  private _layoutResult;
  static measureCalls: number;
  static measureCacheHits: number;
  /**
   * Reset measure statistics (call before calculateLayout).
   */
  static resetMeasureStats(): void;
  private _layout;
  private _flex;
  private _frozenQuerySize;
  private _isDirty;
  private _hasNewLayout;
  private _lastCalcW;
  private _lastCalcH;
  private _lastCalcDir;
  /**
   * Create a new layout node.
   *
   * @param options - Optional creation options. Pass `{ defaults: "css" | "yoga" }`
   *   to override the active module-level preset for this Node only.
   * @returns A new Node instance
   * @example
   * ```typescript
   * const root = Node.create();
   * root.setWidth(100);
   * root.setHeight(200);
   *
   * // Per-Node override (test/ad-hoc):
   * const yogaNode = Node.create({ defaults: "yoga" });
   * ```
   */
  static create(options?: NodeCreateOptions): Node;
  constructor(preset?: DefaultsPreset);
  private setStyleValue;
  private setStyleNumber;
  private setStyleBoolean;
  /**
   * Get the number of child nodes.
   *
   * @returns The number of children
   */
  getChildCount(): number;
  /**
   * Get a child node by index.
   *
   * @param index - Zero-based child index
   * @returns The child node at the given index, or undefined if index is out of bounds
   */
  getChild(index: number): Node | undefined;
  /**
   * Get the parent node.
   *
   * @returns The parent node, or null if this is a root node
   */
  getParent(): Node | null;
  /**
   * Insert a child node at the specified index.
   * If the child already has a parent, it will be removed from that parent first.
   * Marks the node as dirty to trigger layout recalculation.
   *
   * @param child - The child node to insert
   * @param index - The index at which to insert the child
   * @example
   * ```typescript
   * const parent = Node.create();
   * const child1 = Node.create();
   * const child2 = Node.create();
   * parent.insertChild(child1, 0);
   * parent.insertChild(child2, 1);
   * ```
   */
  insertChild(child: Node, index: number): void;
  /**
   * Remove a child node from this node.
   * The child's parent reference will be cleared.
   * Marks the node as dirty to trigger layout recalculation.
   * Invalidates layout validity of remaining siblings whose positions may change.
   *
   * @param child - The child node to remove
   */
  removeChild(child: Node): void;
  /** Unlink `child` without touching its cache; insertChild's move path. */
  private detachChild;
  /**
   * Free this node and clean up all references.
   * Removes the node from its parent, clears all children, and removes the measure function.
   * This does not recursively free child nodes.
   */
  free(): void;
  /**
   * Free this node and all descendants recursively.
   * Each node is detached from its parent and cleaned up.
   * Uses iterative traversal to avoid stack overflow on deep trees.
   */
  freeRecursive(): void;
  /**
   * Dispose the node (calls free)
   */
  [Symbol.dispose](): void;
  /**
   * Set a measure function for intrinsic sizing.
   * The measure function is called during layout to determine the node's natural size.
   * Typically used for text nodes or other content that has an intrinsic size.
   * Marks the node as dirty to trigger layout recalculation.
   *
   * @param measureFunc - Function that returns width and height given available space and constraints
   * @example
   * ```typescript
   * const textNode = Node.create();
   * textNode.setMeasureFunc((width, widthMode, height, heightMode) => {
   *   // Measure text and return dimensions
   *   return { width: 50, height: 20 };
   * });
   * ```
   */
  setMeasureFunc(measureFunc: MeasureFunc): void;
  /**
   * Remove the measure function from this node.
   * Marks the node as dirty to trigger layout recalculation.
   */
  unsetMeasureFunc(): void;
  /**
   * Check if this node has a measure function.
   *
   * @returns True if a measure function is set
   */
  hasMeasureFunc(): boolean;
  /**
   * Set a baseline function to determine where this node's text baseline is.
   * Used for ALIGN_BASELINE to align text across siblings with different heights.
   *
   * @param baselineFunc - Function that returns baseline offset from top given width and height
   * @example
   * ```typescript
   * textNode.setBaselineFunc((width, height) => {
   *   // For a text node, baseline might be at 80% of height
   *   return height * 0.8;
   * });
   * ```
   */
  setBaselineFunc(baselineFunc: BaselineFunc): void;
  /**
   * Remove the baseline function from this node.
   * Marks the node as dirty to trigger layout recalculation.
   */
  unsetBaselineFunc(): void;
  /**
   * Check if this node has a baseline function.
   *
   * @returns True if a baseline function is set
   */
  hasBaselineFunc(): boolean;
  /**
   * Call the measure function with caching.
   * Uses a 4-entry numeric cache for fast lookup without allocations.
   * Cache is cleared when markDirty() is called.
   *
   * @returns Measured dimensions or null if no measure function
   */
  cachedMeasure(w: number, wm: number, h: number, hm: number): {
    width: number;
    height: number;
  } | null;
  /**
   * Compute the intrinsic min-content size of this node along `direction`.
   *
   * Recursive definition (matches CSS browser behavior):
   *  - Leaf with measureFunc: query the measurer via `MEASURE_MODE_MIN_CONTENT`
   *    on the requested axis (orthogonal axis is UNDEFINED, since min-content
   *    is the smallest size at which the content does not overflow — for
   *    wrappable text this is the longest unbreakable token; for non-wrappable
   *    text this equals naturalWidth).
   *  - Container with children, querying the main axis (== `flexDirection`):
   *      padding + border + sum(child.getMinContent(direction)) + total gap
   *  - Container with children, querying the cross axis:
   *      padding + border + max(child.getMinContent(direction))
   *  - Empty leaf without measureFunc: padding + border only.
   *
   * Cached per-axis within a layout pass (`_minContentRow`, `_minContentCol`);
   * resetLayoutCache() refreshes query-dependent results at the next pass,
   * and markDirty() clears them after style/content changes. The `-1`
   * sentinel marks the cache as empty.
   *
   * `direction` accepts the FLEX_DIRECTION_* constants. Non-row values are
   * treated as column. For padding/border resolution, percentage values are
   * resolved against `containingBlockSize` (parent's content-box width per
   * CSS spec — pass NaN if unknown, in which case percentages resolve to 0).
   *
   * @param direction - FLEX_DIRECTION_ROW or FLEX_DIRECTION_COLUMN
   * @param containingBlockSize - Parent content-box width for percentage
   *                              resolution; defaults to NaN (percentages → 0)
   * @returns Smallest size along `direction` that the node can occupy without
   *          overflowing its content (in points).
   */
  getMinContent(direction: number, containingBlockSize?: number): number;
  /**
   * Internal helper for parent-driven min-content queries that respect CSS
   * §4.5 container-side overrides (overflow != visible → 0 along main axis)
   * and explicit definite sizes. Called only from the recursive container
   * branch of `getMinContent` (parent already filters display:none/absolute).
   *
   * The override logic is parent-direction-dependent (overflow only zeros
   * the *child's* min-content along the parent's main axis), so we can't
   * fold it into the cached self-result — but the cached self-result is
   * still queried via getMinContent below, so we keep the cache hot.
   */
  private _getMinContentForParent;
  /**
   * Check the layout cache for a size computed under the same six constraints
   * (available, containing and allocated, each width and height). Returns the
   * cached size or null.
   *
   * Entries live across passes: `markDirty` clears the node and its ancestors,
   * and a container-query resize or a direction change clears whole subtrees.
   * A DIRTY node answers only from an entry written in the current pass
   * (`layoutGeneration()`), as Yoga's `generationCount` does: its content
   * changed since any older entry, but not since one this pass wrote.
   *
   * Two kinds of entry never answer each other, even under the same key:
   * - an estimate (`exact` false), written by measureNode's shortcut and the
   *   Phase 5/6c flex-basis probes, answers only those callers;
   * - an exact entry (`exact` true), written by a full layoutNode in MEASURE
   *   mode (layout-zero.ts), answers only MEASURE. It also reports
   *   `unknownWidths`, the percentage widths its descent counted, so a hit can
   *   replay that count (#26660).
   * An exact answer to the same key is not the answer an estimator wants: the
   * estimator models how the parent would lay the child out, and an estimate
   * read back where a fresh pass would compute one keeps an incremental pass
   * on the fresh pass's path.
   *
   * NaN dimensions are handled specially via Object.is (NaN === NaN is false, but Object.is(NaN, NaN) is true).
   */
  getCachedLayout(availW: number, availH: number, containingW?: number, containingH?: number, allocatedW?: number, allocatedH?: number, exact?: boolean): {
    width: number;
    height: number;
    approx: boolean;
    unknownWidths: number;
  } | null;
  private cacheEntryAnswers;
  private invalidateLayoutEntries;
  private cacheResult;
  /**
   * Cache a computed layout result under its six constraints and its kind
   * (`exact`, see getCachedLayout), stamped with the current pass. A write to a
   * key and kind already held replaces that entry; a new one overwrites the
   * ring's oldest slot.
   * Zero-allocation: lazily allocates cache entries once, then reuses.
   */
  setCachedLayout(availW: number, availH: number, computedW: number, computedH: number, approx: boolean, containingW?: number, containingH?: number, allocatedW?: number, allocatedH?: number, exact?: boolean, unknownWidths?: number): void;
  /**
   * Clear layout and intrinsic caches for this node and all descendants.
   *
   * `keepLayoutEntries` is the pass-start form (`computeLayout`): layout
   * entries survive into the new pass, because markDirty already cleared every
   * entry whose inputs changed, while the intrinsic lengths below are refreshed
   * as before. Every other caller (a container-query resize, a direction
   * change) clears both.
   *
   * Zero-allocation: invalidates entries (availW = -1) rather than deallocating.
   * Uses iterative traversal to avoid stack overflow on deep trees.
   */
  resetLayoutCache(keepLayoutEntries?: boolean): void;
  /**
   * Check if this node needs layout recalculation.
   *
   * @returns True if the node is dirty and needs layout
   */
  isDirty(): boolean;
  /**
   * Mark this node and all ancestors as dirty.
   * A dirty node needs layout recalculation.
   * This is automatically called by all style setters and tree operations.
   * Uses iterative approach to avoid stack overflow on deep trees.
   */
  markDirty(): void;
  /**
   * Check if this node has new layout results since the last check.
   *
   * @returns True if layout was recalculated since the last call to markLayoutSeen
   */
  hasNewLayout(): boolean;
  /**
   * Mark that the current layout has been seen/processed.
   * Clears the hasNewLayout flag.
   */
  markLayoutSeen(): void;
  /**
   * Register a callback fired between Phase 7b (alignContent) and Phase 8
   * (child layout recursion). The callback runs once per `layoutNode` call
   * on this node; it's the canonical opportunity to mutate child styles
   * before children are recursively laid out, with the parent's frozen
   * "query size" already computed.
   *
   * Pass `null` to clear.
   *
   * @internal A0.0 spike surface — will be replaced by engine-native CQ in A0.1.
   */
  setContainerQueryResolver(callback: (() => void) | null): void;
  /** @internal A0.0 spike — invoked by `layout-zero.ts` only. */
  get cqResolve(): (() => void) | null;
  /**
   * Shallow-merge a `Partial<Style>` over this node's style and mark dirty.
   * Intended for use inside a `setContainerQueryResolver` callback, where the
   * containing parent has just frozen its query size and the engine is about
   * to recurse into child layout.
   *
   * Mutation paths:
   *  - Empty / unchanged overrides → no-op (no `markDirty`, no allocation).
   *  - Single-key common cases (padding/margin) — preserves edge-array identity
   *    (caller is responsible for passing a fresh edge tuple when needed).
   *  - Caller passes ONLY the fields they want changed. Untouched fields keep
   *    their current values.
   *
   * **Important**: this is a thin pass-through onto `_style`. It does NOT call
   * the regular `setX()` setters individually; those exist for ergonomics and
   * also call `markDirty()`. For the spike, we want a single `markDirty()`
   * regardless of how many keys are mutated, so we touch `_style` directly
   * then dirty once.
   *
   * @internal A0.0 spike surface — will be replaced by engine-native CQ in A0.1.
   */
  setContainerQueryStyle(overrides: Partial<Style>): void;
  /**
   * Calculate layout for this node and all descendants.
   * This runs the flexbox layout algorithm to compute positions and sizes.
   * Only recalculates if the node is marked as dirty.
   *
   * @param width - Available width for layout
   * @param height - Available height for layout
   * @param _direction - Text direction (LTR or RTL), defaults to LTR
   * @example
   * ```typescript
   * const root = Node.create();
   * root.setFlexDirection(FLEX_DIRECTION_ROW);
   * root.setWidth(100);
   * root.setHeight(50);
   *
   * const child = Node.create();
   * child.setFlexGrow(1);
   * root.insertChild(child, 0);
   *
   * root.calculateLayout(100, 50, DIRECTION_LTR);
   *
   * // Now you can read computed layout
   * console.log(child.getComputedWidth());
   * ```
   */
  calculateLayout(width?: number, height?: number, direction?: number): void;
  /**
   * Get the computed left position after layout.
   *
   * @returns The left position in points
   */
  getComputedLeft(): number;
  /**
   * Get the computed top position after layout.
   *
   * @returns The top position in points
   */
  getComputedTop(): number;
  /**
   * Get the computed width after layout.
   *
   * @returns The width in points
   */
  getComputedWidth(): number;
  /**
   * Get the computed height after layout.
   *
   * @returns The height in points
   */
  getComputedHeight(): number;
  /**
   * Get the computed right edge position after layout (left + width).
   *
   * @returns The right edge position in points
   */
  getComputedRight(): number;
  /**
   * Get the computed bottom edge position after layout (top + height).
   *
   * @returns The bottom edge position in points
   */
  getComputedBottom(): number;
  /**
   * Get the computed padding for a specific edge after layout.
   * Returns the resolved padding value (percentage and logical edges resolved).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Padding value in points
   */
  getComputedPadding(edge: number): number;
  /**
   * Get the computed margin for a specific edge after layout.
   * Returns the resolved margin value (percentage and logical edges resolved).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Margin value in points
   */
  getComputedMargin(edge: number): number;
  /**
   * Get the computed border width for a specific edge after layout.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Border width in points
   */
  getComputedBorder(edge: number): number;
  get children(): readonly Node[];
  get style(): Style;
  get layout(): Layout;
  get measureFunc(): MeasureFunc | null;
  get baselineFunc(): BaselineFunc | null;
  get flex(): FlexInfo;
  /**
   * Set the width to a number in points or a parsed inline-axis length.
   *
   * @param value - Width in points
   */
  setWidth(value: number | Value): void;
  /**
   * Set the width as a percentage of the parent's width.
   *
   * @param value - Width as a percentage (0-100)
   */
  setWidthPercent(value: number): void;
  /**
   * Set the width to auto (determined by layout algorithm).
   */
  setWidthAuto(): void;
  /**
   * Set the width as a container-query inline-size percentage (A0.1).
   *
   * Resolves at layout time against the nearest CQ ancestor's frozen inline-size.
   * When no CQ ancestor exists, resolves to 0 — same defensive convention as
   * `setWidthPercent` against a NaN parent.
   *
   * Requires the layout engine to advertise `containerQueryUnits` capability —
   * silvery's `requireCapability("containerQueryUnits", ...)` should gate this
   * at the call site for actionable error messages under yoga.
   *
   * @param value - Width as percentage of nearest CQ container's inline-size (0-100)
   */
  setWidthCqi(value: number): void;
  /**
   * Set the width to fit-content mode.
   *
   * CSS fit-content = min(max-content, max(min-content, available-width)).
   * For terminals: min(max-content, available-width) since min-content
   * floor is rarely relevant.
   *
   * The layout algorithm measures unconstrained content width (max-content),
   * then clamps to the available width from the parent.
   */
  setWidthFitContent(): void;
  /**
   * Set the width to snug-content mode.
   *
   * Like fit-content but signals that the consumer wants the tightest
   * possible width (binary-search shrinkwrap). The layout engine treats
   * this identically to fit-content for sizing; the consuming framework
   * (e.g., silvery) can further tighten via its own binary search.
   */
  setWidthSnugContent(): void;
  /**
   * Set the height to a number in points or a parsed block-axis length.
   *
   * @param value - Height in points
   */
  setHeight(value: number | Value): void;
  /**
   * Set the height as a percentage of the parent's height.
   *
   * @param value - Height as a percentage (0-100)
   */
  setHeightPercent(value: number): void;
  /**
   * Set the height as a container-query inline-size percentage (A0.1).
   *
   * In Phase 1 (inline-only cqi), height-as-cqi still resolves against the
   * CQ container's **inline** size — this matches CSS where `height: 50cqi`
   * means "50% of container inline-size, expressed as a height". Block-size
   * units (`cqb`) arrive in a later phase.
   *
   * @param value - Height as percentage of nearest CQ container's inline-size (0-100)
   */
  setHeightCqi(value: number): void;
  /**
   * Set the height to auto (determined by layout algorithm).
   */
  setHeightAuto(): void;
  /**
   * Set the minimum width in points.
   *
   * @param value - Minimum width in points
   */
  setMinWidth(value: number | Value): void;
  /**
   * Set the minimum width as a percentage of the parent's width.
   *
   * @param value - Minimum width as a percentage (0-100)
   */
  setMinWidthPercent(value: number): void;
  /**
   * Set the minimum height in points.
   *
   * @param value - Minimum height in points
   */
  setMinHeight(value: number | Value): void;
  /**
   * Set the minimum height as a percentage of the parent's height.
   *
   * @param value - Minimum height as a percentage (0-100)
   */
  setMinHeightPercent(value: number): void;
  /**
   * Set the maximum width in points.
   *
   * @param value - Maximum width in points
   */
  setMaxWidth(value: number | Value): void;
  /**
   * Set the maximum width as a percentage of the parent's width.
   *
   * @param value - Maximum width as a percentage (0-100)
   */
  setMaxWidthPercent(value: number): void;
  /**
   * Set the maximum height in points.
   *
   * @param value - Maximum height in points
   */
  setMaxHeight(value: number | Value): void;
  /**
   * Set the maximum height as a percentage of the parent's height.
   *
   * @param value - Maximum height as a percentage (0-100)
   */
  setMaxHeightPercent(value: number): void;
  /**
   * Set the aspect ratio of the node.
   * When set, the node's width/height relationship is constrained.
   * If width is defined, height = width / aspectRatio.
   * If height is defined, width = height * aspectRatio.
   *
   * @param value - Aspect ratio (width/height). Use NaN to unset.
   */
  setAspectRatio(value: number): void;
  /**
   * Set the flex grow factor.
   * Determines how much the node will grow relative to siblings when there is extra space.
   *
   * @param value - Flex grow factor (typically 0 or 1+)
   * @example
   * ```typescript
   * const child = Node.create();
   * child.setFlexGrow(1); // Will grow to fill available space
   * ```
   */
  setFlexGrow(value: number): void;
  /**
   * Set the flex shrink factor.
   * Determines how much the node will shrink relative to siblings when there is insufficient space.
   *
   * @param value - Flex shrink factor (default is 1)
   */
  setFlexShrink(value: number): void;
  /**
   * Internal: has the consumer explicitly called `setFlexShrink()`?
   *
   * Used by layout-zero.ts to gate the overflow-container flexShrink
   * override (CSS §4.5 bridge). When `true`, the override is suppressed —
   * the user's value (including an explicit 0 for "rigid") is honored.
   * When `false`, the override may force shrink≥1 for overflow containers
   * to bridge Yoga's `flexShrink:0` default to CSS-spec shrinking.
   *
   * Not in the public API surface — adapters and consumers shouldn't
   * depend on this distinction. See bead
   * km-silvercode.layout-corrupt-during-stream-with-queue.
   */
  hasExplicitFlexShrink(): boolean;
  /**
   * Set the flex basis to a number in points or a parsed length.
   * The initial size of the node before flex grow/shrink is applied.
   *
   * @param value - Flex basis in points
   */
  setFlexBasis(value: number | Value): void;
  /**
   * Set the flex basis as a percentage of the parent's size.
   *
   * @param value - Flex basis as a percentage (0-100)
   */
  setFlexBasisPercent(value: number): void;
  /**
   * Set the flex basis to auto (based on the node's width/height).
   */
  setFlexBasisAuto(): void;
  /**
   * Set the flex direction (main axis direction).
   *
   * @param direction - FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_ROW_REVERSE, or FLEX_DIRECTION_COLUMN_REVERSE
   * @example
   * ```typescript
   * const container = Node.create();
   * container.setFlexDirection(FLEX_DIRECTION_ROW); // Lay out children horizontally
   * ```
   */
  setFlexDirection(direction: number): void;
  /**
   * Set the flex wrap behavior.
   *
   * @param wrap - WRAP_NO_WRAP, WRAP_WRAP, or WRAP_WRAP_REVERSE
   */
  setFlexWrap(wrap: number): void;
  /**
   * Set how children are aligned along the cross axis.
   *
   * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
   * @example
   * ```typescript
   * const container = Node.create();
   * container.setFlexDirection(FLEX_DIRECTION_ROW);
   * container.setAlignItems(ALIGN_CENTER); // Center children vertically
   * ```
   */
  setAlignItems(align: number): void;
  /**
   * Set how this node is aligned along the parent's cross axis.
   * Overrides the parent's alignItems for this specific child.
   *
   * @param align - ALIGN_AUTO, ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
   */
  setAlignSelf(align: number): void;
  /**
   * Set how lines are aligned in a multi-line flex container.
   * Only affects containers with wrap enabled and multiple lines.
   *
   * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, ALIGN_SPACE_BETWEEN, or ALIGN_SPACE_AROUND
   */
  setAlignContent(align: number): void;
  /**
   * Set how children are distributed along the main axis.
   *
   * @param justify - JUSTIFY_FLEX_START, JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_AROUND, or JUSTIFY_SPACE_EVENLY
   * @example
   * ```typescript
   * const container = Node.create();
   * container.setJustifyContent(JUSTIFY_SPACE_BETWEEN); // Space children evenly with edges at start/end
   * ```
   */
  setJustifyContent(justify: number): void;
  /**
   * Set padding for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Padding as points or a parsed Value
   * @example
   * ```typescript
   * node.setPadding(EDGE_ALL, 10); // Set 10pt padding on all edges
   * node.setPadding(EDGE_HORIZONTAL, 5); // Set 5pt padding on left and right
   * ```
   */
  setPadding(edge: number, value: number | Value): void;
  /**
   * Set padding as a percentage of the parent's width.
   * Per CSS spec, percentage padding always resolves against the containing block's width.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Padding as a percentage (0-100)
   */
  setPaddingPercent(edge: number, value: number): void;
  /**
   * Set margin for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Margin as points or a parsed Value
   * @example
   * ```typescript
   * node.setMargin(EDGE_ALL, 5); // Set 5pt margin on all edges
   * node.setMargin(EDGE_TOP, 10); // Set 10pt margin on top only
   * ```
   */
  setMargin(edge: number, value: number | Value): void;
  /**
   * Set margin as a percentage of the parent's size.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Margin as a percentage (0-100)
   */
  setMarginPercent(edge: number, value: number): void;
  /**
   * Set margin to auto (for centering items with margin: auto).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   */
  setMarginAuto(edge: number): void;
  /**
   * Set border width for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Border width as points or a parsed Value
   */
  setBorder(edge: number, value: number | Value): void;
  /**
   * Set gap between flex items.
   *
   * @param gutter - GUTTER_COLUMN (horizontal gap), GUTTER_ROW (vertical gap), or GUTTER_ALL (both)
   * @param value - Gap size as points or a parsed Value
   * @example
   * ```typescript
   * container.setGap(GUTTER_ALL, 8); // Set 8pt gap between all items
   * container.setGap(GUTTER_COLUMN, 10); // Set 10pt horizontal gap only
   * ```
   */
  setGap(gutter: number, value: number | Value): void;
  /**
   * Set the position type.
   *
   * @param positionType - POSITION_TYPE_STATIC, POSITION_TYPE_RELATIVE, or POSITION_TYPE_ABSOLUTE
   * @example
   * ```typescript
   * node.setPositionType(POSITION_TYPE_ABSOLUTE);
   * node.setPosition(EDGE_LEFT, 10);
   * node.setPosition(EDGE_TOP, 20);
   * ```
   */
  setPositionType(positionType: number): void;
  /**
   * Set position offset for one or more edges.
   * Only applies when position type is ABSOLUTE or RELATIVE.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Position offset in points
   */
  setPosition(edge: number, value: number): void;
  /**
   * Set position offset as a percentage.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Position offset as a percentage of parent's corresponding dimension
   */
  setPositionPercent(edge: number, value: number): void;
  /**
   * Set the display type.
   *
   * @param display - DISPLAY_FLEX or DISPLAY_NONE
   */
  setDisplay(display: number): void;
  /**
   * Set the overflow behavior.
   *
   * @param overflow - OVERFLOW_VISIBLE, OVERFLOW_HIDDEN, or OVERFLOW_SCROLL
   */
  setOverflow(overflow: number): void;
  /**
   * Declare this node as a container-query container (A0.1).
   *
   * When set to `CONTAINER_TYPE_INLINE_SIZE`, the layout engine freezes this
   * node's inline-size during Pass 1 and uses it to resolve descendants'
   * `cqi` / `cqmin` values. Combined with `setContainSize(true)` (forthcoming),
   * the container's size is invariant under CQ branch flips.
   *
   * `CONTAINER_TYPE_NORMAL` (default) opts the node out.
   *
   * @param containerType - CONTAINER_TYPE_NORMAL or CONTAINER_TYPE_INLINE_SIZE
   */
  setContainerType(containerType: number): void;
  /**
   * Set CSS `contain: size` on this node (A0.1).
   *
   * When true, children's intrinsic sizes do NOT propagate into this node's
   * size — the node's inline-size is determined entirely by parent constraints,
   * not by children. Required pairing with `setContainerType(INLINE_SIZE)` to
   * make a CQ container sound: without containSize, child sizes feed back into
   * container size, breaking the two-phase invariance guarantee.
   *
   * Phase 1 implements inline-size containment only (the contained axis matches
   * the CQ query axis). Block-size containment arrives with `cqb` units.
   *
   * @param value - True to enable size containment on this node
   */
  setContainSize(value: boolean): void;
  /**
   * Set fit-width lanes for the single-pass lane-snap algorithm (A0.2).
   *
   * Accepts a list of width entries. Each entry is either a plain number
   * (treated as UNIT_POINT) or a Value object with explicit unit (e.g.
   * `{ value: 100, unit: UNIT_CQI }` for "100cqi").
   *
   * The layout algorithm measures children's max-content unconstrained, picks
   * the smallest lane >= max-content (else the last entry — typically the
   * largest if the array is sorted ascending), and sets the node's inline-size
   * to that lane. Single pass, no React round-trip.
   *
   * Pass `undefined` or an empty array to disable fit-width selection.
   *
   * @param lanes - Width lanes (numbers or Value objects with unit)
   */
  setFitWidth(lanes: readonly (number | {
    value: number;
    unit: number;
  })[] | undefined): void;
  /**
   * Get the node's frozen container-query inline-size from the most recent layout (A0.1).
   *
   * Populated by `layoutNode` during Pass 1 when `style.containerType ===
   * CONTAINER_TYPE_INLINE_SIZE`. Otherwise NaN.
   *
   * Descendants needing to resolve `cqi`/`cqmin` walk up via `findContainerQuerySize`
   * (lands with Pass 2 consumption) — they should NOT read this directly off arbitrary
   * ancestors; the walk picks the nearest finite value.
   *
   * @returns Frozen inline-size in points, or NaN if not a CQ container
   */
  getFrozenQuerySize(): number;
  /**
   * Internal: set the frozen query size during layout. Called by `layoutNode` Pass 1
   * after the node's inline-size is computed but before child layout recursion.
   *
   * Public for the layout module; consumers should never call this directly.
   *
   * @internal
   */
  _setFrozenQuerySize(size: number): void;
  /**
   * Internal: a MEASURE call's query size for its own descent (layout-zero.ts,
   * #26840). Sets the field without the refresh `_setFrozenQuerySize` does,
   * and returns the stored size for `_restoreFrozenQuerySize`.
   *
   * @internal
   */
  _swapFrozenQuerySize(size: number): number;
  /**
   * Internal: put back the size `_swapFrozenQuerySize` returned. Everything
   * the MEASURE descent cached was derived from its own size, so it is
   * refreshed as for a real resize.
   *
   * @internal
   */
  _restoreFrozenQuerySize(stored: number): void;
  private refreshQueryDependents;
  /**
   * Get the width style value.
   *
   * @returns Width value with unit (points, percent, or auto)
   */
  getWidth(): Value;
  /**
   * Get the height style value.
   *
   * @returns Height value with unit (points, percent, or auto)
   */
  getHeight(): Value;
  /**
   * Get the minimum width style value.
   *
   * @returns Minimum width value with unit
   */
  getMinWidth(): Value;
  /**
   * Get the minimum height style value.
   *
   * @returns Minimum height value with unit
   */
  getMinHeight(): Value;
  /**
   * Get the maximum width style value.
   *
   * @returns Maximum width value with unit
   */
  getMaxWidth(): Value;
  /**
   * Get the maximum height style value.
   *
   * @returns Maximum height value with unit
   */
  getMaxHeight(): Value;
  /**
   * Get the aspect ratio.
   *
   * @returns Aspect ratio value (NaN if not set)
   */
  getAspectRatio(): number;
  /**
   * Get the flex grow factor.
   *
   * @returns Flex grow value
   */
  getFlexGrow(): number;
  /**
   * Get the flex shrink factor.
   *
   * @returns Flex shrink value
   */
  getFlexShrink(): number;
  /**
   * Get the flex basis style value.
   *
   * @returns Flex basis value with unit
   */
  getFlexBasis(): Value;
  /**
   * Get the flex direction.
   *
   * @returns Flex direction constant
   */
  getFlexDirection(): number;
  /**
   * Get the flex wrap setting.
   *
   * @returns Flex wrap constant
   */
  getFlexWrap(): number;
  /**
   * Get the align items setting.
   *
   * @returns Align items constant
   */
  getAlignItems(): number;
  /**
   * Get the align self setting.
   *
   * @returns Align self constant
   */
  getAlignSelf(): number;
  /**
   * Get the align content setting.
   *
   * @returns Align content constant
   */
  getAlignContent(): number;
  /**
   * Get the justify content setting.
   *
   * @returns Justify content constant
   */
  getJustifyContent(): number;
  /**
   * Get the padding for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Padding value with unit
   */
  getPadding(edge: number): Value;
  /**
   * Get the margin for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Margin value with unit
   */
  getMargin(edge: number): Value;
  /**
   * Get the border width for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Border width in points
   */
  getBorder(edge: number): number;
  /**
   * Get the position offset for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Position value with unit
   */
  getPosition(edge: number): Value;
  /**
   * Get the position type.
   *
   * @returns Position type constant
   */
  getPositionType(): number;
  /**
   * Get the display type.
   *
   * @returns Display constant
   */
  getDisplay(): number;
  /**
   * Get the overflow setting.
   *
   * @returns Overflow constant
   */
  getOverflow(): number;
  /**
   * Get the gap for column or row.
   *
   * @param gutter - GUTTER_COLUMN or GUTTER_ROW
   * @returns Gap size in points
   */
  getGap(gutter: number): number;
}
//#endregion
export { Node as t };
//# sourceMappingURL=node-zero-CGRK7iQB.d.mts.map