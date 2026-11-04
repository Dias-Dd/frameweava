// Native2D adaptation: layout stays in floating logical px; GPU raster owns pixel coverage.
const layoutCoordinate = value => value;
import { $ as UNIT_CQMIN, A as GUTTER_ALL, B as MEASURE_MODE_EXACTLY, C as EDGE_START, D as FLEX_DIRECTION_COLUMN_REVERSE, E as FLEX_DIRECTION_COLUMN, F as JUSTIFY_FLEX_START, G as OVERFLOW_VISIBLE, H as MEASURE_MODE_UNDEFINED, I as JUSTIFY_SPACE_AROUND, J as POSITION_TYPE_STATIC, K as POSITION_TYPE_ABSOLUTE, L as JUSTIFY_SPACE_BETWEEN, M as GUTTER_ROW, N as JUSTIFY_CENTER, O as FLEX_DIRECTION_ROW, P as JUSTIFY_FLEX_END, Q as UNIT_CQI, R as JUSTIFY_SPACE_EVENLY, S as EDGE_RIGHT, T as EDGE_VERTICAL, U as OVERFLOW_HIDDEN, V as MEASURE_MODE_MIN_CONTENT, W as OVERFLOW_SCROLL, X as UNIT_CALC, Y as UNIT_AUTO, Z as UNIT_CH, _ as EDGE_ALL, a as ALIGN_FLEX_START, at as UNIT_UNDEFINED, b as EDGE_HORIZONTAL, c as ALIGN_SPACE_EVENLY, ct as WRAP_WRAP_REVERSE, d as CONTAINER_TYPE_NORMAL, et as UNIT_FIT_CONTENT, f as DIRECTION_INHERIT, g as DISPLAY_NONE, h as DISPLAY_FLEX, i as ALIGN_FLEX_END, it as UNIT_SNUG_CONTENT, j as GUTTER_COLUMN, k as FLEX_DIRECTION_ROW_REVERSE, l as ALIGN_STRETCH, m as DIRECTION_RTL, n as ALIGN_BASELINE, nt as UNIT_PERCENT, o as ALIGN_SPACE_AROUND, ot as WRAP_NO_WRAP, p as DIRECTION_LTR, q as POSITION_TYPE_RELATIVE, r as ALIGN_CENTER, rt as UNIT_POINT, s as ALIGN_SPACE_BETWEEN, st as WRAP_WRAP, t as ALIGN_AUTO, tt as UNIT_LH, u as CONTAINER_TYPE_INLINE_SIZE, v as EDGE_BOTTOM, w as EDGE_TOP, x as EDGE_LEFT, y as EDGE_END, z as MEASURE_MODE_AT_MOST } from "./constants-CFQ3iRCM.mjs";
import { A as swapUnknownBaseWidthCount, C as pctIndefinite, D as setEdgeValue, E as setEdgeBorder, F as assertLengthAxis, I as parseLength, M as unknownBaseWidthCount, N as widthUsesContent, O as styleValueMatches, P as LengthError, S as isLength, T as resolveValue, _ as edgeValueMatches, a as isReverseDirection, b as getEdgeIndex, c as resolveEdgeValue, d as log, f as applyMinMax, g as edgeBorderMatches, h as countUnknownBaseWidth, i as isEdgeAuto, j as traversalStack, k as styleValuesEqual, l as resolvePositionEdge, m as containsPercent, n as createValue, o as isRowDirection, p as assertEdgeLength, r as DEFAULT_PRESET, s as resolveEdgeBorderValue, t as createDefaultStyle, v as findContainerQuerySize, w as pointSpacing, x as getEdgeValue, y as getEdgeBorderValue } from "./types-DqgAjzOw.mjs";
//#region src/trace.ts
let _trace = null;
/** Get the current trace recorder (null when tracing is disabled). */
function getTrace() {
	return _trace;
}
//#endregion
//#region src/layout-traversal.ts
/**
* Mark subtree as having new layout and clear dirty flags (iterative to avoid stack overflow).
* This is called after layout completes to reset dirty tracking for all nodes.
*/
function markSubtreeLayoutSeen(node) {
	traversalStack.length = 0;
	traversalStack.push(node);
	while (traversalStack.length > 0) {
		const current = traversalStack.pop();
		current["_isDirty"] = false;
		current["_hasNewLayout"] = true;
		for (const child of current.children) traversalStack.push(child);
	}
}
/**
* Invalidate the constraint fingerprint of a node, every descendant, and every
* ancestor (iterative to avoid stack overflow).
*
* One caller: layoutNode's Phase 3a, in LAYOUT mode, when a query container's
* frozen inline size changes. Every fingerprint in the subtree was taken under
* the old size, and cqi descendants must lay out again. A MEASURE call never
* gets here: it swaps the frozen size and restores it, and writes no
* fingerprint for this to clear (#26840).
*
* The ANCESTORS matter as much as the subtree: a node's position is written by
* its parent's Phase 8, so a clean-and-valid ancestor that skips its own layout
* strands every changed position below it. The ancestors above the layoutNode
* call that triggered this are mid-pass and will rewrite their own fingerprints
* on the way out, so clearing them costs nothing.
*/
function invalidateFingerprintsAround(node) {
	traversalStack.length = 0;
	traversalStack.push(node);
	while (traversalStack.length > 0) {
		const current = traversalStack.pop();
		current.flex.layoutValid = false;
		for (const child of current.children) traversalStack.push(child);
	}
	for (let ancestor = node.getParent(); ancestor !== null; ancestor = ancestor.getParent()) ancestor.flex.layoutValid = false;
}
/**
* Count total nodes in tree (iterative to avoid stack overflow).
*/
function countNodes(node) {
	let count = 0;
	traversalStack.length = 0;
	traversalStack.push(node);
	while (traversalStack.length > 0) {
		const current = traversalStack.pop();
		count++;
		for (const child of current.children) traversalStack.push(child);
	}
	return count;
}
/**
* Propagate position delta to all descendants (iterative to avoid stack overflow).
* Used when parent position changes but layout is cached.
*
* Only updates the constraint fingerprint's lastOffset values, NOT layout.top/left.
* layout.top/left store RELATIVE positions (relative to parent's border box),
* so they don't change when an ancestor moves — only the absolute offset
* (tracked via lastOffsetX/Y) changes.
*/
function propagatePositionDelta(node, deltaX, deltaY) {
	traversalStack.length = 0;
	for (const child of node.children) traversalStack.push(child);
	while (traversalStack.length > 0) {
		const current = traversalStack.pop();
		current.flex.lastOffsetX += deltaX;
		current.flex.lastOffsetY += deltaY;
		for (const child of current.children) traversalStack.push(child);
	}
}
//#endregion
//#region src/layout-stats.ts
/**
* Layout Statistics Counters
*
* Mutable counters for debugging and benchmarking.
* Separated to avoid circular dependencies between layout modules.
*/
let layoutNodeCalls = 0;
let measureNodeCalls = 0;
let layoutSizingCalls = 0;
let layoutPositioningCalls = 0;
let layoutCacheHits = 0;
function resetLayoutStats() {
	layoutNodeCalls = 0;
	measureNodeCalls = 0;
	layoutSizingCalls = 0;
	layoutPositioningCalls = 0;
	layoutCacheHits = 0;
}
function incLayoutNodeCalls() {
	layoutNodeCalls++;
}
function incMeasureNodeCalls() {
	measureNodeCalls++;
}
function incLayoutSizingCalls() {
	layoutSizingCalls++;
}
function incLayoutPositioningCalls() {
	layoutPositioningCalls++;
}
function incLayoutCacheHits() {
	layoutCacheHits++;
}
//#endregion
//#region src/layout-measure.ts
/**
* Node Measurement (Intrinsic Sizing)
*
* measureNode() computes a node's width and height without calculating positions.
* It's a lightweight alternative to layoutNode() used during Phase 5 for
* intrinsic sizing of auto-sized container children.
*
* IMPORTANT: measureNode() overwrites layout.width/layout.height as a side effect.
* Callers MUST save/restore these fields around calls to avoid corrupting
* the fingerprint cache (see "Bug 1: measureNode corruption" in CLAUDE.md).
*/
/**
* Measure a node to get its intrinsic size without computing positions.
* This is a lightweight alternative to layoutNode for sizing-only passes.
*
* Sets layout.width and layout.height but NOT layout.left/top.
*
* @param node - The node to measure
* @param availableWidth - Available width (NaN for unconstrained)
* @param availableHeight - Available height (NaN for unconstrained)
* @param direction - Layout direction (LTR or RTL)
* @returns Whether the result is APPROXIMATE — an under-estimate, because the
*   shrink-wrap shortcut met an overflowing row at or below `node`. The caller
*   decides what to do about it; `layout-zero.ts` Phase 5 re-derives such a
*   base size through the real algorithm when it is about to distribute from
*   it, and keeps the approximation when it is not. See the block below.
*/
function measureNode(node, availableWidth, availableHeight, direction) {
	incMeasureNodeCalls();
	const style = node.style;
	const layout = node.layout;
	const queryInlineSize = node.getParent() === null ? availableWidth : findContainerQuerySize(node);
	if (style.display === 1) {
		layout.width = 0;
		layout.height = 0;
		return false;
	}
	const marginLeft = resolveEdgeValue(style.margin, 0, style.flexDirection, availableWidth, direction, queryInlineSize, "margin");
	const marginTop = resolveEdgeValue(style.margin, 1, style.flexDirection, availableWidth, direction, queryInlineSize, "margin");
	const marginRight = resolveEdgeValue(style.margin, 2, style.flexDirection, availableWidth, direction, queryInlineSize, "margin");
	const marginBottom = resolveEdgeValue(style.margin, 3, style.flexDirection, availableWidth, direction, queryInlineSize, "margin");
	const paddingLeft = resolveEdgeValue(style.padding, 0, style.flexDirection, availableWidth, direction, queryInlineSize, "padding");
	const paddingTop = resolveEdgeValue(style.padding, 1, style.flexDirection, availableWidth, direction, queryInlineSize, "padding");
	const paddingRight = resolveEdgeValue(style.padding, 2, style.flexDirection, availableWidth, direction, queryInlineSize, "padding");
	const paddingBottom = resolveEdgeValue(style.padding, 3, style.flexDirection, availableWidth, direction, queryInlineSize, "padding");
	const borderLeft = resolveEdgeBorderValue(style.border, 0, style.flexDirection, direction, queryInlineSize);
	const borderTop = resolveEdgeBorderValue(style.border, 1, style.flexDirection, direction, queryInlineSize);
	const borderRight = resolveEdgeBorderValue(style.border, 2, style.flexDirection, direction, queryInlineSize);
	const borderBottom = resolveEdgeBorderValue(style.border, 3, style.flexDirection, direction, queryInlineSize);
	let nodeWidth;
	if (!widthUsesContent(style.width, availableWidth)) nodeWidth = resolveValue(style.width, availableWidth, queryInlineSize);
	else if (Number.isNaN(availableWidth)) nodeWidth = NaN;
	else nodeWidth = availableWidth - marginLeft - marginRight;
	nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth, queryInlineSize);
	let nodeHeight;
	if (isLength(style.height.unit)) nodeHeight = resolveValue(style.height, availableHeight, queryInlineSize);
	else if (Number.isNaN(availableHeight)) nodeHeight = NaN;
	else nodeHeight = availableHeight - marginTop - marginBottom;
	const aspectRatio = style.aspectRatio;
	if (!Number.isNaN(aspectRatio) && aspectRatio > 0) {
		const widthIsAuto = Number.isNaN(nodeWidth) || widthUsesContent(style.width, availableWidth);
		const heightIsAuto = Number.isNaN(nodeHeight) || style.height.unit === 3;
		if (widthIsAuto && !heightIsAuto && !Number.isNaN(nodeHeight)) {
			nodeWidth = nodeHeight * aspectRatio;
			nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth, queryInlineSize);
		} else if (heightIsAuto && !widthIsAuto && !Number.isNaN(nodeWidth)) nodeHeight = nodeWidth / aspectRatio;
	}
	nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight, queryInlineSize);
	const innerLeft = borderLeft + paddingLeft;
	const innerTop = borderTop + paddingTop;
	const innerRight = borderRight + paddingRight;
	const innerBottom = borderBottom + paddingBottom;
	const minInnerWidth = innerLeft + innerRight;
	const minInnerHeight = innerTop + innerBottom;
	if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) nodeWidth = minInnerWidth;
	if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) nodeHeight = minInnerHeight;
	const contentWidth = Number.isNaN(nodeWidth) ? NaN : Math.max(0, nodeWidth - innerLeft - innerRight);
	const contentHeight = Number.isNaN(nodeHeight) ? NaN : Math.max(0, nodeHeight - innerTop - innerBottom);
	if (node.hasMeasureFunc() && node.children.length === 0) {
		const widthIsAuto = widthUsesContent(style.width, availableWidth) || Number.isNaN(nodeWidth);
		const heightIsAuto = style.height.unit === 3 || style.height.unit === 0 || Number.isNaN(nodeHeight);
		const widthMode = widthIsAuto ? 2 : 1;
		const heightMode = heightIsAuto ? 0 : 1;
		const measureWidth = Number.isNaN(contentWidth) ? Infinity : contentWidth;
		const measureHeight = Number.isNaN(contentHeight) ? Infinity : contentHeight;
		const measured = node.cachedMeasure(measureWidth, widthMode, measureHeight, heightMode);
		if (widthIsAuto) nodeWidth = measured.width + innerLeft + innerRight;
		if (heightIsAuto) nodeHeight = measured.height + innerTop + innerBottom;
		layout.width = layoutCoordinate(nodeWidth);
		layout.height = layoutCoordinate(nodeHeight);
		return false;
	}
	if (node.children.length === 0) {
		if (Number.isNaN(nodeWidth)) nodeWidth = innerLeft + innerRight;
		if (Number.isNaN(nodeHeight)) nodeHeight = innerTop + innerBottom;
		layout.width = layoutCoordinate(nodeWidth);
		layout.height = layoutCoordinate(nodeHeight);
		return false;
	}
	let relativeChildCount = 0;
	for (const c of node.children) {
		if (c.style.display === 1) continue;
		if (c.style.positionType !== 2) relativeChildCount++;
	}
	if (relativeChildCount === 0) {
		if (Number.isNaN(nodeWidth)) nodeWidth = minInnerWidth;
		if (Number.isNaN(nodeHeight)) nodeHeight = minInnerHeight;
		layout.width = layoutCoordinate(nodeWidth);
		layout.height = layoutCoordinate(nodeHeight);
		return false;
	}
	const isRow = isRowDirection(style.flexDirection);
	const mainAxisSize = isRow ? contentWidth : contentHeight;
	const crossAxisSize = isRow ? contentHeight : contentWidth;
	const mainGap = resolveValue(style.gap[isRow ? 0 : 1], isRow ? availableWidth : availableHeight, queryInlineSize);
	let totalMainSize = 0;
	let maxCrossSize = 0;
	let itemCount = 0;
	let approx = false;
	for (const child of node.children) {
		if (child.style.display === 1) continue;
		if (child.style.positionType === 2) continue;
		const childStyle = child.style;
		const childQueryInlineSize = findContainerQuerySize(child);
		const childMarginMain = isRow ? resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") : resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
		const childMarginCross = isRow ? resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") : resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
		const childAvailW = isRow ? NaN : crossAxisSize;
		const childAvailH = isRow ? crossAxisSize : NaN;
		let measuredW = 0;
		let measuredH = 0;
		const cached = child.getCachedLayout(childAvailW, childAvailH);
		if (cached) {
			incLayoutCacheHits();
			if (cached.approx) approx = true;
		} else {
			const savedW = child.layout.width;
			const savedH = child.layout.height;
			const childApprox = measureNode(child, childAvailW, childAvailH, direction);
			measuredW = child.layout.width;
			measuredH = child.layout.height;
			child.layout.width = savedW;
			child.layout.height = savedH;
			child.setCachedLayout(childAvailW, childAvailH, measuredW, measuredH, childApprox);
			if (childApprox) approx = true;
		}
		const childMainSize = cached ? isRow ? cached.width : cached.height : isRow ? measuredW : measuredH;
		const childCrossSize = cached ? isRow ? cached.height : cached.width : isRow ? measuredH : measuredW;
		totalMainSize += childMainSize + childMarginMain;
		maxCrossSize = Math.max(maxCrossSize, childCrossSize + childMarginCross);
		itemCount++;
	}
	if (itemCount > 1) totalMainSize += mainGap * (itemCount - 1);
	if (isRow && mainAxisSize > 0 && totalMainSize > mainAxisSize) approx = true;
	if (Number.isNaN(nodeWidth)) nodeWidth = (isRow ? totalMainSize : maxCrossSize) + innerLeft + innerRight;
	if (Number.isNaN(nodeHeight)) nodeHeight = (isRow ? maxCrossSize : totalMainSize) + innerTop + innerBottom;
	nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth, queryInlineSize);
	nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight, queryInlineSize);
	layout.width = layoutCoordinate(nodeWidth);
	layout.height = layoutCoordinate(nodeHeight);
	return approx;
}
//#endregion
//#region src/layout-flex-lines.ts
/**
* Flex Line Breaking and Space Distribution
*
* Pre-allocated arrays for zero-allocation flex-wrap layout,
* plus the line-breaking and flex-distribution algorithms.
*
* Re-entrancy: A user measureFunc or baselineFunc may synchronously call
* calculateLayout() on a separate tree. saveLineState/restoreLineState
* bracket such nested calls to protect the outer pass's scratch arrays.
*/
/**
* Maximum number of flex lines supported without dynamic allocation.
* If a layout exceeds this, arrays grow automatically (rare edge case).
* 32 lines covers virtually all real-world layouts while using minimal memory.
*/
let MAX_FLEX_LINES = 32;
/**
* Pre-allocated array for line cross sizes (reused across layout passes).
* Stores the computed cross-axis size of each flex line.
*/
let _lineCrossSizes = new Float64Array(MAX_FLEX_LINES);
/**
* Pre-allocated array for line cross offsets (reused across layout passes).
* Stores the cross-axis position offset for each flex line.
*/
let _lineCrossOffsets = new Float64Array(MAX_FLEX_LINES);
/**
* Pre-allocated array for line lengths (number of children per line).
* Uint16 supports up to 65535 children per line (more than sufficient).
*/
let _lineLengths = new Uint16Array(MAX_FLEX_LINES);
/**
* Pre-allocated 2D array for children per line.
* Avoids O(n*m) iteration when processing multi-line flex layouts.
* Each slot holds array of Node references for that line.
*/
let _lineChildren = Array.from({ length: MAX_FLEX_LINES }, () => []);
/**
* Pre-allocated array for per-line justify-content start offsets.
* Stores the main-axis starting position for each flex line.
*/
let _lineJustifyStarts = new Float64Array(MAX_FLEX_LINES);
/**
* Pre-allocated array for per-line item spacing (justify-content gaps).
* Stores the spacing between items for each flex line.
*/
let _lineItemSpacings = new Float64Array(MAX_FLEX_LINES);
/**
* Grow pre-allocated line arrays if needed.
* Called when a layout has more lines than current capacity.
* This is rare (>32 lines) and acceptable as a one-time allocation.
*/
function growLineArrays(needed) {
	const newSize = Math.max(needed, MAX_FLEX_LINES * 2);
	MAX_FLEX_LINES = newSize;
	_lineCrossSizes = new Float64Array(newSize);
	_lineCrossOffsets = new Float64Array(newSize);
	_lineLengths = new Uint16Array(newSize);
	_lineJustifyStarts = new Float64Array(newSize);
	_lineItemSpacings = new Float64Array(newSize);
	while (_lineChildren.length < newSize) _lineChildren.push([]);
}
/** Current re-entrancy depth. 0 = outermost (no save needed). */
let _layoutDepth = 0;
let _generationCounter = 0;
let _generation = 0;
/** The pass that cache writes are stamped with and dirty-node reads must match. */
function layoutGeneration() {
	return _generation;
}
/** Start a pass's generation; returns the outer pass's, for exitLayoutGeneration. */
function enterLayoutGeneration() {
	const outer = _generation;
	_generation = ++_generationCounter;
	return outer;
}
/** Restore the outer pass's generation (the value enterLayoutGeneration returned). */
function exitLayoutGeneration(outer) {
	_generation = outer;
}
/**
* Enter a layout pass. If re-entrant (depth > 0), saves current line state.
* @returns The saved state (to pass to restoreLineState), or null at depth 0.
*/
function enterLayout() {
	if (_layoutDepth++ === 0) return null;
	return {
		crossSizes: _lineCrossSizes.slice(),
		crossOffsets: _lineCrossOffsets.slice(),
		lengths: _lineLengths.slice(),
		justifyStarts: _lineJustifyStarts.slice(),
		itemSpacings: _lineItemSpacings.slice(),
		children: _lineChildren.map((arr) => arr.slice()),
		maxLines: MAX_FLEX_LINES
	};
}
/**
* Exit a layout pass. If re-entrant, restores saved line state.
* @param saved - The state returned by enterLayout (null at depth 0).
*/
function exitLayout(saved) {
	_layoutDepth--;
	if (!saved) return;
	MAX_FLEX_LINES = saved.maxLines;
	_lineCrossSizes = saved.crossSizes;
	_lineCrossOffsets = saved.crossOffsets;
	_lineLengths = saved.lengths;
	_lineJustifyStarts = saved.justifyStarts;
	_lineItemSpacings = saved.itemSpacings;
	_lineChildren = saved.children;
}
/**
* Epsilon value for floating point comparisons in flex distribution.
* Used to determine when remaining space is negligible and iteration should stop.
*/
const EPSILON_FLOAT = .001;
/**
* Break children into flex lines based on available main-axis space.
* Zero-allocation: Sets child.flex.lineIndex directly, uses pre-allocated _lineStarts/_lineLengths.
*
* @param parent - Parent node whose children to wrap
* @param relativeCount - Number of relative children (those with flex.relativeIndex >= 0)
* @param mainAxisSize - Available main-axis space (NaN for unconstrained)
* @param mainGap - Gap between items on main axis
* @param wrap - Wrap mode (WRAP_NO_WRAP, WRAP_WRAP, WRAP_WRAP_REVERSE)
* @returns Number of lines created
*/
function breakIntoLines(parent, relativeCount, mainAxisSize, mainGap, wrap) {
	if (wrap === 0 || Number.isNaN(mainAxisSize) || relativeCount === 0) {
		const lineArr = _lineChildren[0];
		let idx = 0;
		for (const child of parent.children) if (child.flex.relativeIndex >= 0) {
			child.flex.lineIndex = 0;
			lineArr[idx++] = child;
		}
		lineArr.length = idx;
		_lineLengths[0] = relativeCount;
		_lineCrossSizes[0] = 0;
		_lineCrossOffsets[0] = 0;
		return 1;
	}
	let lineIndex = 0;
	let lineMainSize = 0;
	let lineChildCount = 0;
	let lineChildIdx = 0;
	for (const child of parent.children) {
		if (child.flex.relativeIndex < 0) continue;
		const flex = child.flex;
		const childMainSize = Math.max(flex.minMain, Math.min(flex.maxMain, flex.baseSize)) + flex.mainMargin;
		const gapIfNotFirst = lineChildCount > 0 ? mainGap : 0;
		if (lineChildCount > 0 && lineMainSize + gapIfNotFirst + childMainSize > mainAxisSize) {
			_lineChildren[lineIndex].length = lineChildIdx;
			_lineLengths[lineIndex] = lineChildCount;
			lineIndex++;
			if (lineIndex >= MAX_FLEX_LINES) growLineArrays(lineIndex + 16);
			lineChildIdx = 0;
			lineMainSize = childMainSize;
			lineChildCount = 1;
		} else {
			lineMainSize += gapIfNotFirst + childMainSize;
			lineChildCount++;
		}
		flex.lineIndex = lineIndex;
		_lineChildren[lineIndex][lineChildIdx++] = child;
	}
	if (lineChildCount > 0) {
		_lineChildren[lineIndex].length = lineChildIdx;
		_lineLengths[lineIndex] = lineChildCount;
		lineIndex++;
	}
	const numLines = lineIndex;
	for (let i = 0; i < numLines; i++) {
		_lineCrossSizes[i] = 0;
		_lineCrossOffsets[i] = 0;
	}
	if (wrap === 2 && numLines > 1) {
		for (let i = 0; i < Math.floor(numLines / 2); i++) {
			const j = numLines - 1 - i;
			const lineI = _lineChildren[i];
			const lineJ = _lineChildren[j];
			const lenI = lineI.length;
			const lenJ = lineJ.length;
			const maxLen = Math.max(lenI, lenJ);
			for (let k = 0; k < maxLen; k++) {
				const hasI = k < lenI;
				const hasJ = k < lenJ;
				const tmpI = hasI ? lineI[k] : null;
				const tmpJ = hasJ ? lineJ[k] : null;
				if (hasJ) lineI[k] = tmpJ;
				if (hasI) lineJ[k] = tmpI;
			}
			lineI.length = lenJ;
			lineJ.length = lenI;
		}
		for (let i = 0; i < numLines; i++) {
			const lc = _lineChildren[i];
			for (let c = 0; c < lc.length; c++) lc[c].flex.lineIndex = i;
		}
	}
	return numLines;
}
/**
* Distribute flex space for a single line of children.
* Implements CSS Flexbox section 9.7: Resolving Flexible Lengths.
*
* Takes pre-collected children array to avoid O(n*m) iteration pattern.
* Previously iterated through ALL parent.children 8 times per line.
*
* @param lineChildren - Pre-collected children for this line (from _lineChildren)
* @param initialFreeSpace - Free space to distribute (positive=grow, negative=shrink)
*/
function distributeFlexSpaceForLine(lineChildren, initialFreeSpace) {
	const isGrowing = initialFreeSpace > 0;
	if (initialFreeSpace === 0) return;
	const childCount = lineChildren.length;
	if (childCount === 0) return;
	if (childCount === 1) {
		const flex = lineChildren[0].flex;
		if (isGrowing ? flex.flexGrow > 0 : flex.flexShrink > 0) {
			const target = flex.baseSize + initialFreeSpace;
			flex.mainSize = Math.max(flex.minMain, Math.min(flex.maxMain, target));
		}
		return;
	}
	let totalBase = 0;
	for (let i = 0; i < childCount; i++) totalBase += lineChildren[i].flex.baseSize;
	const containerInner = initialFreeSpace + totalBase;
	for (let i = 0; i < childCount; i++) lineChildren[i].flex.frozen = false;
	let freeSpace = initialFreeSpace;
	let iterations = 0;
	const maxIterations = childCount + 1;
	while (iterations++ < maxIterations) {
		let totalFlex = 0;
		for (let i = 0; i < childCount; i++) {
			const flex = lineChildren[i].flex;
			if (flex.frozen) continue;
			if (isGrowing) totalFlex += flex.flexGrow;
			else totalFlex += flex.flexShrink * flex.baseSize;
		}
		if (totalFlex === 0) break;
		let effectiveFreeSpace = freeSpace;
		if (isGrowing && totalFlex < 1) effectiveFreeSpace = freeSpace * totalFlex;
		let totalViolation = 0;
		for (let i = 0; i < childCount; i++) {
			const flex = lineChildren[i].flex;
			if (flex.frozen) continue;
			const flexFactor = isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize;
			const ratio = totalFlex > 0 ? flexFactor / totalFlex : 0;
			const target = flex.baseSize + effectiveFreeSpace * ratio;
			const clamped = Math.max(flex.minMain, Math.min(flex.maxMain, target));
			totalViolation += clamped - target;
			flex.mainSize = clamped;
		}
		let anyFrozen = false;
		if (Math.abs(totalViolation) < EPSILON_FLOAT) {
			for (let i = 0; i < childCount; i++) lineChildren[i].flex.frozen = true;
			break;
		} else if (totalViolation > 0) for (let i = 0; i < childCount; i++) {
			const flex = lineChildren[i].flex;
			if (flex.frozen) continue;
			const target = flex.baseSize + (isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize) / totalFlex * effectiveFreeSpace;
			if (flex.mainSize > target + EPSILON_FLOAT) {
				flex.frozen = true;
				anyFrozen = true;
			}
		}
		else for (let i = 0; i < childCount; i++) {
			const flex = lineChildren[i].flex;
			if (flex.frozen) continue;
			const flexFactor = isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize;
			const target = flex.baseSize + flexFactor / totalFlex * effectiveFreeSpace;
			if (flex.mainSize < target - EPSILON_FLOAT) {
				flex.frozen = true;
				anyFrozen = true;
			}
		}
		if (!anyFrozen) break;
		let frozenSpace = 0;
		let unfrozenBase = 0;
		for (let i = 0; i < childCount; i++) {
			const flex = lineChildren[i].flex;
			if (flex.frozen) frozenSpace += flex.mainSize;
			else unfrozenBase += flex.baseSize;
		}
		freeSpace = containerInner - frozenSpace - unfrozenBase;
	}
}
//#endregion
//#region src/layout-zero.ts
/**
* Flexily Layout Algorithm — Main Entry Point
*
* Core flexbox layout computation. This file contains:
* - computeLayout(): top-level entry point
* - layoutNode(): recursive layout algorithm (11 phases)
*
* Helper modules (split for maintainability, zero-allocation preserved):
* - layout-helpers.ts: Edge resolution (margins, padding, borders)
* - layout-traversal.ts: Tree traversal (markSubtreeLayoutSeen, countNodes)
* - layout-flex-lines.ts: Pre-allocated arrays, line breaking, flex distribution
* - layout-measure.ts: Intrinsic sizing (measureNode)
* - layout-stats.ts: Debug/benchmark counters
*
* Based on Planning-nl/flexbox.js reference implementation.
*/
/**
* Why a layoutNode call runs (#26840).
*
* - LAYOUT: the real pass. It writes this node's box, positions every child,
*   and leaves a constraint fingerprint so a later pass can skip it.
* - MEASURE: the size is all the caller wants (Yoga's `performLayout = false`).
*   The call answers from the node's layout cache when it can, and otherwise
*   runs the same phases, but nothing it writes outlives the call except the
*   answer and that cache entry: it writes no fingerprint and no leaf
*   constraint, restores every child box it moved, and never persists a
*   container-query freeze. The caller restores the node's own box.
*/
const LAYOUT = 0;
const MEASURE = 1;
const measureSaveStack = [];
/**
* Compute layout for a node tree.
*/
function computeLayout(root, availableWidth, availableHeight, direction = 1) {
	const saved = enterLayout();
	const outerGeneration = enterLayoutGeneration();
	const outerUnknownBaseWidths = swapUnknownBaseWidthCount(0);
	const outerSaveDepth = measureSaveStack.length;
	try {
		resetLayoutStats();
		getTrace()?.resetCounter();
		root.resetLayoutCache(true);
		layoutNode(root, LAYOUT, availableWidth, availableHeight, 0, 0, 0, 0, direction);
	} finally {
		measureSaveStack.length = outerSaveDepth;
		exitLayoutGeneration(outerGeneration);
		exitLayout(saved);
		if (saved !== null) swapUnknownBaseWidthCount(outerUnknownBaseWidths);
	}
}
function commitsMainAxis(child, isRow, parentMainIsAuto, mainAxisSize) {
	const mainDim = isRow ? child.style.width : child.style.height;
	const childMainIsAuto = (isRow ? widthUsesContent(mainDim, mainAxisSize) : mainDim.unit === 3 || mainDim.unit === 0) && (isRow ? widthUsesContent(child.style.flexBasis, mainAxisSize) : !isLength(child.style.flexBasis.unit));
	return !parentMainIsAuto && !childMainIsAuto || child.flex.flexGrow > 0 && !Number.isNaN(mainAxisSize) || child.hasMeasureFunc() && child.children.length === 0 || child.flex.mainSize !== child.flex.baseSize;
}
function relativeInset(node, horizontal, containing, direction) {
	if (node.style.positionType !== 1) return 0;
	const leading = horizontal ? resolvePositionEdge(node.style.position, 0, direction) : node.style.position[1];
	const trailing = horizontal ? resolvePositionEdge(node.style.position, 2, direction) : node.style.position[3];
	if (leading.unit !== 0) return resolveValue(leading, containing);
	if (trailing.unit !== 0) return -resolveValue(trailing, containing);
	return 0;
}
function borderBoxStart(marginBoxStart, margin, inset) {
	return marginBoxStart + margin + inset;
}
/**
* Re-derive a child's flex base size with the REAL algorithm, for the one case
* `measureNode`'s shrink-wrap shortcut cannot answer: a row whose children
* overflow a definite main size (see layout-measure.ts). Phase 5 calls this
* only for a child measureNode flagged approximate, and only when this
* container is about to distribute from the number.
*
* A MEASURE call (#26840): it leaves the exact size in `node.layout`, which
* the caller save/restores as it does around measureNode, and records it as
* the node's exact cache entry. It leaves no fingerprint and no moved box
* behind, so a clean subtree keeps its fingerprints and the positioning pass
* skips it; a later pass answers from the entry without descending.
*
* No enterLayout/exitLayout bracket: Phase 5 runs before this container
* breaks its own lines, so no live line data is in the module scratch
* arrays, and the nested call is no more exposed than Phase 8's own
* recursion into a child.
*/
function sizeByLayout(node, availableWidth, availableHeight, direction) {
	layoutNode(node, MEASURE, availableWidth, availableHeight, 0, 0, 0, 0, direction);
}
/**
* Layout a node and its children.
*
* @param absX - Absolute flow margin-box X origin, excluding own margin and relative inset
* @param absY - Absolute flow margin-box Y origin, excluding own margin and relative inset
*/
function layoutNode(node, mode, availableWidth, availableHeight, offsetX, offsetY, absX, absY, direction = 1, containingWidth = availableWidth, containingHeight = availableHeight, allocatedWidth = NaN, allocatedHeight = NaN) {
	incLayoutNodeCalls();
	if (mode === MEASURE && node.children.length > 0) incLayoutSizingCalls();
	else incLayoutPositioningCalls();
	log.debug?.("layoutNode called: availW=%d, availH=%d, offsetX=%d, offsetY=%d, absX=%d, absY=%d, children=%d", availableWidth, availableHeight, offsetX, offsetY, absX, absY, node.children.length);
	const _t = getTrace();
	const _tn = _t?.nextNode() ?? 0;
	_t?.layoutEnter(_tn, availableWidth, availableHeight, node.isDirty(), node.children.length);
	const style = node.style;
	const layout = node.layout;
	if (style.display === 1) {
		layout.left = 0;
		layout.top = 0;
		layout.width = 0;
		layout.height = 0;
		return;
	}
	const flex = node.flex;
	const unknownWidthsBefore = unknownBaseWidthCount();
	const measureCacheable = mode === MEASURE && Number.isInteger(absX) && Number.isInteger(absY);
	if (measureCacheable) {
		const cached = node.getCachedLayout(availableWidth, availableHeight, containingWidth, containingHeight, allocatedWidth, allocatedHeight, true);
		if (cached) {
			incLayoutCacheHits();
			_t?.cacheHit(_tn, availableWidth, availableHeight, cached.width, cached.height);
			layout.width = cached.width;
			layout.height = cached.height;
			if (cached.unknownWidths !== 0) swapUnknownBaseWidthCount(unknownBaseWidthCount() + cached.unknownWidths);
			return;
		}
	}
	if (mode === LAYOUT && flex.layoutValid && !node.isDirty() && Object.is(flex.lastAvailW, availableWidth) && Object.is(flex.lastAvailH, availableHeight) && Object.is(flex.lastContainingW, containingWidth) && Object.is(flex.lastContainingH, containingHeight) && Object.is(flex.lastAllocatedW, allocatedWidth) && Object.is(flex.lastAllocatedH, allocatedHeight) && flex.lastDir === direction && flex.lastAbsX === absX && flex.lastAbsY === absY) {
		_t?.fingerprintHit(_tn, availableWidth, availableHeight);
		if (flex.lastUnknownWidths !== 0) swapUnknownBaseWidthCount(unknownBaseWidthCount() + flex.lastUnknownWidths);
		const deltaX = offsetX - flex.lastOffsetX;
		const deltaY = offsetY - flex.lastOffsetY;
		if (deltaX !== 0 || deltaY !== 0) {
			layout.left += deltaX;
			layout.top += deltaY;
			flex.lastOffsetX = offsetX;
			flex.lastOffsetY = offsetY;
			propagatePositionDelta(node, deltaX, deltaY);
		}
		return;
	}
	_t?.fingerprintMiss(_tn, availableWidth, availableHeight, {
		layoutValid: flex.layoutValid,
		isDirty: node.isDirty(),
		sameW: Object.is(flex.lastAvailW, availableWidth),
		sameH: Object.is(flex.lastAvailH, availableHeight),
		sameDir: flex.lastDir === direction,
		sameAbsX: flex.lastAbsX === absX,
		sameAbsY: flex.lastAbsY === absY
	});
	const ownQueryInlineSize = node.getParent() === null ? availableWidth : findContainerQuerySize(node);
	const marginLeft = resolveEdgeValue(style.margin, 0, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "margin");
	const marginTop = resolveEdgeValue(style.margin, 1, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "margin");
	const marginRight = resolveEdgeValue(style.margin, 2, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "margin");
	const marginBottom = resolveEdgeValue(style.margin, 3, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "margin");
	const paddingLeft = resolveEdgeValue(style.padding, 0, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "padding");
	const paddingTop = resolveEdgeValue(style.padding, 1, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "padding");
	const paddingRight = resolveEdgeValue(style.padding, 2, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "padding");
	const paddingBottom = resolveEdgeValue(style.padding, 3, style.flexDirection, availableWidth, direction, ownQueryInlineSize, "padding");
	const borderLeft = resolveEdgeBorderValue(style.border, 0, style.flexDirection, direction, ownQueryInlineSize);
	const borderTop = resolveEdgeBorderValue(style.border, 1, style.flexDirection, direction, ownQueryInlineSize);
	const borderRight = resolveEdgeBorderValue(style.border, 2, style.flexDirection, direction, ownQueryInlineSize);
	const borderBottom = resolveEdgeBorderValue(style.border, 3, style.flexDirection, direction, ownQueryInlineSize);
	const hasAllocatedWidth = Number.isFinite(allocatedWidth);
	if (!hasAllocatedWidth) countUnknownBaseWidth(style.width, availableWidth);
	const hasAllocatedHeight = Number.isFinite(allocatedHeight);
	let nodeWidth;
	const isFitContentWidth = style.width.unit === 4 || style.width.unit === 5;
	if (style.fitWidth !== void 0 && style.fitWidth.length > 0) {
		let maxContent = 0;
		for (const child of node.children) {
			measureNode(child, NaN, NaN, direction);
			maxContent += child.layout.width;
		}
		const gap = style.flexDirection === 2 || style.flexDirection === 3 ? resolveValue(style.gap[0], availableWidth, ownQueryInlineSize) : 0;
		if (node.children.length > 1 && gap > 0) maxContent += gap * (node.children.length - 1);
		maxContent += paddingLeft + paddingRight + borderLeft + borderRight;
		let smallestFit = Infinity;
		let smallestFitValue = NaN;
		for (const lane of style.fitWidth) {
			const resolved = resolveValue(lane, availableWidth, ownQueryInlineSize);
			if (resolved >= maxContent && resolved < smallestFit) {
				smallestFit = resolved;
				smallestFitValue = resolved;
			}
		}
		if (Number.isNaN(smallestFitValue)) {
			const lastLane = style.fitWidth[style.fitWidth.length - 1];
			smallestFitValue = resolveValue(lastLane, availableWidth, ownQueryInlineSize);
		}
		nodeWidth = smallestFitValue;
	} else if (!widthUsesContent(style.width, availableWidth)) nodeWidth = resolveValue(style.width, availableWidth, ownQueryInlineSize);
	else if (Number.isNaN(availableWidth)) nodeWidth = NaN;
	else nodeWidth = availableWidth - marginLeft - marginRight;
	nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, containingWidth, ownQueryInlineSize);
	let nodeHeight;
	if (isLength(style.height.unit)) nodeHeight = resolveValue(style.height, availableHeight, ownQueryInlineSize);
	else if (Number.isNaN(availableHeight)) nodeHeight = NaN;
	else nodeHeight = availableHeight - marginTop - marginBottom;
	const aspectRatio = style.aspectRatio;
	if (!Number.isNaN(aspectRatio) && aspectRatio > 0) {
		const widthIsAuto = Number.isNaN(nodeWidth) || widthUsesContent(style.width, availableWidth);
		const heightIsAuto = Number.isNaN(nodeHeight) || style.height.unit === 3;
		if (widthIsAuto && !heightIsAuto && !Number.isNaN(nodeHeight)) {
			nodeWidth = nodeHeight * aspectRatio;
			nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, containingWidth, ownQueryInlineSize);
		} else if (heightIsAuto && !widthIsAuto && !Number.isNaN(nodeWidth)) nodeHeight = nodeWidth / aspectRatio;
	}
	const earlyHeightBasis = Number.isNaN(nodeHeight) ? availableHeight : containingHeight;
	nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, earlyHeightBasis, ownQueryInlineSize);
	if (hasAllocatedWidth) nodeWidth = allocatedWidth;
	if (hasAllocatedHeight) nodeHeight = allocatedHeight;
	const widthCeiling = Number.isNaN(nodeWidth) ? applyMinMax(Infinity, style.minWidth, style.maxWidth, containingWidth, ownQueryInlineSize) : Infinity;
	const heightCeiling = Number.isNaN(nodeHeight) ? applyMinMax(Infinity, style.minHeight, style.maxHeight, earlyHeightBasis, ownQueryInlineSize) : Infinity;
	if (Number.isFinite(widthCeiling) || Number.isFinite(heightCeiling)) {
		const savedWidth = node.layout.width;
		const savedHeight = node.layout.height;
		const approximate = measureNode(node, nodeWidth, nodeHeight, direction);
		if (Number.isFinite(widthCeiling) && (node.layout.width >= widthCeiling || approximate)) nodeWidth = widthCeiling;
		if (Number.isFinite(heightCeiling) && (node.layout.height >= heightCeiling || approximate)) nodeHeight = heightCeiling;
		node.layout.width = savedWidth;
		node.layout.height = savedHeight;
	}
	const innerLeft = borderLeft + paddingLeft;
	const innerTop = borderTop + paddingTop;
	const innerRight = borderRight + paddingRight;
	const innerBottom = borderBottom + paddingBottom;
	const minInnerWidth = innerLeft + innerRight;
	const minInnerHeight = innerTop + innerBottom;
	if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) nodeWidth = minInnerWidth;
	if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) nodeHeight = minInnerHeight;
	const contentWidth = Number.isNaN(nodeWidth) ? NaN : Math.max(0, nodeWidth - innerLeft - innerRight);
	const contentHeight = Number.isNaN(nodeHeight) ? NaN : Math.max(0, nodeHeight - innerTop - innerBottom);
	const queryFreeze = style.containerType !== 0 || node.getParent() === null ? nodeWidth : NaN;
	let measureQuerySwapped = false;
	let measureQueryOuter = NaN;
	if (mode === MEASURE) {
		if (node.children.length > 0 && !Object.is(node.getFrozenQuerySize(), queryFreeze)) {
			measureQueryOuter = node._swapFrozenQuerySize(queryFreeze);
			measureQuerySwapped = true;
		}
	} else {
		if (!Object.is(node.getFrozenQuerySize(), queryFreeze)) invalidateFingerprintsAround(node);
		node._setFrozenQuerySize(queryFreeze);
	}
	const frozenQueryInlineSize = node.getFrozenQuerySize();
	const childQueryInlineSize = Number.isNaN(frozenQueryInlineSize) ? ownQueryInlineSize : frozenQueryInlineSize;
	const parentPosOffsetX = relativeInset(node, true, containingWidth, direction);
	const parentPosOffsetY = relativeInset(node, false, containingHeight, direction);
	if (mode === LAYOUT && node.children.length === 0) {
		flex.lastAvailW = availableWidth;
		flex.lastAvailH = availableHeight;
		flex.lastDir = direction;
	}
	if (node.hasMeasureFunc() && node.children.length === 0) {
		const widthIsAuto = widthUsesContent(style.width, availableWidth) || Number.isNaN(nodeWidth);
		const widthIsFitContent = isFitContentWidth;
		const heightIsAuto = style.height.unit === 3 || style.height.unit === 0 || Number.isNaN(nodeHeight);
		const widthMode = widthIsAuto || widthIsFitContent ? 2 : 1;
		const heightMode = heightIsAuto ? 0 : 1;
		const measureWidth = Number.isNaN(contentWidth) ? Infinity : contentWidth;
		const measureHeight = Number.isNaN(contentHeight) ? Infinity : contentHeight;
		const measured = node.cachedMeasure(measureWidth, widthMode, measureHeight, heightMode);
		if (widthIsAuto || widthIsFitContent) nodeWidth = measured.width + innerLeft + innerRight;
		if (heightIsAuto) nodeHeight = measured.height + innerTop + innerBottom;
		layout.width = layoutCoordinate(nodeWidth);
		layout.height = layoutCoordinate(nodeHeight);
		layout.left = layoutCoordinate(offsetX + marginLeft);
		layout.top = layoutCoordinate(offsetY + marginTop);
		return;
	}
	if (node.children.length === 0) {
		if (Number.isNaN(nodeWidth) || isFitContentWidth) nodeWidth = innerLeft + innerRight;
		if (Number.isNaN(nodeHeight)) nodeHeight = innerTop + innerBottom;
		layout.width = layoutCoordinate(nodeWidth);
		layout.height = layoutCoordinate(nodeHeight);
		layout.left = layoutCoordinate(offsetX + marginLeft);
		layout.top = layoutCoordinate(offsetY + marginTop);
		return;
	}
	const measureSaveBase = measureSaveStack.length;
	if (mode === MEASURE) for (const child of node.children) {
		const box = child.layout;
		measureSaveStack.push(box.left, box.top, box.width, box.height);
	}
	const isRow = isRowDirection(style.flexDirection);
	const isReverse = isReverseDirection(style.flexDirection);
	const effectiveReverse = isRow ? direction === 2 !== isReverse : isReverse;
	const mainAxisSize = isRow ? contentWidth : contentHeight;
	const crossAxisSize = isRow ? contentHeight : contentWidth;
	const mainGap = resolveValue(style.gap[isRow ? 0 : 1], isRow ? availableWidth : availableHeight, ownQueryInlineSize);
	let totalBaseMain = 0;
	let relativeCount = 0;
	let totalAutoMargins = 0;
	let hasBaselineAlignment = style.alignItems === 5;
	let anyBaseApprox = false;
	let anyFlexGrow = false;
	let anyFlexShrink = false;
	for (const child of node.children) {
		if (child.style.display === 1 || child.style.positionType === 2) {
			child.flex.relativeIndex = -1;
			continue;
		}
		child.flex.relativeIndex = relativeCount++;
		const childStyle = child.style;
		const cflex = child.flex;
		if (childStyle.flexBasis.source !== void 0) assertLengthAxis(childStyle.flexBasis, isRow ? "inline" : "block", "flexBasis");
		const mainStartIndex = isRow ? effectiveReverse ? 2 : 0 : isReverse ? 3 : 1;
		const mainEndIndex = isRow ? effectiveReverse ? 0 : 2 : isReverse ? 1 : 3;
		cflex.mainStartMarginAuto = isEdgeAuto(childStyle.margin, mainStartIndex, style.flexDirection, direction);
		cflex.mainEndMarginAuto = isEdgeAuto(childStyle.margin, mainEndIndex, style.flexDirection, direction);
		cflex.marginL = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
		cflex.marginT = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
		cflex.marginR = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
		cflex.marginB = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
		cflex.mainStartMarginValue = cflex.mainStartMarginAuto ? 0 : isRow ? effectiveReverse ? cflex.marginR : cflex.marginL : isReverse ? cflex.marginB : cflex.marginT;
		cflex.mainEndMarginValue = cflex.mainEndMarginAuto ? 0 : isRow ? effectiveReverse ? cflex.marginL : cflex.marginR : isReverse ? cflex.marginT : cflex.marginB;
		cflex.mainMargin = cflex.mainStartMarginValue + cflex.mainEndMarginValue;
		const minValEarly = isRow ? childStyle.minWidth : childStyle.minHeight;
		const childMainDimEarly = isRow ? childStyle.width : childStyle.height;
		const isFitContentEarly = childMainDimEarly.unit === 4 || childMainDimEarly.unit === 5;
		const autoMinNeedsContent = minValEarly.unit === 3 && childStyle.overflow === 0 && !isFitContentEarly;
		let baseSize = 0;
		let baseApprox = false;
		let contentMinSize = 0;
		if (isLength(childStyle.flexBasis.unit) && (!isRow || !widthUsesContent(childStyle.flexBasis, mainAxisSize))) baseSize = resolveValue(childStyle.flexBasis, mainAxisSize, childQueryInlineSize);
		else {
			const sizeVal = isRow ? childStyle.width : childStyle.height;
			if (isLength(sizeVal.unit) && (!isRow || !widthUsesContent(sizeVal, mainAxisSize))) baseSize = resolveValue(sizeVal, mainAxisSize, childQueryInlineSize);
			else if (child.hasMeasureFunc()) {
				const availCross = crossAxisSize - (isRow ? cflex.marginT + cflex.marginB : cflex.marginL + cflex.marginR);
				const wantMaxContent = childStyle.flexGrow > 0;
				const mW = isRow ? wantMaxContent ? Infinity : Number.isNaN(mainAxisSize) ? Infinity : mainAxisSize : Number.isNaN(availCross) ? Infinity : availCross;
				const mH = isRow ? Number.isNaN(availCross) ? Infinity : availCross : wantMaxContent ? Infinity : Number.isNaN(mainAxisSize) ? Infinity : mainAxisSize;
				const mWMode = isRow ? wantMaxContent ? 0 : 2 : Number.isNaN(availCross) ? 0 : 2;
				const mHMode = isRow ? 0 : wantMaxContent ? 0 : 2;
				const measured = child.cachedMeasure(mW, mWMode, mH, mHMode);
				baseSize = isRow ? measured.width : measured.height;
			} else if (child.children.length > 0) {
				const sizingW = isRow ? NaN : crossAxisSize;
				const sizingH = isRow ? crossAxisSize : NaN;
				const cached = child.getCachedLayout(sizingW, sizingH);
				if (cached) {
					incLayoutCacheHits();
					_t?.cacheHit(_tn, sizingW, sizingH, cached.width, cached.height);
					baseSize = isRow ? cached.width : cached.height;
					baseApprox = cached.approx;
				} else {
					_t?.cacheMiss(_tn, sizingW, sizingH);
					const savedW = child.layout.width;
					const savedH = child.layout.height;
					baseApprox = measureNode(child, sizingW, sizingH, direction);
					const measuredW = child.layout.width;
					const measuredH = child.layout.height;
					child.layout.width = savedW;
					child.layout.height = savedH;
					_t?.measureSaveRestore(_tn, savedW, savedH, measuredW, measuredH);
					baseSize = isRow ? measuredW : measuredH;
					child.setCachedLayout(sizingW, sizingH, measuredW, measuredH, baseApprox);
				}
			} else {
				const parentWidth = isRow ? mainAxisSize : crossAxisSize;
				baseSize = (isRow ? resolveEdgeValue(childStyle.padding, 0, childStyle.flexDirection, parentWidth, direction, childQueryInlineSize, "padding") + resolveEdgeValue(childStyle.padding, 2, childStyle.flexDirection, parentWidth, direction, childQueryInlineSize, "padding") : resolveEdgeValue(childStyle.padding, 1, childStyle.flexDirection, parentWidth, direction, childQueryInlineSize, "padding") + resolveEdgeValue(childStyle.padding, 3, childStyle.flexDirection, parentWidth, direction, childQueryInlineSize, "padding")) + (isRow ? resolveEdgeBorderValue(childStyle.border, 0, childStyle.flexDirection, direction, childQueryInlineSize) + resolveEdgeBorderValue(childStyle.border, 2, childStyle.flexDirection, direction, childQueryInlineSize) : resolveEdgeBorderValue(childStyle.border, 1, childStyle.flexDirection, direction, childQueryInlineSize) + resolveEdgeBorderValue(childStyle.border, 3, childStyle.flexDirection, direction, childQueryInlineSize));
			}
		}
		if (autoMinNeedsContent) {
			if (child.hasMeasureFunc()) {
				const availCross = crossAxisSize - (isRow ? cflex.marginT + cflex.marginB : cflex.marginL + cflex.marginR);
				const mW = isRow ? 0 : Number.isNaN(availCross) ? Infinity : availCross;
				const mH = isRow ? Number.isNaN(availCross) ? Infinity : availCross : 0;
				const mWMode = isRow ? 3 : Number.isNaN(availCross) ? 0 : 2;
				const mHMode = isRow ? Number.isNaN(availCross) ? 0 : 2 : 3;
				const measured = child.cachedMeasure(mW, mWMode, mH, mHMode);
				contentMinSize = isRow ? measured.width : measured.height;
			} else {
				const containingBlock = isRow ? mainAxisSize : crossAxisSize;
				contentMinSize = child.getMinContent(isRow ? 2 : 0, containingBlock);
				let specifiedSize = Infinity;
				if (isLength(childStyle.flexBasis.unit) && (isRow ? !widthUsesContent(childStyle.flexBasis, mainAxisSize) : !pctIndefinite(childStyle.flexBasis, mainAxisSize))) specifiedSize = resolveValue(childStyle.flexBasis, mainAxisSize, childQueryInlineSize);
				else if (isRow ? widthUsesContent(childStyle.flexBasis, mainAxisSize) : childStyle.flexBasis.unit === 3 || childStyle.flexBasis.unit === 0) {
					const sizeVal = isRow ? childStyle.width : childStyle.height;
					if (isLength(sizeVal.unit) && (isRow ? !widthUsesContent(sizeVal, mainAxisSize) : !pctIndefinite(sizeVal, mainAxisSize))) specifiedSize = resolveValue(sizeVal, mainAxisSize, childQueryInlineSize);
				}
				if (specifiedSize !== Infinity) contentMinSize = Math.min(contentMinSize, specifiedSize);
			}
			if (!Number.isNaN(childStyle.aspectRatio) && childStyle.aspectRatio > 0) {
				const crossDim = isRow ? childStyle.height : childStyle.width;
				let crossDefinite = NaN;
				if (isLength(crossDim.unit) && (isRow ? !pctIndefinite(crossDim, crossAxisSize) : !widthUsesContent(crossDim, crossAxisSize))) crossDefinite = resolveValue(crossDim, crossAxisSize, childQueryInlineSize);
				if (!Number.isNaN(crossDefinite)) {
					const transferred = isRow ? crossDefinite * childStyle.aspectRatio : crossDefinite / childStyle.aspectRatio;
					contentMinSize = Math.min(contentMinSize, transferred);
				}
			}
		}
		const minVal = minValEarly;
		const maxVal = isRow ? childStyle.maxWidth : childStyle.maxHeight;
		const isFitContent = isFitContentEarly;
		if (minVal.unit === 3) {
			if (isFitContent) cflex.minMain = 0;
			else {
				let autoMin = childStyle.overflow === 0 ? contentMinSize : 0;
				if (isLength(maxVal.unit) && !pctIndefinite(maxVal, mainAxisSize)) {
					const maxResolved = resolveValue(maxVal, mainAxisSize, childQueryInlineSize);
					if (!Number.isNaN(maxResolved) && maxResolved !== Infinity) autoMin = Math.min(autoMin, maxResolved);
				}
				cflex.minMain = autoMin;
			}
		} else if (minVal.unit !== 0 && !pctIndefinite(minVal, mainAxisSize)) cflex.minMain = resolveValue(minVal, mainAxisSize, childQueryInlineSize);
		else cflex.minMain = 0;
		cflex.maxMain = maxVal.unit !== 0 && !pctIndefinite(maxVal, mainAxisSize) ? resolveValue(maxVal, mainAxisSize, childQueryInlineSize) : Infinity;
		cflex.flexGrow = childStyle.flexGrow;
		let shrink = childStyle.flexShrink;
		const explicitShrink = child.hasExplicitFlexShrink();
		if (!explicitShrink && childStyle.overflow !== 0) shrink = Math.max(shrink, 1);
		if (!explicitShrink && child.hasMeasureFunc() && childStyle.flexGrow > 0) shrink = Math.max(shrink, 1);
		if (isFitContent) shrink = Math.max(shrink, 1);
		cflex.flexShrink = shrink;
		cflex.baseSize = baseSize;
		cflex.mainSize = baseSize;
		cflex.baseApprox = baseApprox;
		if (baseApprox) anyBaseApprox = true;
		if (childStyle.flexGrow > 0) anyFlexGrow = true;
		if (cflex.flexShrink > 0) anyFlexShrink = true;
		cflex.frozen = false;
		totalBaseMain += baseSize + cflex.mainMargin;
		if (cflex.mainStartMarginAuto) totalAutoMargins++;
		if (cflex.mainEndMarginAuto) totalAutoMargins++;
		if (!hasBaselineAlignment && childStyle.alignSelf === 5) hasBaselineAlignment = true;
	}
	if (anyBaseApprox && !isRow) {
		const mainDefinite = !Number.isNaN(mainAxisSize);
		let maxMainCanShrink = false;
		if (!mainDefinite && style.maxHeight.unit !== 0 && !pctIndefinite(style.maxHeight, containingHeight)) maxMainCanShrink = !Number.isNaN(resolveValue(style.maxHeight, containingHeight, ownQueryInlineSize));
		if (mainDefinite && (anyFlexGrow || anyFlexShrink || style.flexWrap !== 0 || style.justifyContent !== 0 || totalAutoMargins > 0) || maxMainCanShrink && anyFlexShrink) {
			const sizingW = crossAxisSize;
			const sizingH = NaN;
			for (const child of node.children) {
				const cflex = child.flex;
				if (cflex.relativeIndex < 0 || !cflex.baseApprox) continue;
				const savedL = child.layout.left;
				const savedT = child.layout.top;
				const savedW = child.layout.width;
				const savedH = child.layout.height;
				sizeByLayout(child, sizingW, sizingH, direction);
				const exactMain = child.layout.height;
				child.layout.left = savedL;
				child.layout.top = savedT;
				child.layout.width = savedW;
				child.layout.height = savedH;
				totalBaseMain += exactMain - cflex.baseSize;
				cflex.baseSize = exactMain;
				cflex.mainSize = exactMain;
				cflex.baseApprox = false;
				const childStyle = child.style;
				const minVal = isRow ? childStyle.minWidth : childStyle.minHeight;
				const mainDim = isRow ? childStyle.width : childStyle.height;
				if (minVal.unit === 3 && childStyle.overflow === 0 && mainDim.unit !== 4 && mainDim.unit !== 5) {
					let exactMin = exactMain;
					const maxVal = isRow ? childStyle.maxWidth : childStyle.maxHeight;
					if (isLength(maxVal.unit) && !pctIndefinite(maxVal, mainAxisSize)) {
						const maxResolved = resolveValue(maxVal, mainAxisSize, childQueryInlineSize);
						if (!Number.isNaN(maxResolved) && maxResolved !== Infinity) exactMin = Math.min(exactMin, maxResolved);
					}
					if (exactMin > cflex.minMain) cflex.minMain = exactMin;
				}
			}
		}
	}
	log.debug?.("layoutNode: node.children=%d, relativeCount=%d", node.children.length, relativeCount);
	if (relativeCount > 0) {
		const numLines = breakIntoLines(node, relativeCount, mainAxisSize, mainGap, style.flexWrap);
		const crossGap = resolveValue(style.gap[isRow ? 1 : 0], isRow ? availableHeight : availableWidth, ownQueryInlineSize);
		for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
			const lineChildren = _lineChildren[lineIdx];
			const lineLength = lineChildren.length;
			if (lineLength === 0) continue;
			let lineTotalBaseMain = 0;
			for (let i = 0; i < lineLength; i++) {
				const c = lineChildren[i];
				lineTotalBaseMain += c.flex.baseSize + c.flex.mainMargin;
			}
			const lineTotalGaps = lineLength > 1 ? mainGap * (lineLength - 1) : 0;
			let effectiveMainSize = mainAxisSize;
			if (Number.isNaN(mainAxisSize)) {
				const maxMainVal = isRow ? style.maxWidth : style.maxHeight;
				const availableMain = isRow ? containingWidth : containingHeight;
				if (maxMainVal.unit !== 0 && !pctIndefinite(maxMainVal, availableMain)) {
					const maxMain = applyMinMax(Infinity, isRow ? style.minWidth : style.minHeight, maxMainVal, availableMain, ownQueryInlineSize);
					if (!Number.isNaN(maxMain) && lineTotalBaseMain + lineTotalGaps > maxMain) effectiveMainSize = maxMain - (isRow ? innerLeft + innerRight : innerTop + innerBottom);
				}
			}
			if (!Number.isNaN(effectiveMainSize)) distributeFlexSpaceForLine(lineChildren, effectiveMainSize - lineTotalBaseMain - lineTotalGaps);
			for (let i = 0; i < lineLength; i++) {
				const f = lineChildren[i].flex;
				f.mainSize = Math.max(f.minMain, Math.min(f.maxMain, f.mainSize));
			}
		}
		for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
			const lineChildren = _lineChildren[lineIdx];
			const lineLength = lineChildren.length;
			if (lineLength === 0) {
				_lineJustifyStarts[lineIdx] = 0;
				_lineItemSpacings[lineIdx] = mainGap;
				continue;
			}
			let lineUsedMain = 0;
			let lineAutoMargins = 0;
			for (let i = 0; i < lineLength; i++) {
				const c = lineChildren[i];
				lineUsedMain += c.flex.mainSize + c.flex.mainMargin;
				if (c.flex.mainStartMarginAuto) lineAutoMargins++;
				if (c.flex.mainEndMarginAuto) lineAutoMargins++;
			}
			const lineGaps = lineLength > 1 ? mainGap * (lineLength - 1) : 0;
			lineUsedMain += lineGaps;
			const lineRemainingSpace = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize - lineUsedMain;
			const lineHasAutoMargins = lineAutoMargins > 0;
			if (lineHasAutoMargins) {
				const autoMarginValue = Math.max(0, lineRemainingSpace) / lineAutoMargins;
				for (let i = 0; i < lineLength; i++) {
					const child = lineChildren[i];
					if (child.flex.mainStartMarginAuto) child.flex.mainStartMarginValue = autoMarginValue;
					if (child.flex.mainEndMarginAuto) child.flex.mainEndMarginValue = autoMarginValue;
				}
			}
			let lineStartOffset = 0;
			let lineItemSpacing = mainGap;
			if (!lineHasAutoMargins) switch (style.justifyContent) {
				case 2:
					lineStartOffset = lineRemainingSpace;
					break;
				case 1:
					lineStartOffset = lineRemainingSpace / 2;
					break;
				case 3:
					if (lineLength > 1 && lineRemainingSpace > 0) lineItemSpacing = mainGap + lineRemainingSpace / (lineLength - 1);
					break;
				case 4:
					if (lineLength > 0 && lineRemainingSpace > 0) {
						const extraSpace = lineRemainingSpace / lineLength;
						lineStartOffset = extraSpace / 2;
						lineItemSpacing = mainGap + extraSpace;
					}
					break;
				case 5: if (lineLength > 0 && lineRemainingSpace > 0) {
					const extraSpace = lineRemainingSpace / (lineLength + 1);
					lineStartOffset = extraSpace;
					lineItemSpacing = mainGap + extraSpace;
				}
			}
			_lineJustifyStarts[lineIdx] = lineStartOffset;
			_lineItemSpacings[lineIdx] = lineItemSpacing;
		}
		const startOffset = _lineJustifyStarts[0];
		const itemSpacing = _lineItemSpacings[0];
		let maxBaseline = 0;
		let baselineZoneHeight = 0;
		const alignItemsIsBaseline = style.alignItems === 5;
		if (hasBaselineAlignment && isRow) {
			let maxChildHeight = 0;
			for (const child of node.children) {
				if (child.flex.relativeIndex < 0) continue;
				const childStyle = child.style;
				const topMargin = child.flex.marginT;
				let childWidth;
				let childHeight;
				const widthDim = childStyle.width;
				const heightDim = childStyle.height;
				if (!widthUsesContent(widthDim, mainAxisSize)) childWidth = resolveValue(widthDim, mainAxisSize, childQueryInlineSize);
				else childWidth = child.flex.mainSize;
				if (isLength(heightDim.unit) && !pctIndefinite(heightDim, crossAxisSize)) childHeight = resolveValue(heightDim, crossAxisSize, childQueryInlineSize);
				else {
					const cached = child.getCachedLayout(child.flex.mainSize, NaN);
					if (cached) {
						incLayoutCacheHits();
						_t?.cacheHit(_tn, child.flex.mainSize, NaN, cached.width, cached.height);
						childWidth = cached.width;
						childHeight = cached.height;
					} else {
						_t?.cacheMiss(_tn, child.flex.mainSize, NaN);
						const savedW = child.layout.width;
						const savedH = child.layout.height;
						const baselineApprox = measureNode(child, child.flex.mainSize, NaN, direction);
						childWidth = child.layout.width;
						childHeight = child.layout.height;
						child.layout.width = savedW;
						child.layout.height = savedH;
						_t?.measureSaveRestore(_tn, savedW, savedH, childWidth, childHeight);
						child.setCachedLayout(child.flex.mainSize, NaN, childWidth, childHeight, baselineApprox);
					}
				}
				if (child.baselineFunc !== null) child.flex.baseline = topMargin + child.baselineFunc(childWidth, childHeight);
				else child.flex.baseline = topMargin + childHeight;
				maxChildHeight = Math.max(maxChildHeight, topMargin + childHeight + child.flex.marginB);
				if (alignItemsIsBaseline || childStyle.alignSelf === 5) maxBaseline = Math.max(maxBaseline, child.flex.baseline);
			}
			baselineZoneHeight = Math.max(maxBaseline, maxChildHeight);
		}
		let cumulativeCrossOffset = 0;
		const isWrapReverse = style.flexWrap === 2;
		for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
			_lineCrossOffsets[lineIdx] = cumulativeCrossOffset;
			const lineLength = _lineChildren[lineIdx].length;
			let maxLineCross = 0;
			for (let i = 0; i < lineLength; i++) {
				const child = _lineChildren[lineIdx][i];
				const childStyle = child.style;
				const crossDim = isRow ? childStyle.height : childStyle.width;
				const crossMarginStart = isRow ? child.flex.marginT : child.flex.marginL;
				const crossMarginEnd = isRow ? child.flex.marginB : child.flex.marginR;
				let childCross = 0;
				if (isLength(crossDim.unit) && (isRow ? !pctIndefinite(crossDim, crossAxisSize) : !widthUsesContent(crossDim, crossAxisSize))) childCross = resolveValue(crossDim, crossAxisSize, childQueryInlineSize);
				else if (child.hasMeasureFunc()) {
					const crossMargin = crossMarginStart + crossMarginEnd;
					const availCross = Number.isNaN(crossAxisSize) ? Infinity : crossAxisSize - crossMargin;
					const childMainSize = child.flex.mainSize;
					const mW = isRow ? childMainSize : availCross;
					const mH = isRow ? availCross : childMainSize;
					const mWMode = Number.isNaN(mW) ? 0 : 2;
					const mHMode = Number.isNaN(mH) ? 0 : 2;
					const measured = child.cachedMeasure(Number.isNaN(mW) ? Infinity : mW, mWMode, Number.isNaN(mH) ? Infinity : mH, mHMode);
					if (measured) childCross = isRow ? measured.height : measured.width;
				} else if (child.children.length > 0) {
					const savedW = child.layout.width;
					const savedH = child.layout.height;
					measureNode(child, NaN, NaN, direction);
					childCross = isRow ? child.layout.height : child.layout.width;
					child.layout.width = savedW;
					child.layout.height = savedH;
				}
				maxLineCross = Math.max(maxLineCross, childCross + crossMarginStart + crossMarginEnd);
			}
			const lineCrossSize = maxLineCross;
			_lineCrossSizes[lineIdx] = lineCrossSize;
			cumulativeCrossOffset += lineCrossSize + crossGap;
		}
		if (!Number.isNaN(crossAxisSize) && numLines > 0) {
			const freeSpace = crossAxisSize - (cumulativeCrossOffset - crossGap);
			switch (style.alignContent) {
				case 3:
					for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += freeSpace;
					break;
				case 2:
					{
						const centerOffset = freeSpace / 2;
						for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += centerOffset;
					}
					break;
				case 6:
					if (freeSpace > 0 && numLines > 1) {
						const gap = freeSpace / (numLines - 1);
						for (let i = 1; i < numLines; i++) _lineCrossOffsets[i] += gap * i;
					}
					break;
				case 7:
					if (freeSpace > 0) {
						const halfGap = freeSpace / (numLines * 2);
						for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += halfGap + halfGap * 2 * i;
					} else {
						const centerOffset = freeSpace / 2;
						for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += centerOffset;
					}
					break;
				case 8:
					if (freeSpace > 0 && numLines > 0) {
						const gap = freeSpace / (numLines + 1);
						for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += gap * (i + 1);
					} else if (freeSpace < 0) {
						const centerOffset = freeSpace / 2;
						for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += centerOffset;
					}
					break;
				case 4: if (freeSpace > 0 && numLines > 0) {
					const extraPerLine = freeSpace / numLines;
					for (let i = 0; i < numLines; i++) {
						_lineCrossSizes[i] += extraPerLine;
						if (i > 0) _lineCrossOffsets[i] = _lineCrossOffsets[i - 1] + _lineCrossSizes[i - 1] + crossGap;
					}
				}
			}
			if (isWrapReverse) {
				let totalLineCrossSize = 0;
				for (let i = 0; i < numLines; i++) totalLineCrossSize += _lineCrossSizes[i];
				totalLineCrossSize += crossGap * (numLines - 1);
				const crossStartOffset = crossAxisSize - totalLineCrossSize;
				for (let i = 0; i < numLines; i++) _lineCrossOffsets[i] += crossStartOffset;
			}
		}
		let savedLineCrossSizes = null;
		let savedLineCrossOffsets = null;
		let savedLineJustifyStarts = null;
		let savedLineItemSpacings = null;
		let savedLine0CrossOffset = 0;
		if (numLines > 1) {
			savedLineCrossSizes = new Float64Array(numLines);
			savedLineCrossOffsets = new Float64Array(numLines);
			savedLineJustifyStarts = new Float64Array(numLines);
			savedLineItemSpacings = new Float64Array(numLines);
			for (let i = 0; i < numLines; i++) {
				savedLineCrossSizes[i] = _lineCrossSizes[i];
				savedLineCrossOffsets[i] = _lineCrossOffsets[i];
				savedLineJustifyStarts[i] = _lineJustifyStarts[i];
				savedLineItemSpacings[i] = _lineItemSpacings[i];
			}
		} else if (numLines === 1) savedLine0CrossOffset = _lineCrossOffsets[0];
		if (node.cqResolve !== null) node.cqResolve();
		let effectiveMainAxisSize = mainAxisSize;
		const mainIsAuto = isRow ? widthUsesContent(style.width, availableWidth) : !isLength(style.height.unit);
		const totalGaps = relativeCount > 1 ? mainGap * (relativeCount - 1) : 0;
		if (effectiveReverse && mainIsAuto) {
			let totalContent = 0;
			for (const child of node.children) {
				if (child.flex.relativeIndex < 0) continue;
				totalContent += child.flex.mainSize + child.flex.mainStartMarginValue + child.flex.mainEndMarginValue;
			}
			totalContent += totalGaps;
			effectiveMainAxisSize = totalContent;
		}
		let mainPos = effectiveReverse ? effectiveMainAxisSize - startOffset : startOffset;
		let currentLineIdx = -1;
		let relIdx = 0;
		let lineChildIdx = 0;
		let currentLineLength = 0;
		let currentItemSpacing = itemSpacing;
		log.debug?.("positioning children: isRow=%s, startOffset=%d, relativeCount=%d, effectiveReverse=%s, numLines=%d", isRow, startOffset, relativeCount, effectiveReverse, numLines);
		for (const child of node.children) {
			if (child.flex.relativeIndex < 0) continue;
			const cflex = child.flex;
			const childStyle = child.style;
			const childLineIdx = cflex.lineIndex;
			if (childLineIdx !== currentLineIdx) {
				currentLineIdx = childLineIdx;
				lineChildIdx = 0;
				currentLineLength = _lineChildren[childLineIdx].length;
				const lineOffset = savedLineJustifyStarts ? savedLineJustifyStarts[childLineIdx] : _lineJustifyStarts[childLineIdx];
				currentItemSpacing = savedLineItemSpacings ? savedLineItemSpacings[childLineIdx] : _lineItemSpacings[childLineIdx];
				mainPos = effectiveReverse ? effectiveMainAxisSize - lineOffset : lineOffset;
			}
			const lineCrossOffset = savedLineCrossOffsets ? savedLineCrossOffsets[childLineIdx] : numLines === 1 ? savedLine0CrossOffset : childLineIdx < MAX_FLEX_LINES ? _lineCrossOffsets[childLineIdx] : 0;
			let childMarginLeft;
			let childMarginTop;
			let childMarginRight;
			let childMarginBottom;
			if (isRow) {
				childMarginLeft = cflex.mainStartMarginAuto && !effectiveReverse ? cflex.mainStartMarginValue : cflex.mainEndMarginAuto && effectiveReverse ? cflex.mainEndMarginValue : cflex.marginL;
				childMarginRight = cflex.mainEndMarginAuto && !effectiveReverse ? cflex.mainEndMarginValue : cflex.mainStartMarginAuto && effectiveReverse ? cflex.mainStartMarginValue : cflex.marginR;
				childMarginTop = cflex.marginT;
				childMarginBottom = cflex.marginB;
			} else {
				childMarginTop = cflex.mainStartMarginAuto && !isReverse ? cflex.mainStartMarginValue : cflex.mainEndMarginAuto && isReverse ? cflex.mainEndMarginValue : cflex.marginT;
				childMarginBottom = cflex.mainEndMarginAuto && !isReverse ? cflex.mainEndMarginValue : cflex.mainStartMarginAuto && isReverse ? cflex.mainStartMarginValue : cflex.marginB;
				childMarginLeft = cflex.marginL;
				childMarginRight = cflex.marginR;
			}
			const childMainSize = cflex.mainSize;
			let alignment = style.alignItems;
			if (childStyle.alignSelf !== 0) alignment = childStyle.alignSelf;
			const childCrossDimForAR = isRow ? childStyle.height : childStyle.width;
			const childCrossIsAutoForAR = childCrossDimForAR.unit === 3 || childCrossDimForAR.unit === 0;
			if (alignment === 4 && childStyle.alignSelf === 0 && !Number.isNaN(childStyle.aspectRatio) && childStyle.aspectRatio > 0 && childCrossIsAutoForAR) alignment = 1;
			let childCrossSize;
			const crossDim = isRow ? childStyle.height : childStyle.width;
			const crossMargin = isRow ? childMarginTop + childMarginBottom : childMarginLeft + childMarginRight;
			const parentCrossDim = isRow ? style.height : style.width;
			const parentHasDefiniteCross = (isRow ? isLength(parentCrossDim.unit) : !widthUsesContent(parentCrossDim, availableWidth)) || !Number.isNaN(crossAxisSize);
			if (isLength(crossDim.unit) && (isRow || !widthUsesContent(crossDim, crossAxisSize))) childCrossSize = resolveValue(crossDim, crossAxisSize, childQueryInlineSize);
			else if (crossDim.unit === 4 || crossDim.unit === 5) childCrossSize = NaN;
			else if (parentHasDefiniteCross && alignment === 4 && (isRow || !pctIndefinite(crossDim, NaN))) childCrossSize = (numLines > 1 ? savedLineCrossSizes ? savedLineCrossSizes[childLineIdx] : _lineCrossSizes[childLineIdx] : crossAxisSize) - crossMargin;
			else childCrossSize = NaN;
			const crossMinVal = isRow ? childStyle.minHeight : childStyle.minWidth;
			const crossMaxVal = isRow ? childStyle.maxHeight : childStyle.maxWidth;
			const crossMin = crossMinVal.unit !== 0 && !pctIndefinite(crossMinVal, crossAxisSize) ? resolveValue(crossMinVal, crossAxisSize, childQueryInlineSize) : 0;
			const crossMax = crossMaxVal.unit !== 0 && !pctIndefinite(crossMaxVal, crossAxisSize) ? resolveValue(crossMaxVal, crossAxisSize, childQueryInlineSize) : Infinity;
			if (Number.isNaN(childCrossSize)) {
				if (crossMin > 0) childCrossSize = crossMin;
			} else childCrossSize = Math.max(crossMin, Math.min(crossMax, childCrossSize));
			const mainDim = isRow ? childStyle.width : childStyle.height;
			const hasDefiniteFlexBasis = isLength(childStyle.flexBasis.unit) && (!isRow || !widthUsesContent(childStyle.flexBasis, mainAxisSize));
			const mainIsAutoChild = (isRow ? widthUsesContent(mainDim, mainAxisSize) : mainDim.unit === 3 || mainDim.unit === 0) && !hasDefiniteFlexBasis;
			const flexGrowHasDefiniteMainBudget = cflex.flexGrow > 0 && !Number.isNaN(mainAxisSize);
			const effectiveMainSize = childMainSize;
			let childWidth = isRow ? effectiveMainSize : childCrossSize;
			let childHeight = isRow ? childCrossSize : effectiveMainSize;
			const shouldMeasure = child.hasMeasureFunc() && child.children.length === 0 && !flexGrowHasDefiniteMainBudget;
			if (shouldMeasure) {
				const widthAuto = widthUsesContent(childStyle.width, isRow ? mainAxisSize : crossAxisSize);
				const heightAuto = childStyle.height.unit === 3 || childStyle.height.unit === 0;
				if (widthAuto || heightAuto) {
					const widthMode = widthAuto ? 2 : 1;
					const heightMode = heightAuto ? 0 : 1;
					const rawAvailW = widthAuto ? isRow ? mainAxisSize - mainPos : crossAxisSize - crossMargin : childStyle.width.value;
					const rawAvailH = heightAuto ? isRow ? crossAxisSize - crossMargin : mainAxisSize - mainPos : childStyle.height.value;
					const availW = Number.isNaN(rawAvailW) ? Infinity : rawAvailW;
					const availH = Number.isNaN(rawAvailH) ? Infinity : rawAvailH;
					const measured = child.cachedMeasure(availW, widthMode, availH, heightMode);
					if (widthAuto) childWidth = measured.width;
					if (heightAuto) childHeight = measured.height;
				}
			}
			let childX;
			let childY;
			if (effectiveReverse) {
				if (isRow) {
					childX = mainPos - childMainSize - childMarginRight;
					childY = lineCrossOffset + childMarginTop;
				} else {
					childX = lineCrossOffset + childMarginLeft;
					childY = mainPos - childMainSize - childMarginTop;
				}
			} else {
				childX = isRow ? mainPos + childMarginLeft : lineCrossOffset + childMarginLeft;
				childY = isRow ? lineCrossOffset + childMarginTop : mainPos + childMarginTop;
			}
			const fractionalLeft = innerLeft + childX;
			const fractionalTop = innerTop + childY;
			const posOffsetX = relativeInset(child, true, contentWidth, direction);
			const posOffsetY = relativeInset(child, false, contentHeight, direction);
			const childAbsX = borderBoxStart(absX, marginLeft, parentPosOffsetX) + fractionalLeft - childMarginLeft;
			const childAbsY = borderBoxStart(absY, marginTop, parentPosOffsetY) + fractionalTop - childMarginTop;
			cflex.passedAbsX = childAbsX;
			cflex.passedAbsY = childAbsY;
			const absChildLeft = borderBoxStart(childAbsX, childMarginLeft, posOffsetX);
			const absChildTop = borderBoxStart(childAbsY, childMarginTop, posOffsetY);
			let roundedAbsMainStart;
			let roundedAbsMainEnd;
			let edgeBasedMainSize;
			const useEdgeBasedRounding = childMainSize > 0;
			const childPaddingL = resolveEdgeValue(childStyle.padding, 0, childStyle.flexDirection, contentWidth, direction, childQueryInlineSize, "padding");
			const childPaddingT = resolveEdgeValue(childStyle.padding, 1, childStyle.flexDirection, contentWidth, direction, childQueryInlineSize, "padding");
			const childPaddingR = resolveEdgeValue(childStyle.padding, 2, childStyle.flexDirection, contentWidth, direction, childQueryInlineSize, "padding");
			const childPaddingB = resolveEdgeValue(childStyle.padding, 3, childStyle.flexDirection, contentWidth, direction, childQueryInlineSize, "padding");
			const childBorderL = resolveEdgeBorderValue(childStyle.border, 0, childStyle.flexDirection, direction, childQueryInlineSize);
			const childBorderT = resolveEdgeBorderValue(childStyle.border, 1, childStyle.flexDirection, direction, childQueryInlineSize);
			const childBorderR = resolveEdgeBorderValue(childStyle.border, 2, childStyle.flexDirection, direction, childQueryInlineSize);
			const childBorderB = resolveEdgeBorderValue(childStyle.border, 3, childStyle.flexDirection, direction, childQueryInlineSize);
			const childMinW = childPaddingL + childPaddingR + childBorderL + childBorderR;
			const childMinH = childPaddingT + childPaddingB + childBorderT + childBorderB;
			const childMinMain = isRow ? childMinW : childMinH;
			const constrainedMainSize = Math.max(childMainSize, childMinMain);
			const parentBorderFloatMain = borderBoxStart(isRow ? absX : absY, isRow ? marginLeft : marginTop, isRow ? parentPosOffsetX : parentPosOffsetY);
			const absChildMainStart = layoutCoordinate(parentBorderFloatMain) + ((isRow ? absChildLeft : absChildTop) - parentBorderFloatMain);
			const roundedAbsParentMainStart = layoutCoordinate(parentBorderFloatMain);
			if (useEdgeBasedRounding) {
				roundedAbsMainStart = layoutCoordinate(absChildMainStart);
				roundedAbsMainEnd = layoutCoordinate(absChildMainStart + constrainedMainSize);
				edgeBasedMainSize = roundedAbsMainEnd - roundedAbsMainStart;
			} else {
				roundedAbsMainStart = layoutCoordinate(absChildMainStart);
				edgeBasedMainSize = childMinMain;
			}
			const posRound = layoutCoordinate;
			const mainChildPos = roundedAbsMainStart - roundedAbsParentMainStart;
			const childLeft = isRow ? mainChildPos : posRound(fractionalLeft + posOffsetX);
			const childTop = isRow ? posRound(fractionalTop + posOffsetY) : mainChildPos;
			const crossDimForLayoutCall = isRow ? childStyle.height : childStyle.width;
			const crossIsAutoForLayoutCall = crossDimForLayoutCall.unit === 3 || crossDimForLayoutCall.unit === 0 || crossDimForLayoutCall.unit === 4 || crossDimForLayoutCall.unit === 5;
			const crossUsesContentForLayoutCall = isRow ? crossIsAutoForLayoutCall : widthUsesContent(crossDimForLayoutCall, crossAxisSize);
			const mainDimForLayoutCall = isRow ? childStyle.width : childStyle.height;
			const mainIsAutoForLayoutCall = isRow ? widthUsesContent(mainDimForLayoutCall, mainAxisSize) : mainDimForLayoutCall.unit === 3 || mainDimForLayoutCall.unit === 0;
			const mainIsPercentForLayoutCall = pctIndefinite(mainDimForLayoutCall, NaN);
			const crossIsPercentForLayoutCall = pctIndefinite(crossDimForLayoutCall, NaN);
			const flexDistChanged = child.flex.mainSize !== child.flex.baseSize;
			const hasMeasureLeaf = child.hasMeasureFunc() && child.children.length === 0;
			const mainSizeToPass = hasMeasureLeaf ? isRow ? childWidth : childHeight : edgeBasedMainSize;
			const crossIsFitContent = crossDimForLayoutCall.unit === 4 || crossDimForLayoutCall.unit === 5;
			const passWidthToChild = isRow && mainIsAutoChild && !flexGrowHasDefiniteMainBudget && !flexDistChanged && !hasMeasureLeaf ? NaN : !isRow && crossUsesContentForLayoutCall && !parentHasDefiniteCross && !crossIsFitContent ? NaN : isRow && mainIsPercentForLayoutCall ? mainAxisSize : !isRow && crossIsPercentForLayoutCall ? crossAxisSize : !isRow && crossIsFitContent ? crossAxisSize : isRow ? mainSizeToPass + (mainIsAutoForLayoutCall ? cflex.marginL + cflex.marginR : 0) : childWidth + (crossIsAutoForLayoutCall ? cflex.marginL + cflex.marginR : 0);
			const passHeightToChild = !isRow && mainIsAutoChild && !flexGrowHasDefiniteMainBudget && !flexDistChanged && !hasMeasureLeaf ? NaN : isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross && !crossIsFitContent ? NaN : !isRow && mainIsPercentForLayoutCall ? mainAxisSize : isRow && crossIsPercentForLayoutCall ? crossAxisSize : isRow && crossIsFitContent ? crossAxisSize : !isRow ? mainSizeToPass + (mainIsAutoForLayoutCall ? cflex.marginT + cflex.marginB : 0) : childHeight + (crossIsAutoForLayoutCall ? cflex.marginT + cflex.marginB : 0);
			const shouldOverrideMain = commitsMainAxis(child, isRow, mainIsAuto, mainAxisSize);
			const crossDimIsFitContent = crossIsFitContent;
			const crossIsAuto = crossUsesContentForLayoutCall;
			const hasCrossMinMax = crossMinVal.unit !== 0 || crossMaxVal.unit !== 0;
			const shouldOverrideCross = !crossIsAuto || !crossDimIsFitContent && parentHasDefiniteCross && alignment === 4 && (isRow || !pctIndefinite(crossDimForLayoutCall, NaN)) || hasCrossMinMax && !Number.isNaN(childCrossSize);
			const allocatedMain = !hasMeasureLeaf && shouldOverrideMain ? edgeBasedMainSize : NaN;
			const crossAbsStart = isRow ? absChildTop : absChildLeft;
			const edgeBasedCrossSize = layoutCoordinate(crossAbsStart + (isRow ? Math.max(childHeight, childMinH) : Math.max(childWidth, childMinW))) - layoutCoordinate(crossAbsStart);
			const allocatedCross = !hasMeasureLeaf && shouldOverrideCross ? edgeBasedCrossSize : NaN;
			const unknownBaseWidthsBefore = unknownBaseWidthCount();
			layoutNode(child, mode, passWidthToChild, passHeightToChild, childLeft, childTop, childAbsX, childAbsY, direction, contentWidth, contentHeight, isRow ? allocatedMain : allocatedCross, isRow ? allocatedCross : allocatedMain);
			if (isRow && !hasMeasureLeaf && Number.isNaN(allocatedMain) && unknownBaseWidthCount() !== unknownBaseWidthsBefore) layoutNode(child, mode, passWidthToChild, passHeightToChild, childLeft, childTop, childAbsX, childAbsY, direction, contentWidth, contentHeight, child.layout.width, allocatedCross);
			if (childWidth < childMinW) childWidth = childMinW;
			if (childHeight < childMinH) childHeight = childMinH;
			if (shouldOverrideMain) {
				if (isRow) {
					_t?.parentOverride(_tn, "main", child.layout.width, edgeBasedMainSize);
					child.layout.width = edgeBasedMainSize;
				} else {
					_t?.parentOverride(_tn, "main", child.layout.height, edgeBasedMainSize);
					child.layout.height = edgeBasedMainSize;
				}
			}
			if (shouldOverrideCross) {
				if (isRow) child.layout.height = edgeBasedCrossSize;
				else child.layout.width = edgeBasedCrossSize;
			}
			child.layout.left = childLeft;
			child.layout.top = childTop;
			childWidth = child.layout.width;
			childHeight = child.layout.height;
			const finalCrossSize = isRow ? child.layout.height : child.layout.width;
			let crossOffset = 0;
			const crossStartIndex = isRow ? 1 : 0;
			const crossEndIndex = isRow ? 3 : 2;
			const hasAutoStartMargin = isEdgeAuto(childStyle.margin, crossStartIndex, style.flexDirection, direction);
			const hasAutoEndMargin = isEdgeAuto(childStyle.margin, crossEndIndex, style.flexDirection, direction);
			const availableCrossSpace = (hasBaselineAlignment && isRow && !alignItemsIsBaseline && alignment !== 5 && baselineZoneHeight > 0 ? baselineZoneHeight : crossAxisSize) - finalCrossSize - crossMargin;
			if (hasAutoStartMargin && hasAutoEndMargin) crossOffset = Math.max(0, availableCrossSpace) / 2;
			else if (hasAutoStartMargin) crossOffset = Math.max(0, availableCrossSpace);
			else if (hasAutoEndMargin) crossOffset = 0;
			else switch (alignment) {
				case 3:
					crossOffset = availableCrossSpace;
					break;
				case 2:
					crossOffset = availableCrossSpace / 2;
					break;
				case 5: if (isRow && hasBaselineAlignment) crossOffset = maxBaseline - child.flex.baseline;
			}
			if (crossOffset !== 0) {
				const crossRound = layoutCoordinate;
				if (isRow) child.layout.top += crossRound(crossOffset);
				else child.layout.left += crossRound(crossOffset);
			}
			const fractionalMainSize = shouldOverrideMain ? constrainedMainSize : isRow ? child.layout.width : child.layout.height;
			const totalMainMargin = cflex.mainStartMarginValue + cflex.mainEndMarginValue;
			log.debug?.("  child %d: mainPos=%d -> top=%d (fractionalMainSize=%d, totalMainMargin=%d)", relIdx, mainPos, child.layout.top, fractionalMainSize, totalMainMargin);
			if (effectiveReverse) {
				mainPos -= fractionalMainSize + totalMainMargin;
				if (lineChildIdx < currentLineLength - 1) mainPos -= currentItemSpacing;
			} else {
				mainPos += fractionalMainSize + totalMainMargin;
				if (lineChildIdx < currentLineLength - 1) mainPos += currentItemSpacing;
			}
			relIdx++;
			lineChildIdx++;
		}
		let actualUsedMain = 0;
		for (const child of node.children) {
			if (child.flex.relativeIndex < 0) continue;
			const childMainSize = isRow ? child.layout.width : child.layout.height;
			const totalMainMargin = child.flex.mainStartMarginValue + child.flex.mainEndMarginValue;
			actualUsedMain += childMainSize + totalMainMargin;
		}
		actualUsedMain += totalGaps;
		const hasAR = !Number.isNaN(aspectRatio) && aspectRatio > 0;
		const containsInlineSize = style.containSize && style.containerType !== 0;
		const hasFitWidth = style.fitWidth !== void 0 && style.fitWidth.length > 0;
		if (isRow && !hasAllocatedWidth && widthUsesContent(style.width, availableWidth) && !hasAR && !containsInlineSize && !hasFitWidth) nodeWidth = actualUsedMain + innerLeft + innerRight;
		if (!isRow && !hasAllocatedHeight && !isLength(style.height.unit) && !hasAR) nodeHeight = actualUsedMain + innerTop + innerBottom;
		let totalCrossSize = 0;
		if (numLines > 1) {
			for (let i = 0; i < numLines; i++) totalCrossSize += savedLineCrossSizes ? savedLineCrossSizes[i] : _lineCrossSizes[i];
			totalCrossSize += crossGap * (numLines - 1);
		} else for (const child of node.children) {
			if (child.flex.relativeIndex < 0) continue;
			const childCross = isRow ? child.layout.height : child.layout.width;
			const childMargin = isRow ? resolveEdgeValue(child.style.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(child.style.margin, 3, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") : resolveEdgeValue(child.style.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(child.style.margin, 2, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
			totalCrossSize = Math.max(totalCrossSize, childCross + childMargin);
		}
		if (isRow && !hasAllocatedHeight && !isLength(style.height.unit) && Number.isNaN(availableHeight) && !hasAR) nodeHeight = totalCrossSize + innerTop + innerBottom;
		if (!isRow && !hasAllocatedWidth && widthUsesContent(style.width, availableWidth) && Number.isNaN(availableWidth) && !hasAR && !containsInlineSize && !hasFitWidth) nodeWidth = totalCrossSize + innerLeft + innerRight;
	}
	if (isFitContentWidth && !Number.isNaN(nodeWidth) && !Number.isNaN(availableWidth)) {
		const availForNode = availableWidth - marginLeft - marginRight;
		if (availForNode >= 0 && nodeWidth > availForNode) nodeWidth = availForNode;
	}
	nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, containingWidth, ownQueryInlineSize);
	nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, containingHeight, ownQueryInlineSize);
	if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) nodeWidth = minInnerWidth;
	if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) nodeHeight = minInnerHeight;
	if (Number.isNaN(crossAxisSize) && relativeCount > 0) {
		const finalCross = isRow ? nodeHeight - innerTop - innerBottom : nodeWidth - innerLeft - innerRight;
		if (!Number.isNaN(finalCross) && finalCross > 0) {
			for (const child of node.children) {
				if (child.flex.relativeIndex < 0) continue;
				const cstyle = child.style;
				let childAlign = style.alignItems;
				if (cstyle.alignSelf !== 0) childAlign = cstyle.alignSelf;
				const cCrossDim = isRow ? cstyle.height : cstyle.width;
				const cCrossIsAuto = cCrossDim.unit === 3 || cCrossDim.unit === 0;
				if (childAlign === 4 && cstyle.alignSelf === 0 && !Number.isNaN(cstyle.aspectRatio) && cstyle.aspectRatio > 0 && cCrossIsAuto) childAlign = 1;
				if (childAlign !== 4) continue;
				if (!cCrossIsAuto) continue;
				const cCrossMargin = isRow ? resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(cstyle.margin, 3, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") : resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(cstyle.margin, 2, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
				const crossContaining = isRow ? contentHeight : contentWidth;
				const crossMin = isRow ? cstyle.minHeight : cstyle.minWidth;
				const crossMax = isRow ? cstyle.maxHeight : cstyle.maxWidth;
				const crossStartEdge = isRow ? 1 : 0;
				const crossEndEdge = isRow ? 3 : 2;
				const boxMinimum = resolveEdgeValue(cstyle.padding, crossStartEdge, cstyle.flexDirection, contentWidth, direction, childQueryInlineSize, "padding") + resolveEdgeValue(cstyle.padding, crossEndEdge, cstyle.flexDirection, contentWidth, direction, childQueryInlineSize, "padding") + resolveEdgeBorderValue(cstyle.border, crossStartEdge, cstyle.flexDirection, direction, childQueryInlineSize) + resolveEdgeBorderValue(cstyle.border, crossEndEdge, cstyle.flexDirection, direction, childQueryInlineSize);
				const stretchedCross = Math.max(boxMinimum, applyMinMax(finalCross - cCrossMargin, crossMin, crossMax, crossContaining, childQueryInlineSize));
				const savedLeft = child.layout.left;
				const savedTop = child.layout.top;
				const cMarginL = resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
				const cMarginT = resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
				const isContainer = child.children.length > 0;
				const cAbsX = isContainer ? child.flex.passedAbsX : absX + innerLeft + savedLeft - cMarginL;
				const cAbsY = isContainer ? child.flex.passedAbsY : absY + innerTop + savedTop - cMarginT;
				const crossAbsStart = isRow ? borderBoxStart(cAbsY, cMarginT, relativeInset(child, false, contentHeight, direction)) : borderBoxStart(cAbsX, cMarginL, relativeInset(child, true, contentWidth, direction));
				const edgeBasedCrossSize = layoutCoordinate(crossAbsStart + stretchedCross) - layoutCoordinate(crossAbsStart);
				if (edgeBasedCrossSize <= (isRow ? child.layout.height : child.layout.width)) continue;
				const passW = isRow ? child.layout.width : stretchedCross;
				const passH = isRow ? stretchedCross : child.layout.height;
				const mainCommitted = commitsMainAxis(child, isRow, isRow ? widthUsesContent(style.width, availableWidth) : !isLength(style.height.unit), mainAxisSize);
				const allocatedMain = isContainer && mainCommitted ? isRow ? child.layout.width : child.layout.height : NaN;
				const allocatedCross = isContainer ? edgeBasedCrossSize : NaN;
				layoutNode(child, mode, passW, passH, savedLeft, savedTop, cAbsX, cAbsY, direction, contentWidth, contentHeight, isRow ? allocatedMain : allocatedCross, isRow ? allocatedCross : allocatedMain);
				child.layout.left = savedLeft;
				child.layout.top = savedTop;
				if (isRow) child.layout.height = edgeBasedCrossSize;
				else child.layout.width = edgeBasedCrossSize;
			}
			if (Number.isNaN(crossAxisSize) && relativeCount > 0) {
				const finalCross9c = isRow ? nodeHeight - innerTop - innerBottom : nodeWidth - innerLeft - innerRight;
				if (!Number.isNaN(finalCross9c) && finalCross9c > 0) for (const child of node.children) {
					if (child.flex.relativeIndex < 0) continue;
					const cstyle = child.style;
					let childAlign = style.alignItems;
					if (cstyle.alignSelf !== 0) childAlign = cstyle.alignSelf;
					const cCrossDim = isRow ? cstyle.height : cstyle.width;
					const cCrossIsAuto = cCrossDim.unit === 3 || cCrossDim.unit === 0;
					if (childAlign === 4 && cstyle.alignSelf === 0 && !Number.isNaN(cstyle.aspectRatio) && cstyle.aspectRatio > 0 && cCrossIsAuto) childAlign = 1;
					const crossStartIdx = isRow ? 1 : 0;
					const crossEndIdx = isRow ? 3 : 2;
					const hasAutoStart = isEdgeAuto(cstyle.margin, crossStartIdx, style.flexDirection, direction);
					const hasAutoEnd = isEdgeAuto(cstyle.margin, crossEndIdx, style.flexDirection, direction);
					if (!(hasAutoStart || hasAutoEnd || childAlign === 2 || childAlign === 3)) continue;
					const childCrossSize = isRow ? child.layout.height : child.layout.width;
					const cCrossMargin = isRow ? resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(cstyle.margin, 3, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") : resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin") + resolveEdgeValue(cstyle.margin, 2, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
					const availSpace = finalCross9c - childCrossSize - cCrossMargin;
					let crossOffset = 0;
					if (hasAutoStart && hasAutoEnd) crossOffset = Math.max(0, availSpace) / 2;
					else if (hasAutoStart) crossOffset = Math.max(0, availSpace);
					else if (hasAutoEnd) crossOffset = 0;
					else switch (childAlign) {
						case 3:
							crossOffset = availSpace;
							break;
						case 2: crossOffset = availSpace / 2;
					}
					if (isRow) {
						if (Number.isNaN(child.layout.top)) {
							const cMarginT = resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
							child.layout.top = layoutCoordinate(cMarginT + crossOffset);
						} else if (crossOffset !== 0) child.layout.top += layoutCoordinate(crossOffset);
					} else if (Number.isNaN(child.layout.left)) {
						const cMarginL = resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction, childQueryInlineSize, "margin");
						child.layout.left = layoutCoordinate(cMarginL + crossOffset);
					} else if (crossOffset !== 0) child.layout.left += layoutCoordinate(crossOffset);
				}
			}
		}
	}
	const absNodeLeft = borderBoxStart(absX, marginLeft, parentPosOffsetX);
	const absNodeTop = borderBoxStart(absY, marginTop, parentPosOffsetY);
	const absNodeRight = absNodeLeft + nodeWidth;
	const absNodeBottom = absNodeTop + nodeHeight;
	const roundedAbsLeft = layoutCoordinate(absNodeLeft);
	const roundedAbsTop = layoutCoordinate(absNodeTop);
	const roundedAbsRight = layoutCoordinate(absNodeRight);
	const roundedAbsBottom = layoutCoordinate(absNodeBottom);
	layout.width = roundedAbsRight - roundedAbsLeft;
	layout.height = roundedAbsBottom - roundedAbsTop;
	const roundedAbsParentLeft = layoutCoordinate(absX);
	const roundedAbsParentTop = layoutCoordinate(absY);
	layout.left = roundedAbsLeft - roundedAbsParentLeft;
	layout.top = roundedAbsTop - roundedAbsParentTop;
	if (style.containerType !== 0 && !Number.isNaN(node.getFrozenQuerySize()) && Math.abs(node.getFrozenQuerySize() - layout.width) > 1) {
		const frozen = node.getFrozenQuerySize();
		throw new Error(`flexily intrinsic-leak: CQ container frozen at ${frozen} cells (Pass 1) but rendered at ${layout.width} cells (Phase 9). Descendants' cqi/cqmin values resolved against the frozen size won't match the rendered layout. Fix: setContainSize(true) OR set an explicit width on this container.`);
	}
	const absInnerLeft = borderLeft;
	const absInnerTop = borderTop;
	const absInnerRight = borderRight;
	const absInnerBottom = borderBottom;
	const absPaddingBoxW = nodeWidth - absInnerLeft - absInnerRight;
	const absPaddingBoxH = nodeHeight - absInnerTop - absInnerBottom;
	const absContentBoxW = absPaddingBoxW - paddingLeft - paddingRight;
	const absContentBoxH = absPaddingBoxH - paddingTop - paddingBottom;
	for (const child of node.children) {
		if (child.style.display === 1) continue;
		if (child.style.positionType !== 2) continue;
		const childStyle = child.style;
		const childMarginLeft = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, nodeWidth, direction, childQueryInlineSize, "margin");
		const childMarginTop = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, nodeWidth, direction, childQueryInlineSize, "margin");
		const childMarginRight = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, nodeWidth, direction, childQueryInlineSize, "margin");
		const childMarginBottom = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, nodeWidth, direction, childQueryInlineSize, "margin");
		const hasAutoMarginLeft = isEdgeAuto(childStyle.margin, 0, style.flexDirection, direction);
		const hasAutoMarginRight = isEdgeAuto(childStyle.margin, 2, style.flexDirection, direction);
		const hasAutoMarginTop = isEdgeAuto(childStyle.margin, 1, style.flexDirection, direction);
		const hasAutoMarginBottom = isEdgeAuto(childStyle.margin, 3, style.flexDirection, direction);
		const leftPos = resolvePositionEdge(childStyle.position, 0, direction);
		const topPos = childStyle.position[1];
		const rightPos = resolvePositionEdge(childStyle.position, 2, direction);
		const bottomPos = childStyle.position[3];
		const hasLeft = leftPos.unit !== 0;
		const hasRight = rightPos.unit !== 0;
		const hasTop = topPos.unit !== 0;
		const hasBottom = bottomPos.unit !== 0;
		const leftOffset = resolveValue(leftPos, absContentBoxW);
		const topOffset = resolveValue(topPos, absContentBoxH);
		const rightOffset = resolveValue(rightPos, absContentBoxW);
		const bottomOffset = resolveValue(bottomPos, absContentBoxH);
		const contentW = absPaddingBoxW;
		const contentH = absPaddingBoxH;
		let childAvailWidth;
		const widthIsAuto = widthUsesContent(childStyle.width, absContentBoxW) && childStyle.width.unit !== 4 && childStyle.width.unit !== 5;
		const widthIsFit = childStyle.width.unit === 4 || childStyle.width.unit === 5;
		const widthIsPercent = pctIndefinite(childStyle.width, NaN);
		if (widthIsAuto && hasLeft && hasRight) childAvailWidth = contentW - leftOffset - rightOffset - childMarginLeft - childMarginRight;
		else if (widthIsAuto) childAvailWidth = NaN;
		else if (widthIsFit && !(hasLeft && hasRight)) childAvailWidth = NaN;
		else if (widthIsPercent) childAvailWidth = absContentBoxW;
		else childAvailWidth = contentW;
		let childAvailHeight;
		const heightIsAuto = childStyle.height.unit === 3 || childStyle.height.unit === 0;
		const heightIsPercent = pctIndefinite(childStyle.height, NaN);
		if (heightIsAuto && hasTop && hasBottom) childAvailHeight = contentH - topOffset - bottomOffset - childMarginTop - childMarginBottom;
		else if (heightIsAuto) childAvailHeight = NaN;
		else if (heightIsPercent) childAvailHeight = absContentBoxH;
		else childAvailHeight = contentH;
		let childX = childMarginLeft + leftOffset;
		let childY = childMarginTop + topOffset;
		const childAbsX = absX + marginLeft + absInnerLeft + leftOffset;
		const childAbsY = absY + marginTop + absInnerTop + topOffset;
		const clampIfNumber = (v) => Number.isNaN(v) ? NaN : Math.max(0, v);
		layoutNode(child, mode, clampIfNumber(childAvailWidth), clampIfNumber(childAvailHeight), layout.left + absInnerLeft + childX, layout.top + absInnerTop + childY, childAbsX, childAbsY, direction, absContentBoxW, absContentBoxH);
		const childWidth = child.layout.width;
		const childHeight = child.layout.height;
		if (!hasLeft && !hasRight) {
			if (isRow) {
				const freeSpaceX = contentW - childWidth - childMarginLeft - childMarginRight;
				switch (style.justifyContent) {
					case 1:
						childX = childMarginLeft + freeSpaceX / 2;
						break;
					case 2:
						childX = childMarginLeft + freeSpaceX;
						break;
					default: childX = childMarginLeft;
				}
			} else {
				let alignment = style.alignItems;
				if (childStyle.alignSelf !== 0) alignment = childStyle.alignSelf;
				const freeSpaceX = contentW - childWidth - childMarginLeft - childMarginRight;
				switch (alignment) {
					case 2:
						childX = childMarginLeft + freeSpaceX / 2;
						break;
					case 3:
						childX = childMarginLeft + freeSpaceX;
						break;
					case 4: break;
					default: childX = childMarginLeft;
				}
			}
		} else if (!hasLeft && hasRight) childX = contentW - rightOffset - childMarginRight - childWidth;
		else if (hasLeft && hasRight) {
			if (widthIsAuto) child.layout.width = layoutCoordinate(childAvailWidth);
			else if (hasAutoMarginLeft || hasAutoMarginRight) {
				const freeSpace = Math.max(0, contentW - leftOffset - rightOffset - childWidth);
				if (hasAutoMarginLeft && hasAutoMarginRight) childX = leftOffset + freeSpace / 2;
				else if (hasAutoMarginLeft) childX = leftOffset + freeSpace;
			}
		}
		if (!hasTop && !hasBottom) {
			if (isRow) {
				let alignment = style.alignItems;
				if (childStyle.alignSelf !== 0) alignment = childStyle.alignSelf;
				const freeSpaceY = contentH - childHeight - childMarginTop - childMarginBottom;
				switch (alignment) {
					case 2:
						childY = childMarginTop + freeSpaceY / 2;
						break;
					case 3:
						childY = childMarginTop + freeSpaceY;
						break;
					case 4: break;
					default: childY = childMarginTop;
				}
			} else {
				const freeSpaceY = contentH - childHeight - childMarginTop - childMarginBottom;
				switch (style.justifyContent) {
					case 1:
						childY = childMarginTop + freeSpaceY / 2;
						break;
					case 2:
						childY = childMarginTop + freeSpaceY;
						break;
					default: childY = childMarginTop;
				}
			}
		} else if (!hasTop && hasBottom) childY = contentH - bottomOffset - childMarginBottom - childHeight;
		else if (hasTop && hasBottom) {
			if (heightIsAuto) child.layout.height = layoutCoordinate(childAvailHeight);
			else if (hasAutoMarginTop || hasAutoMarginBottom) {
				const freeSpace = Math.max(0, contentH - topOffset - bottomOffset - childHeight);
				if (hasAutoMarginTop && hasAutoMarginBottom) childY = topOffset + freeSpace / 2;
				else if (hasAutoMarginTop) childY = topOffset + freeSpace;
			}
		}
		child.layout.left = layoutCoordinate(absInnerLeft + childX);
		child.layout.top = layoutCoordinate(absInnerTop + childY);
	}
	if (mode === MEASURE) {
		let i = measureSaveBase;
		for (const child of node.children) {
			const box = child.layout;
			box.left = measureSaveStack[i++];
			box.top = measureSaveStack[i++];
			box.width = measureSaveStack[i++];
			box.height = measureSaveStack[i++];
		}
		measureSaveStack.length = measureSaveBase;
		if (measureQuerySwapped) node._restoreFrozenQuerySize(measureQueryOuter);
		if (measureCacheable) node.setCachedLayout(availableWidth, availableHeight, layout.width, layout.height, false, containingWidth, containingHeight, allocatedWidth, allocatedHeight, true, unknownBaseWidthCount() - unknownWidthsBefore);
		_t?.layoutExit(_tn, layout.width, layout.height);
		return;
	}
	flex.lastAvailW = availableWidth;
	flex.lastAvailH = availableHeight;
	flex.lastContainingW = containingWidth;
	flex.lastContainingH = containingHeight;
	flex.lastAllocatedW = allocatedWidth;
	flex.lastAllocatedH = allocatedHeight;
	flex.lastOffsetX = offsetX;
	flex.lastOffsetY = offsetY;
	flex.lastAbsX = absX;
	flex.lastAbsY = absY;
	flex.lastDir = direction;
	flex.lastUnknownWidths = unknownBaseWidthCount() - unknownWidthsBefore;
	flex.layoutValid = true;
	_t?.layoutExit(_tn, layout.width, layout.height);
}
//#endregion
//#region src/node-zero.ts
/**
* Flexily Node
*
* Yoga-compatible Node class for flexbox layout.
*/
function isStyleValue(value) {
	return typeof value === "object" && value !== null && "value" in value && "unit" in value && typeof value.value === "number" && typeof value.unit === "number";
}
function styleArraysEqual(current, next) {
	if (current.length !== next.length) return false;
	for (let i = 0; i < current.length; i++) {
		const a = current[i];
		const b = next[i];
		if (isStyleValue(a) && isStyleValue(b)) {
			if (!styleValuesEqual(a, b)) return false;
			continue;
		}
		if (!Object.is(a, b)) return false;
	}
	return true;
}
function styleFieldEquals(current, next) {
	if (Object.is(current, next)) return true;
	if (isStyleValue(current) && isStyleValue(next)) return styleValuesEqual(current, next);
	if (Array.isArray(current) && Array.isArray(next)) return styleArraysEqual(current, next);
	return false;
}
function fitWidthMatches(current, lanes) {
	if (lanes === void 0 || lanes.length === 0) return current === void 0;
	if (current === void 0 || current.length !== lanes.length) return false;
	for (let i = 0; i < lanes.length; i++) {
		const lane = lanes[i];
		const value = typeof lane === "number" ? lane : lane.value;
		const unit = typeof lane === "number" ? 1 : lane.unit;
		if (!styleValueMatches(current[i], value, unit)) return false;
	}
	return true;
}
const LAYOUT_CACHE_SLOTS = 4;
function sameCacheKey(entry, availW, availH, containingW, containingH, allocatedW, allocatedH) {
	return Object.is(entry.availW, availW) && Object.is(entry.availH, availH) && Object.is(entry.containingW, containingW) && Object.is(entry.containingH, containingH) && Object.is(entry.allocatedW, allocatedW) && Object.is(entry.allocatedH, allocatedH);
}
function emptyCacheEntry() {
	return {
		availW: -1,
		availH: NaN,
		containingW: NaN,
		containingH: NaN,
		allocatedW: NaN,
		allocatedH: NaN,
		computedW: 0,
		computedH: 0,
		approx: false,
		exact: false,
		unknownWidths: 0,
		gen: 0
	};
}
/**
* A layout node in the flexbox tree.
*/
var Node = class Node {
	_parent = null;
	_children = [];
	_style;
	_measureFunc = null;
	_baselineFunc = null;
	_m0;
	_m1;
	_m2;
	_m3;
	_lc;
	_lcNext = 0;
	_flexShrinkExplicit = false;
	_cqResolve = null;
	_minContentRow = -1;
	_minContentCol = -1;
	_measureResult = {
		width: 0,
		height: 0
	};
	_layoutResult = {
		width: 0,
		height: 0,
		approx: false,
		unknownWidths: 0
	};
	static measureCalls = 0;
	static measureCacheHits = 0;
	/**
	* Reset measure statistics (call before calculateLayout).
	*/
	static resetMeasureStats() {
		Node.measureCalls = 0;
		Node.measureCacheHits = 0;
	}
	_layout = {
		left: 0,
		top: 0,
		width: 0,
		height: 0
	};
	_flex = {
		mainSize: 0,
		baseSize: 0,
		mainMargin: 0,
		flexGrow: 0,
		flexShrink: 0,
		minMain: 0,
		maxMain: Infinity,
		mainStartMarginAuto: false,
		mainEndMarginAuto: false,
		mainStartMarginValue: 0,
		mainEndMarginValue: 0,
		marginL: 0,
		marginT: 0,
		marginR: 0,
		marginB: 0,
		frozen: false,
		lineIndex: 0,
		relativeIndex: -1,
		baseline: 0,
		baseApprox: false,
		passedAbsX: NaN,
		passedAbsY: NaN,
		lastAvailW: NaN,
		lastAvailH: NaN,
		lastContainingW: NaN,
		lastContainingH: NaN,
		lastAllocatedW: NaN,
		lastAllocatedH: NaN,
		lastOffsetX: NaN,
		lastOffsetY: NaN,
		lastAbsX: NaN,
		lastAbsY: NaN,
		layoutValid: false,
		lastUnknownWidths: 0,
		lastDir: 0
	};
	_frozenQuerySize = NaN;
	_isDirty = true;
	_hasNewLayout = false;
	_lastCalcW = NaN;
	_lastCalcH = NaN;
	_lastCalcDir = 0;
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
	static create(options) {
		return new Node(options?.defaults);
	}
	constructor(preset) {
		this._style = createDefaultStyle(preset);
	}
	setStyleValue(key, value, unit) {
		if (typeof value === "object") {
			if (key !== "flexBasis") assertLengthAxis(value, key === "width" || key === "minWidth" || key === "maxWidth" ? "inline" : "block", key);
			if (styleValuesEqual(this._style[key], value)) return;
			this._style[key] = value;
			this.markDirty();
			return;
		}
		if (styleValueMatches(this._style[key], value, unit)) return;
		this._style[key] = {
			value,
			unit
		};
		this.markDirty();
	}
	setStyleNumber(key, value) {
		if (Object.is(this._style[key], value)) return;
		this._style[key] = value;
		this.markDirty();
	}
	setStyleBoolean(key, value) {
		if (this._style[key] === value) return;
		this._style[key] = value;
		this.markDirty();
	}
	/**
	* Get the number of child nodes.
	*
	* @returns The number of children
	*/
	getChildCount() {
		return this._children.length;
	}
	/**
	* Get a child node by index.
	*
	* @param index - Zero-based child index
	* @returns The child node at the given index, or undefined if index is out of bounds
	*/
	getChild(index) {
		return this._children[index];
	}
	/**
	* Get the parent node.
	*
	* @returns The parent node, or null if this is a root node
	*/
	getParent() {
		return this._parent;
	}
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
	insertChild(child, index) {
		if (child === this) throw new Error("Cannot insert a node as a child of itself");
		let ancestor = this._parent;
		while (ancestor !== null) {
			if (ancestor === child) throw new Error("Cannot insert an ancestor as a child (would create a cycle)");
			ancestor = ancestor._parent;
		}
		const movedFrom = child._parent === null ? void 0 : findContainerQuerySize(child);
		if (child._parent !== null) child._parent.detachChild(child);
		child._parent = this;
		const clampedIndex = Math.max(0, Math.min(index, this._children.length));
		this._children.splice(clampedIndex, 0, child);
		for (let i = clampedIndex + 1; i < this._children.length; i++) this._children[i]._flex.layoutValid = false;
		if (movedFrom !== void 0 && !Object.is(movedFrom, findContainerQuerySize(child))) child.resetLayoutCache();
		this.markDirty();
	}
	/**
	* Remove a child node from this node.
	* The child's parent reference will be cleared.
	* Marks the node as dirty to trigger layout recalculation.
	* Invalidates layout validity of remaining siblings whose positions may change.
	*
	* @param child - The child node to remove
	*/
	removeChild(child) {
		if (this.detachChild(child)) child.resetLayoutCache();
	}
	/** Unlink `child` without touching its cache; insertChild's move path. */
	detachChild(child) {
		const index = this._children.indexOf(child);
		if (index === -1) return false;
		this._children.splice(index, 1);
		child._parent = null;
		for (let i = index; i < this._children.length; i++) this._children[i]._flex.layoutValid = false;
		this.markDirty();
		return true;
	}
	/**
	* Free this node and clean up all references.
	* Removes the node from its parent, clears all children, and removes the measure function.
	* This does not recursively free child nodes.
	*/
	free() {
		if (this._parent !== null) this._parent.removeChild(this);
		for (const child of this._children) child._parent = null;
		this._children = [];
		this._measureFunc = null;
		this._baselineFunc = null;
	}
	/**
	* Free this node and all descendants recursively.
	* Each node is detached from its parent and cleaned up.
	* Uses iterative traversal to avoid stack overflow on deep trees.
	*/
	freeRecursive() {
		const nodes = [];
		traversalStack.length = 0;
		traversalStack.push(this);
		while (traversalStack.length > 0) {
			const current = traversalStack.pop();
			nodes.push(current);
			for (const child of current._children) traversalStack.push(child);
		}
		for (let i = nodes.length - 1; i >= 0; i--) nodes[i].free();
	}
	/**
	* Dispose the node (calls free)
	*/
	[Symbol.dispose]() {
		this.free();
	}
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
	setMeasureFunc(measureFunc) {
		if (this._measureFunc === measureFunc) return;
		this._measureFunc = measureFunc;
		this.markDirty();
	}
	/**
	* Remove the measure function from this node.
	* Marks the node as dirty to trigger layout recalculation.
	*/
	unsetMeasureFunc() {
		if (this._measureFunc === null) return;
		this._measureFunc = null;
		this.markDirty();
	}
	/**
	* Check if this node has a measure function.
	*
	* @returns True if a measure function is set
	*/
	hasMeasureFunc() {
		return this._measureFunc !== null;
	}
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
	setBaselineFunc(baselineFunc) {
		if (this._baselineFunc === baselineFunc) return;
		this._baselineFunc = baselineFunc;
		this.markDirty();
	}
	/**
	* Remove the baseline function from this node.
	* Marks the node as dirty to trigger layout recalculation.
	*/
	unsetBaselineFunc() {
		if (this._baselineFunc === null) return;
		this._baselineFunc = null;
		this.markDirty();
	}
	/**
	* Check if this node has a baseline function.
	*
	* @returns True if a baseline function is set
	*/
	hasBaselineFunc() {
		return this._baselineFunc !== null;
	}
	/**
	* Call the measure function with caching.
	* Uses a 4-entry numeric cache for fast lookup without allocations.
	* Cache is cleared when markDirty() is called.
	*
	* @returns Measured dimensions or null if no measure function
	*/
	cachedMeasure(w, wm, h, hm) {
		if (!this._measureFunc) return null;
		Node.measureCalls++;
		const m0 = this._m0;
		if (m0 && m0.w === w && m0.wm === wm && m0.h === h && m0.hm === hm) {
			Node.measureCacheHits++;
			this._measureResult.width = m0.rw;
			this._measureResult.height = m0.rh;
			getTrace()?.measureCacheHit(0, w, h, m0.rw, m0.rh);
			return this._measureResult;
		}
		const m1 = this._m1;
		if (m1 && m1.w === w && m1.wm === wm && m1.h === h && m1.hm === hm) {
			Node.measureCacheHits++;
			this._measureResult.width = m1.rw;
			this._measureResult.height = m1.rh;
			getTrace()?.measureCacheHit(0, w, h, m1.rw, m1.rh);
			return this._measureResult;
		}
		const m2 = this._m2;
		if (m2 && m2.w === w && m2.wm === wm && m2.h === h && m2.hm === hm) {
			Node.measureCacheHits++;
			this._measureResult.width = m2.rw;
			this._measureResult.height = m2.rh;
			getTrace()?.measureCacheHit(0, w, h, m2.rw, m2.rh);
			return this._measureResult;
		}
		const m3 = this._m3;
		if (m3 && m3.w === w && m3.wm === wm && m3.h === h && m3.hm === hm) {
			Node.measureCacheHits++;
			this._measureResult.width = m3.rw;
			this._measureResult.height = m3.rh;
			getTrace()?.measureCacheHit(0, w, h, m3.rw, m3.rh);
			return this._measureResult;
		}
		getTrace()?.measureCacheMiss(0, w, h);
		const result = this._measureFunc(w, wm, h, hm);
		if (this._m2) {
			if (!this._m3) this._m3 = {
				w: 0,
				wm: 0,
				h: 0,
				hm: 0,
				rw: 0,
				rh: 0
			};
			this._m3.w = this._m2.w;
			this._m3.wm = this._m2.wm;
			this._m3.h = this._m2.h;
			this._m3.hm = this._m2.hm;
			this._m3.rw = this._m2.rw;
			this._m3.rh = this._m2.rh;
		}
		if (this._m1) {
			if (!this._m2) this._m2 = {
				w: 0,
				wm: 0,
				h: 0,
				hm: 0,
				rw: 0,
				rh: 0
			};
			this._m2.w = this._m1.w;
			this._m2.wm = this._m1.wm;
			this._m2.h = this._m1.h;
			this._m2.hm = this._m1.hm;
			this._m2.rw = this._m1.rw;
			this._m2.rh = this._m1.rh;
		}
		if (this._m0) {
			if (!this._m1) this._m1 = {
				w: 0,
				wm: 0,
				h: 0,
				hm: 0,
				rw: 0,
				rh: 0
			};
			this._m1.w = this._m0.w;
			this._m1.wm = this._m0.wm;
			this._m1.h = this._m0.h;
			this._m1.hm = this._m0.hm;
			this._m1.rw = this._m0.rw;
			this._m1.rh = this._m0.rh;
		}
		if (!this._m0) this._m0 = {
			w: 0,
			wm: 0,
			h: 0,
			hm: 0,
			rw: 0,
			rh: 0
		};
		this._m0.w = w;
		this._m0.wm = wm;
		this._m0.h = h;
		this._m0.hm = hm;
		this._m0.rw = result.width;
		this._m0.rh = result.height;
		this._measureResult.width = result.width;
		this._measureResult.height = result.height;
		return this._measureResult;
	}
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
	getMinContent(direction, containingBlockSize = NaN) {
		const isRow = isRowDirection(direction);
		const cacheable = Number.isNaN(containingBlockSize);
		if (cacheable) {
			const cached = isRow ? this._minContentRow : this._minContentCol;
			if (cached !== -1) return cached;
		}
		let result;
		const style = this._style;
		const ownQueryInlineSize = this.getParent() === null ? Number.isNaN(this._lastCalcW) ? containingBlockSize : this._lastCalcW : findContainerQuerySize(this);
		if (this._measureFunc !== null) {
			const measured = this.cachedMeasure(isRow ? 0 : Infinity, isRow ? 3 : 0, isRow ? Infinity : 0, isRow ? 0 : 3);
			result = isRow ? measured.width : measured.height;
		} else if (this._children.length === 0) {
			const cb = containingBlockSize;
			result = (isRow ? resolveEdgeValue(style.padding, 0, style.flexDirection, cb, 1, ownQueryInlineSize, "padding") + resolveEdgeValue(style.padding, 2, style.flexDirection, cb, 1, ownQueryInlineSize, "padding") : resolveEdgeValue(style.padding, 1, style.flexDirection, cb, 1, ownQueryInlineSize, "padding") + resolveEdgeValue(style.padding, 3, style.flexDirection, cb, 1, ownQueryInlineSize, "padding")) + (isRow ? resolveEdgeBorderValue(style.border, 0, style.flexDirection, 1, ownQueryInlineSize) + resolveEdgeBorderValue(style.border, 2, style.flexDirection, 1, ownQueryInlineSize) : resolveEdgeBorderValue(style.border, 1, style.flexDirection, 1, ownQueryInlineSize) + resolveEdgeBorderValue(style.border, 3, style.flexDirection, 1, ownQueryInlineSize));
		} else {
			const ownIsRow = isRowDirection(style.flexDirection);
			const queryIsMain = isRow === ownIsRow;
			const cb = containingBlockSize;
			const pad = isRow ? resolveEdgeValue(style.padding, 0, style.flexDirection, cb, 1, ownQueryInlineSize, "padding") + resolveEdgeValue(style.padding, 2, style.flexDirection, cb, 1, ownQueryInlineSize, "padding") : resolveEdgeValue(style.padding, 1, style.flexDirection, cb, 1, ownQueryInlineSize, "padding") + resolveEdgeValue(style.padding, 3, style.flexDirection, cb, 1, ownQueryInlineSize, "padding");
			const bord = isRow ? resolveEdgeBorderValue(style.border, 0, style.flexDirection, 1, ownQueryInlineSize) + resolveEdgeBorderValue(style.border, 2, style.flexDirection, 1, ownQueryInlineSize) : resolveEdgeBorderValue(style.border, 1, style.flexDirection, 1, ownQueryInlineSize) + resolveEdgeBorderValue(style.border, 3, style.flexDirection, 1, ownQueryInlineSize);
			const childCb = NaN;
			let childSum = 0;
			let childMax = 0;
			let inFlowCount = 0;
			for (const child of this._children) {
				if (child._style.display === 1) continue;
				if (child._style.positionType === 2) continue;
				let childMin = child._getMinContentForParent(direction, childCb);
				const childQueryInlineSize = findContainerQuerySize(child);
				const cm = isRow ? resolveEdgeValue(child._style.margin, 0, child._style.flexDirection, cb, 1, childQueryInlineSize, "margin") + resolveEdgeValue(child._style.margin, 2, child._style.flexDirection, cb, 1, childQueryInlineSize, "margin") : resolveEdgeValue(child._style.margin, 1, child._style.flexDirection, cb, 1, childQueryInlineSize, "margin") + resolveEdgeValue(child._style.margin, 3, child._style.flexDirection, cb, 1, childQueryInlineSize, "margin");
				childMin += Number.isNaN(cm) ? 0 : cm;
				if (queryIsMain) childSum += childMin;
				else if (childMin > childMax) childMax = childMin;
				inFlowCount++;
			}
			let inner = queryIsMain ? childSum : childMax;
			if (queryIsMain && inFlowCount > 1) {
				const gap = resolveValue(style.gap[ownIsRow ? 0 : 1], cb, ownQueryInlineSize);
				inner += gap * (inFlowCount - 1);
			}
			result = pad + bord + inner;
		}
		const minVal = isRow ? style.minWidth : style.minHeight;
		if (isLength(minVal.unit) && !pctIndefinite(minVal, containingBlockSize)) {
			const queryInlineSize = minVal.unit === 1 ? NaN : findContainerQuerySize(this);
			result = Math.max(result, resolveValue(minVal, containingBlockSize, queryInlineSize));
		}
		if (cacheable) {
			if (isRow) this._minContentRow = result;
			else this._minContentCol = result;
		}
		return result;
	}
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
	_getMinContentForParent(parentDirection, containingBlockSize) {
		const isRow = isRowDirection(parentDirection);
		const style = this._style;
		if (style.overflow !== 0) return 0;
		const minVal = isRow ? style.minWidth : style.minHeight;
		const sizeVal = isRow ? style.width : style.height;
		const queryInlineSize = isLength(minVal.unit) && minVal.unit !== 1 || isLength(sizeVal.unit) && sizeVal.unit !== 1 ? findContainerQuerySize(this) : NaN;
		if (isLength(minVal.unit) && !pctIndefinite(minVal, containingBlockSize) && resolveValue(minVal, containingBlockSize, queryInlineSize) === 0) return 0;
		if (isLength(sizeVal.unit) && !pctIndefinite(sizeVal, containingBlockSize)) return resolveValue(sizeVal, containingBlockSize, queryInlineSize);
		return this.getMinContent(parentDirection, containingBlockSize);
	}
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
	getCachedLayout(availW, availH, containingW = availW, containingH = availH, allocatedW = NaN, allocatedH = NaN, exact = false) {
		const lc = this._lc;
		if (lc === void 0) return null;
		for (let i = 0; i < LAYOUT_CACHE_SLOTS; i++) {
			const entry = lc[i];
			if (this.cacheEntryAnswers(entry, availW, availH, containingW, containingH, allocatedW, allocatedH, exact)) return this.cacheResult(entry);
		}
		return null;
	}
	cacheEntryAnswers(entry, availW, availH, containingW, containingH, allocatedW, allocatedH, exact) {
		return entry.exact === exact && sameCacheKey(entry, availW, availH, containingW, containingH, allocatedW, allocatedH) && (!this._isDirty || entry.gen === layoutGeneration());
	}
	invalidateLayoutEntries() {
		const lc = this._lc;
		if (lc === void 0) return;
		for (let i = 0; i < LAYOUT_CACHE_SLOTS; i++) lc[i].availW = -1;
	}
	cacheResult(entry) {
		this._layoutResult.width = entry.computedW;
		this._layoutResult.height = entry.computedH;
		this._layoutResult.approx = entry.approx;
		this._layoutResult.unknownWidths = entry.unknownWidths;
		return this._layoutResult;
	}
	/**
	* Cache a computed layout result under its six constraints and its kind
	* (`exact`, see getCachedLayout), stamped with the current pass. A write to a
	* key and kind already held replaces that entry; a new one overwrites the
	* ring's oldest slot.
	* Zero-allocation: lazily allocates cache entries once, then reuses.
	*/
	setCachedLayout(availW, availH, computedW, computedH, approx, containingW = availW, containingH = availH, allocatedW = NaN, allocatedH = NaN, exact = false, unknownWidths = 0) {
		let lc = this._lc;
		if (lc === void 0) {
			lc = [];
			for (let i = 0; i < LAYOUT_CACHE_SLOTS; i++) lc.push(emptyCacheEntry());
			this._lc = lc;
		}
		let entry;
		for (let i = 0; i < LAYOUT_CACHE_SLOTS; i++) {
			const held = lc[i];
			if (held.exact === exact && sameCacheKey(held, availW, availH, containingW, containingH, allocatedW, allocatedH)) {
				entry = held;
				break;
			}
		}
		if (entry === void 0) {
			entry = lc[this._lcNext];
			this._lcNext = (this._lcNext + 1) % LAYOUT_CACHE_SLOTS;
		}
		entry.availW = availW;
		entry.availH = availH;
		entry.containingW = containingW;
		entry.containingH = containingH;
		entry.allocatedW = allocatedW;
		entry.allocatedH = allocatedH;
		entry.computedW = computedW;
		entry.computedH = computedH;
		entry.approx = approx;
		entry.exact = exact;
		entry.unknownWidths = unknownWidths;
		entry.gen = layoutGeneration();
	}
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
	resetLayoutCache(keepLayoutEntries = false) {
		traversalStack.length = 0;
		traversalStack.push(this);
		while (traversalStack.length > 0) {
			const node = traversalStack.pop();
			if (!keepLayoutEntries) node.invalidateLayoutEntries();
			node._minContentRow = -1;
			node._minContentCol = -1;
			for (const child of node._children) traversalStack.push(child);
		}
	}
	/**
	* Check if this node needs layout recalculation.
	*
	* @returns True if the node is dirty and needs layout
	*/
	isDirty() {
		return this._isDirty;
	}
	/**
	* Mark this node and all ancestors as dirty.
	* A dirty node needs layout recalculation.
	* This is automatically called by all style setters and tree operations.
	* Uses iterative approach to avoid stack overflow on deep trees.
	*/
	markDirty() {
		let current = this;
		while (current !== null) {
			current._m0 = current._m1 = current._m2 = current._m3 = void 0;
			current.invalidateLayoutEntries();
			current._minContentRow = -1;
			current._minContentCol = -1;
			if (current._isDirty) break;
			current._isDirty = true;
			current._flex.layoutValid = false;
			current = current._parent;
		}
	}
	/**
	* Check if this node has new layout results since the last check.
	*
	* @returns True if layout was recalculated since the last call to markLayoutSeen
	*/
	hasNewLayout() {
		return this._hasNewLayout;
	}
	/**
	* Mark that the current layout has been seen/processed.
	* Clears the hasNewLayout flag.
	*/
	markLayoutSeen() {
		this._hasNewLayout = false;
	}
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
	setContainerQueryResolver(callback) {
		if (this._cqResolve === callback) return;
		this._cqResolve = callback;
	}
	/** @internal A0.0 spike — invoked by `layout-zero.ts` only. */
	get cqResolve() {
		return this._cqResolve;
	}
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
	setContainerQueryStyle(overrides) {
		let touched = false;
		for (const key of Object.keys(overrides)) {
			const v = overrides[key];
			if (v === void 0) continue;
			if (styleFieldEquals(this._style[key], v)) continue;
			this._style[key] = v;
			touched = true;
		}
		if (touched) this.markDirty();
	}
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
	calculateLayout(width, height, direction = 1) {
		const availableWidth = width ?? NaN;
		const availableHeight = height ?? NaN;
		if (!this._isDirty && Object.is(this._lastCalcW, availableWidth) && Object.is(this._lastCalcH, availableHeight) && this._lastCalcDir === direction) {
			log.debug?.("layout skip (not dirty, constraints unchanged)");
			return;
		}
		if (this._lastCalcDir !== direction) this.resetLayoutCache();
		this._lastCalcW = availableWidth;
		this._lastCalcH = availableHeight;
		this._lastCalcDir = direction;
		const start = log.debug ? Date.now() : 0;
		const nodeCount = log.debug ? countNodes(this) : 0;
		Node.resetMeasureStats();
		computeLayout(this, availableWidth, availableHeight, direction);
		this._isDirty = false;
		this._hasNewLayout = true;
		markSubtreeLayoutSeen(this);
		log.debug?.("layout: %dx%d, %d nodes in %dms (measure: calls=%d hits=%d)", width, height, nodeCount, Date.now() - start, Node.measureCalls, Node.measureCacheHits);
	}
	/**
	* Get the computed left position after layout.
	*
	* @returns The left position in points
	*/
	getComputedLeft() {
		return this._layout.left;
	}
	/**
	* Get the computed top position after layout.
	*
	* @returns The top position in points
	*/
	getComputedTop() {
		return this._layout.top;
	}
	/**
	* Get the computed width after layout.
	*
	* @returns The width in points
	*/
	getComputedWidth() {
		return this._layout.width;
	}
	/**
	* Get the computed height after layout.
	*
	* @returns The height in points
	*/
	getComputedHeight() {
		return this._layout.height;
	}
	/**
	* Get the computed right edge position after layout (left + width).
	*
	* @returns The right edge position in points
	*/
	getComputedRight() {
		return this._layout.left + this._layout.width;
	}
	/**
	* Get the computed bottom edge position after layout (top + height).
	*
	* @returns The bottom edge position in points
	*/
	getComputedBottom() {
		return this._layout.top + this._layout.height;
	}
	/**
	* Get the computed padding for a specific edge after layout.
	* Returns the resolved padding value (percentage and logical edges resolved).
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Padding value in points
	*/
	getComputedPadding(edge) {
		edge = getEdgeIndex(edge);
		return resolveEdgeValue(this._style.padding, edge, this._style.flexDirection, this.flex.lastAvailW, this.flex.lastDir, this.getParent() === null ? this.flex.lastAvailW : findContainerQuerySize(this), "padding");
	}
	/**
	* Get the computed margin for a specific edge after layout.
	* Returns the resolved margin value (percentage and logical edges resolved).
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Margin value in points
	*/
	getComputedMargin(edge) {
		edge = getEdgeIndex(edge);
		if (isEdgeAuto(this._style.margin, edge, this._style.flexDirection, this.flex.lastDir)) return 0;
		return resolveEdgeValue(this._style.margin, edge, this._style.flexDirection, this.flex.lastAvailW, this.flex.lastDir, this.getParent() === null ? this.flex.lastAvailW : findContainerQuerySize(this), "margin");
	}
	/**
	* Get the computed border width for a specific edge after layout.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Border width in points
	*/
	getComputedBorder(edge) {
		edge = getEdgeIndex(edge);
		if ((edge === 4 || edge === 5) && this._style.border[edge].unit === 0) return NaN;
		return resolveEdgeBorderValue(this._style.border, edge, this._style.flexDirection, this.flex.lastDir, this.getParent() === null ? this.flex.lastAvailW : findContainerQuerySize(this));
	}
	get children() {
		return this._children;
	}
	get style() {
		return this._style;
	}
	get layout() {
		return this._layout;
	}
	get measureFunc() {
		return this._measureFunc;
	}
	get baselineFunc() {
		return this._baselineFunc;
	}
	get flex() {
		return this._flex;
	}
	/**
	* Set the width to a number in points or a parsed inline-axis length.
	*
	* @param value - Width in points
	*/
	setWidth(value) {
		if (typeof value === "number" && Number.isNaN(value)) this.setStyleValue("width", 0, 3);
		else this.setStyleValue("width", value, 1);
	}
	/**
	* Set the width as a percentage of the parent's width.
	*
	* @param value - Width as a percentage (0-100)
	*/
	setWidthPercent(value) {
		this.setStyleValue("width", value, 2);
	}
	/**
	* Set the width to auto (determined by layout algorithm).
	*/
	setWidthAuto() {
		this.setStyleValue("width", 0, 3);
	}
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
	setWidthCqi(value) {
		this.setStyleValue("width", value, 6);
	}
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
	setWidthFitContent() {
		this.setStyleValue("width", 0, 4);
	}
	/**
	* Set the width to snug-content mode.
	*
	* Like fit-content but signals that the consumer wants the tightest
	* possible width (binary-search shrinkwrap). The layout engine treats
	* this identically to fit-content for sizing; the consuming framework
	* (e.g., silvery) can further tighten via its own binary search.
	*/
	setWidthSnugContent() {
		this.setStyleValue("width", 0, 5);
	}
	/**
	* Set the height to a number in points or a parsed block-axis length.
	*
	* @param value - Height in points
	*/
	setHeight(value) {
		if (typeof value === "number" && Number.isNaN(value)) this.setStyleValue("height", 0, 3);
		else this.setStyleValue("height", value, 1);
	}
	/**
	* Set the height as a percentage of the parent's height.
	*
	* @param value - Height as a percentage (0-100)
	*/
	setHeightPercent(value) {
		this.setStyleValue("height", value, 2);
	}
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
	setHeightCqi(value) {
		this.setStyleValue("height", value, 6);
	}
	/**
	* Set the height to auto (determined by layout algorithm).
	*/
	setHeightAuto() {
		this.setStyleValue("height", 0, 3);
	}
	/**
	* Set the minimum width in points.
	*
	* @param value - Minimum width in points
	*/
	setMinWidth(value) {
		this.setStyleValue("minWidth", value, 1);
	}
	/**
	* Set the minimum width as a percentage of the parent's width.
	*
	* @param value - Minimum width as a percentage (0-100)
	*/
	setMinWidthPercent(value) {
		this.setStyleValue("minWidth", value, 2);
	}
	/**
	* Set the minimum height in points.
	*
	* @param value - Minimum height in points
	*/
	setMinHeight(value) {
		this.setStyleValue("minHeight", value, 1);
	}
	/**
	* Set the minimum height as a percentage of the parent's height.
	*
	* @param value - Minimum height as a percentage (0-100)
	*/
	setMinHeightPercent(value) {
		this.setStyleValue("minHeight", value, 2);
	}
	/**
	* Set the maximum width in points.
	*
	* @param value - Maximum width in points
	*/
	setMaxWidth(value) {
		this.setStyleValue("maxWidth", value, 1);
	}
	/**
	* Set the maximum width as a percentage of the parent's width.
	*
	* @param value - Maximum width as a percentage (0-100)
	*/
	setMaxWidthPercent(value) {
		this.setStyleValue("maxWidth", value, 2);
	}
	/**
	* Set the maximum height in points.
	*
	* @param value - Maximum height in points
	*/
	setMaxHeight(value) {
		this.setStyleValue("maxHeight", value, 1);
	}
	/**
	* Set the maximum height as a percentage of the parent's height.
	*
	* @param value - Maximum height as a percentage (0-100)
	*/
	setMaxHeightPercent(value) {
		this.setStyleValue("maxHeight", value, 2);
	}
	/**
	* Set the aspect ratio of the node.
	* When set, the node's width/height relationship is constrained.
	* If width is defined, height = width / aspectRatio.
	* If height is defined, width = height * aspectRatio.
	*
	* @param value - Aspect ratio (width/height). Use NaN to unset.
	*/
	setAspectRatio(value) {
		this.setStyleNumber("aspectRatio", value);
	}
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
	setFlexGrow(value) {
		this.setStyleNumber("flexGrow", value);
	}
	/**
	* Set the flex shrink factor.
	* Determines how much the node will shrink relative to siblings when there is insufficient space.
	*
	* @param value - Flex shrink factor (default is 1)
	*/
	setFlexShrink(value) {
		if (this._flexShrinkExplicit && Object.is(this._style.flexShrink, value)) return;
		this._style.flexShrink = value;
		this._flexShrinkExplicit = true;
		this.markDirty();
	}
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
	hasExplicitFlexShrink() {
		return this._flexShrinkExplicit;
	}
	/**
	* Set the flex basis to a number in points or a parsed length.
	* The initial size of the node before flex grow/shrink is applied.
	*
	* @param value - Flex basis in points
	*/
	setFlexBasis(value) {
		this.setStyleValue("flexBasis", value, 1);
	}
	/**
	* Set the flex basis as a percentage of the parent's size.
	*
	* @param value - Flex basis as a percentage (0-100)
	*/
	setFlexBasisPercent(value) {
		this.setStyleValue("flexBasis", value, 2);
	}
	/**
	* Set the flex basis to auto (based on the node's width/height).
	*/
	setFlexBasisAuto() {
		this.setStyleValue("flexBasis", 0, 3);
	}
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
	setFlexDirection(direction) {
		this.setStyleNumber("flexDirection", direction);
	}
	/**
	* Set the flex wrap behavior.
	*
	* @param wrap - WRAP_NO_WRAP, WRAP_WRAP, or WRAP_WRAP_REVERSE
	*/
	setFlexWrap(wrap) {
		this.setStyleNumber("flexWrap", wrap);
	}
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
	setAlignItems(align) {
		this.setStyleNumber("alignItems", align);
	}
	/**
	* Set how this node is aligned along the parent's cross axis.
	* Overrides the parent's alignItems for this specific child.
	*
	* @param align - ALIGN_AUTO, ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
	*/
	setAlignSelf(align) {
		this.setStyleNumber("alignSelf", align);
	}
	/**
	* Set how lines are aligned in a multi-line flex container.
	* Only affects containers with wrap enabled and multiple lines.
	*
	* @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, ALIGN_SPACE_BETWEEN, or ALIGN_SPACE_AROUND
	*/
	setAlignContent(align) {
		this.setStyleNumber("alignContent", align);
	}
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
	setJustifyContent(justify) {
		this.setStyleNumber("justifyContent", justify);
	}
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
	setPadding(edge, value) {
		if (typeof value !== "number") assertEdgeLength(value, edge, "padding");
		if (edgeValueMatches(this._style.padding, edge, value, 1)) return;
		setEdgeValue(this._style.padding, edge, value, 1);
		this.markDirty();
	}
	/**
	* Set padding as a percentage of the parent's width.
	* Per CSS spec, percentage padding always resolves against the containing block's width.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
	* @param value - Padding as a percentage (0-100)
	*/
	setPaddingPercent(edge, value) {
		if (edgeValueMatches(this._style.padding, edge, value, 2)) return;
		setEdgeValue(this._style.padding, edge, value, 2);
		this.markDirty();
	}
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
	setMargin(edge, value) {
		if (typeof value !== "number") assertEdgeLength(value, edge, "margin");
		if (edgeValueMatches(this._style.margin, edge, value, 1)) return;
		setEdgeValue(this._style.margin, edge, value, 1);
		this.markDirty();
	}
	/**
	* Set margin as a percentage of the parent's size.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
	* @param value - Margin as a percentage (0-100)
	*/
	setMarginPercent(edge, value) {
		if (edgeValueMatches(this._style.margin, edge, value, 2)) return;
		setEdgeValue(this._style.margin, edge, value, 2);
		this.markDirty();
	}
	/**
	* Set margin to auto (for centering items with margin: auto).
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
	*/
	setMarginAuto(edge) {
		if (edgeValueMatches(this._style.margin, edge, 0, 3)) return;
		setEdgeValue(this._style.margin, edge, 0, 3);
		this.markDirty();
	}
	/**
	* Set border width for one or more edges.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
	* @param value - Border width as points or a parsed Value
	*/
	setBorder(edge, value) {
		if (typeof value !== "number") {
			assertEdgeLength(value, edge, "border");
			if (containsPercent(value)) throw new LengthError(value.source ?? "<Value>", "border widths do not accept percentages", "border");
		}
		if (edgeBorderMatches(this._style.border, edge, value)) return;
		setEdgeBorder(this._style.border, edge, value);
		this.markDirty();
	}
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
	setGap(gutter, value) {
		if (typeof value !== "number") {
			if (gutter === 0 || gutter === 2) assertLengthAxis(value, "inline", "gap");
			if (gutter === 1 || gutter === 2) assertLengthAxis(value, "block", "gap");
		}
		if (gutter !== 0 && gutter !== 1 && gutter !== 2) return;
		if ((gutter === 1 || styleValuesEqual(this._style.gap[0], value)) && (gutter === 0 || styleValuesEqual(this._style.gap[1], value))) return;
		const next = typeof value === "number" ? {
			value,
			unit: 1
		} : value;
		if (gutter !== 1) this._style.gap[0] = next;
		if (gutter !== 0) this._style.gap[1] = next;
		this.markDirty();
	}
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
	setPositionType(positionType) {
		this.setStyleNumber("positionType", positionType);
	}
	/**
	* Set position offset for one or more edges.
	* Only applies when position type is ABSOLUTE or RELATIVE.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
	* @param value - Position offset in points
	*/
	setPosition(edge, value) {
		if (Number.isNaN(value)) {
			if (edgeValueMatches(this._style.position, edge, 0, 0)) return;
			setEdgeValue(this._style.position, edge, 0, 0);
		} else {
			if (edgeValueMatches(this._style.position, edge, value, 1)) return;
			setEdgeValue(this._style.position, edge, value, 1);
		}
		this.markDirty();
	}
	/**
	* Set position offset as a percentage.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
	* @param value - Position offset as a percentage of parent's corresponding dimension
	*/
	setPositionPercent(edge, value) {
		if (edgeValueMatches(this._style.position, edge, value, 2)) return;
		setEdgeValue(this._style.position, edge, value, 2);
		this.markDirty();
	}
	/**
	* Set the display type.
	*
	* @param display - DISPLAY_FLEX or DISPLAY_NONE
	*/
	setDisplay(display) {
		this.setStyleNumber("display", display);
	}
	/**
	* Set the overflow behavior.
	*
	* @param overflow - OVERFLOW_VISIBLE, OVERFLOW_HIDDEN, or OVERFLOW_SCROLL
	*/
	setOverflow(overflow) {
		this.setStyleNumber("overflow", overflow);
	}
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
	setContainerType(containerType) {
		this.setStyleNumber("containerType", containerType);
	}
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
	setContainSize(value) {
		this.setStyleBoolean("containSize", value);
	}
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
	setFitWidth(lanes) {
		if (fitWidthMatches(this._style.fitWidth, lanes)) return;
		if (lanes === void 0 || lanes.length === 0) this._style.fitWidth = void 0;
		else this._style.fitWidth = lanes.map((entry) => typeof entry === "number" ? {
			value: entry,
			unit: 1
		} : entry);
		this.markDirty();
	}
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
	getFrozenQuerySize() {
		return this._frozenQuerySize;
	}
	/**
	* Internal: set the frozen query size during layout. Called by `layoutNode` Pass 1
	* after the node's inline-size is computed but before child layout recursion.
	*
	* Public for the layout module; consumers should never call this directly.
	*
	* @internal
	*/
	_setFrozenQuerySize(size) {
		if (Object.is(this._frozenQuerySize, size)) return;
		this._frozenQuerySize = size;
		this.refreshQueryDependents();
	}
	/**
	* Internal: a MEASURE call's query size for its own descent (layout-zero.ts,
	* #26840). Sets the field without the refresh `_setFrozenQuerySize` does,
	* and returns the stored size for `_restoreFrozenQuerySize`.
	*
	* @internal
	*/
	_swapFrozenQuerySize(size) {
		const stored = this._frozenQuerySize;
		this._frozenQuerySize = size;
		return stored;
	}
	/**
	* Internal: put back the size `_swapFrozenQuerySize` returned. Everything
	* the MEASURE descent cached was derived from its own size, so it is
	* refreshed as for a real resize.
	*
	* @internal
	*/
	_restoreFrozenQuerySize(stored) {
		this._frozenQuerySize = stored;
		this.refreshQueryDependents();
	}
	refreshQueryDependents() {
		this.resetLayoutCache();
		for (let ancestor = this._parent; ancestor !== null; ancestor = ancestor._parent) {
			ancestor._minContentRow = -1;
			ancestor._minContentCol = -1;
		}
	}
	/**
	* Get the width style value.
	*
	* @returns Width value with unit (points, percent, or auto)
	*/
	getWidth() {
		return this._style.width;
	}
	/**
	* Get the height style value.
	*
	* @returns Height value with unit (points, percent, or auto)
	*/
	getHeight() {
		return this._style.height;
	}
	/**
	* Get the minimum width style value.
	*
	* @returns Minimum width value with unit
	*/
	getMinWidth() {
		return this._style.minWidth;
	}
	/**
	* Get the minimum height style value.
	*
	* @returns Minimum height value with unit
	*/
	getMinHeight() {
		return this._style.minHeight;
	}
	/**
	* Get the maximum width style value.
	*
	* @returns Maximum width value with unit
	*/
	getMaxWidth() {
		return this._style.maxWidth;
	}
	/**
	* Get the maximum height style value.
	*
	* @returns Maximum height value with unit
	*/
	getMaxHeight() {
		return this._style.maxHeight;
	}
	/**
	* Get the aspect ratio.
	*
	* @returns Aspect ratio value (NaN if not set)
	*/
	getAspectRatio() {
		return this._style.aspectRatio;
	}
	/**
	* Get the flex grow factor.
	*
	* @returns Flex grow value
	*/
	getFlexGrow() {
		return this._style.flexGrow;
	}
	/**
	* Get the flex shrink factor.
	*
	* @returns Flex shrink value
	*/
	getFlexShrink() {
		return this._style.flexShrink;
	}
	/**
	* Get the flex basis style value.
	*
	* @returns Flex basis value with unit
	*/
	getFlexBasis() {
		return this._style.flexBasis;
	}
	/**
	* Get the flex direction.
	*
	* @returns Flex direction constant
	*/
	getFlexDirection() {
		return this._style.flexDirection;
	}
	/**
	* Get the flex wrap setting.
	*
	* @returns Flex wrap constant
	*/
	getFlexWrap() {
		return this._style.flexWrap;
	}
	/**
	* Get the align items setting.
	*
	* @returns Align items constant
	*/
	getAlignItems() {
		return this._style.alignItems;
	}
	/**
	* Get the align self setting.
	*
	* @returns Align self constant
	*/
	getAlignSelf() {
		return this._style.alignSelf;
	}
	/**
	* Get the align content setting.
	*
	* @returns Align content constant
	*/
	getAlignContent() {
		return this._style.alignContent;
	}
	/**
	* Get the justify content setting.
	*
	* @returns Justify content constant
	*/
	getJustifyContent() {
		return this._style.justifyContent;
	}
	/**
	* Get the padding for a specific edge.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Padding value with unit
	*/
	getPadding(edge) {
		return getEdgeValue(this._style.padding, edge);
	}
	/**
	* Get the margin for a specific edge.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Margin value with unit
	*/
	getMargin(edge) {
		return getEdgeValue(this._style.margin, edge);
	}
	/**
	* Get the border width for a specific edge.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Border width in points
	*/
	getBorder(edge) {
		return getEdgeBorderValue(this._style.border, edge);
	}
	/**
	* Get the position offset for a specific edge.
	*
	* @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
	* @returns Position value with unit
	*/
	getPosition(edge) {
		return getEdgeValue(this._style.position, edge);
	}
	/**
	* Get the position type.
	*
	* @returns Position type constant
	*/
	getPositionType() {
		return this._style.positionType;
	}
	/**
	* Get the display type.
	*
	* @returns Display constant
	*/
	getDisplay() {
		return this._style.display;
	}
	/**
	* Get the overflow setting.
	*
	* @returns Overflow constant
	*/
	getOverflow() {
		return this._style.overflow;
	}
	/**
	* Get the gap for column or row.
	*
	* @param gutter - GUTTER_COLUMN or GUTTER_ROW
	* @returns Gap size in points
	*/
	getGap(gutter) {
		if (gutter === 0) return pointSpacing(this._style.gap[0], "getGap", "node.style.gap");
		else if (gutter === 1) return pointSpacing(this._style.gap[1], "getGap", "node.style.gap");
		return pointSpacing(this._style.gap[0], "getGap", "node.style.gap");
	}
};
//#endregion
//#region src/monospace-measurer.ts
const segmenter$1 = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/**
* Create a monospace text measurement service.
*
* @param charWidth - Width of each character cell (default: 1 for terminal grids)
* @param charHeight - Height of each character cell (default: 1 for terminal grids)
*/
function createMonospaceMeasurer(charWidth = 1, charHeight = 1) {
	return { prepare(input) {
		const { text } = input;
		let graphemeCount = 0;
		for (const _ of segmenter$1.segment(text)) graphemeCount++;
		const totalWidth = graphemeCount * charWidth;
		return {
			intrinsicSizes() {
				return {
					minContentWidth: totalWidth,
					maxContentWidth: totalWidth
				};
			},
			layout(constraints) {
				const width = constraints.maxWidth !== void 0 ? Math.min(totalWidth, constraints.maxWidth) : totalWidth;
				return {
					width,
					height: charHeight,
					lineCount: 1,
					firstBaseline: charHeight,
					lastBaseline: charHeight,
					truncated: width < totalWidth
				};
			}
		};
	} };
}
/**
* Plugin: add monospace text measurement to the engine.
*
* @param charWidth - Width per character cell (default: 1)
* @param charHeight - Height per character cell (default: 1)
*/
function withMonospace(charWidth = 1, charHeight = 1) {
	return (engine) => {
		engine.textLayout = createMonospaceMeasurer(charWidth, charHeight);
		return engine;
	};
}
//#endregion
//#region src/create-flexily.ts
/**
* Composable Flexily engine — createFlexily, createBareFlexily, pipe.
*
* FlexilyNode = Node + { setTextContent, getTextContent }.
* No wrapper — text methods are mixed directly onto the Node instance.
*/
const DEFAULT_TEXT_STYLE = {
	fontShorthand: "1ch monospace",
	fontFamily: "monospace",
	fontSize: 1,
	fontWeight: 400,
	fontStyle: "normal",
	lineHeight: 1
};
/** Mix text content methods onto a Node. Returns the same node typed as FlexilyNode. */
function mixTextContent(node, engine) {
	let textContent = null;
	let prepared = null;
	const origSetMeasure = node.setMeasureFunc.bind(node);
	const origUnsetMeasure = node.unsetMeasureFunc.bind(node);
	const flexNode = node;
	flexNode.setTextContent = function(text, style) {
		if (!engine.textLayout) throw new Error("No TextLayoutService. Add a text plugin (withMonospace, withPretext, withTestMeasurer).");
		textContent = text;
		const resolved = {
			...DEFAULT_TEXT_STYLE,
			...style
		};
		prepared = engine.textLayout.prepare({
			text,
			style: resolved
		});
		const p = prepared;
		origSetMeasure((width, widthMode) => {
			if (widthMode === 0) {
				const sizes = p.intrinsicSizes();
				const result = p.layout({ maxWidth: sizes.maxContentWidth });
				return {
					width: result.width,
					height: result.height
				};
			}
			const result = p.layout({ maxWidth: width });
			return {
				width: widthMode === 2 ? Math.min(width, result.width) : width,
				height: result.height
			};
		});
	};
	flexNode.getTextContent = function() {
		return textContent;
	};
	flexNode.setMeasureFunc = function(fn) {
		textContent = null;
		prepared = null;
		origSetMeasure(fn);
	};
	flexNode.unsetMeasureFunc = function() {
		textContent = null;
		prepared = null;
		origUnsetMeasure();
	};
	return flexNode;
}
/**
* Create a bare Flexily engine — no plugins, just nodes and layout.
* Add plugins via pipe() for text measurement.
*
* @param preset - Defaults preset for `engine.createNode()`. Captured in
*   closure; no module-level state. Defaults to undefined (uses
*   {@link DEFAULT_PRESET}).
*/
function createBareFlexily(preset) {
	const engine = {
		createNode() {
			return mixTextContent(Node.create({ defaults: preset }), engine);
		},
		calculateLayout(root, width, height, direction) {
			root.calculateLayout(width, height, direction ?? 1);
		}
	};
	return engine;
}
/**
* Apply plugins to an engine, left to right.
*
* @example
* ```typescript
* const flex = pipe(createBareFlexily(), withMonospace(), withTestMeasurer())
* ```
*/
function pipe(engine, ...plugins) {
	let result = engine;
	for (const plugin of plugins) result = plugin(result);
	return result;
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
function createFlexily(options) {
	const engine = createBareFlexily(options?.defaults);
	engine.textLayout = createMonospaceMeasurer(options?.charWidth ?? 1, options?.charHeight ?? 1);
	return engine;
}
//#endregion
//#region src/test-measurer.ts
const segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/** Measure a single grapheme cluster with the deterministic width table. */
function graphemeWidth(grapheme, fontSize) {
	const cp = grapheme.codePointAt(0) ?? 0;
	if (cp >= 127744 && cp <= 129791 || cp >= 9728 && cp <= 10175 || cp >= 65024 && cp <= 65039 || cp === 8205 || cp >= 129280 && cp <= 129535 || grapheme.length > 2) return fontSize * 1.8;
	if (cp >= 19968 && cp <= 40959 || cp >= 12288 && cp <= 12351 || cp >= 12352 && cp <= 12447 || cp >= 12448 && cp <= 12543 || cp >= 44032 && cp <= 55215 || cp >= 65280 && cp <= 65519) return fontSize * 1;
	return fontSize * .8;
}
function segmentText(text, fontSize) {
	const segments = [];
	let current = "";
	let currentWidth = 0;
	let isWhitespace = false;
	for (const { segment } of segmenter.segment(text)) {
		const isSpace = segment === " " || segment === "	";
		if (segments.length === 0 && current === "") {
			isWhitespace = isSpace;
			current = segment;
			currentWidth = isSpace ? fontSize * .8 : graphemeWidth(segment, fontSize);
			continue;
		}
		if (isSpace !== isWhitespace) {
			if (current) segments.push({
				text: current,
				width: currentWidth,
				isWhitespace
			});
			current = segment;
			currentWidth = isSpace ? fontSize * .8 : graphemeWidth(segment, fontSize);
			isWhitespace = isSpace;
		} else {
			current += segment;
			currentWidth += isSpace ? fontSize * .8 : graphemeWidth(segment, fontSize);
		}
	}
	if (current) segments.push({
		text: current,
		width: currentWidth,
		isWhitespace
	});
	return segments;
}
function measureString(text, fontSize) {
	let width = 0;
	for (const { segment } of segmenter.segment(text)) width += graphemeWidth(segment, fontSize);
	return width;
}
/**
* Create a deterministic text measurement service for testing.
*
* Uses fixed grapheme widths: Latin 0.8, CJK 1.0, emoji 1.8 (relative to fontSize).
*/
function createTestMeasurer() {
	return { prepare(input) {
		const { text, style } = input;
		const fontSize = style.fontSize;
		const lineHeight = style.lineHeight || fontSize;
		const segments = segmentText(text, fontSize);
		let maxContentWidth = 0;
		let minContentWidth = 0;
		for (const seg of segments) {
			maxContentWidth += seg.width;
			if (!seg.isWhitespace && seg.width > minContentWidth) minContentWidth = seg.width;
		}
		return {
			intrinsicSizes() {
				return {
					minContentWidth,
					maxContentWidth
				};
			},
			layout(constraints, options) {
				const maxWidth = constraints.maxWidth ?? Infinity;
				const maxLines = constraints.maxLines ?? Infinity;
				const wrap = constraints.wrap ?? "normal";
				const includeLines = options?.includeLines ?? false;
				if (wrap === "none" || maxWidth >= maxContentWidth) {
					const truncated = maxLines < 1;
					return {
						width: constraints.shrinkWrap ? maxContentWidth : Math.min(maxWidth, maxContentWidth),
						height: truncated ? 0 : lineHeight,
						lineCount: truncated ? 0 : 1,
						firstBaseline: lineHeight,
						lastBaseline: lineHeight,
						truncated: maxWidth < maxContentWidth,
						lines: includeLines ? [{
							text,
							width: maxContentWidth,
							startIndex: 0,
							endIndex: text.length
						}] : void 0
					};
				}
				const lines = [];
				let lineWidth = 0;
				let lineText = "";
				let lineStart = 0;
				let charIndex = 0;
				for (const seg of segments) {
					if (seg.isWhitespace) {
						if (lineText) {
							lineWidth += seg.width;
							lineText += seg.text;
						}
						charIndex += seg.text.length;
						continue;
					}
					if (lineWidth + seg.width > maxWidth && lineText) {
						const trimmed = lineText.trimEnd();
						lines.push({
							text: trimmed,
							width: measureString(trimmed, fontSize),
							startIndex: lineStart,
							endIndex: charIndex
						});
						if (lines.length >= maxLines) break;
						lineText = seg.text;
						lineWidth = seg.width;
						lineStart = charIndex;
					} else {
						lineText += seg.text;
						lineWidth += seg.width;
					}
					charIndex += seg.text.length;
				}
				if (lineText && lines.length < maxLines) {
					const trimmed = lineText.trimEnd();
					lines.push({
						text: trimmed,
						width: measureString(trimmed, fontSize),
						startIndex: lineStart,
						endIndex: charIndex
					});
				}
				const lineCount = lines.length;
				const height = lineCount * lineHeight;
				const widestLine = lines.reduce((max, l) => Math.max(max, l.width), 0);
				return {
					width: constraints.shrinkWrap ? widestLine : Math.min(maxWidth, widestLine),
					height,
					lineCount,
					firstBaseline: lineHeight,
					lastBaseline: lineCount > 0 ? (lineCount - 1) * lineHeight + lineHeight : lineHeight,
					truncated: lines.length >= maxLines && charIndex < text.length,
					lines: includeLines ? lines : void 0
				};
			}
		};
	} };
}
/**
* Plugin: add deterministic test text measurement to the engine.
*/
function withTestMeasurer() {
	return (engine) => {
		engine.textLayout = createTestMeasurer();
		return engine;
	};
}
//#endregion
//#region src/pretext-measurer.ts
/**
* Create a Pretext-based text measurement service.
*
* @param pretext - The pretext module (import from "@chenglou/pretext")
*/
function createPretextMeasurer(pretext) {
	return { prepare(input) {
		const { text, style } = input;
		const pretextPrepared = pretext.prepare(text, style.fontShorthand);
		const lineHeight = style.lineHeight || style.fontSize;
		let cachedIntrinsic = null;
		return {
			intrinsicSizes() {
				if (cachedIntrinsic) return cachedIntrinsic;
				const unconstrained = pretextPrepared.layout(Infinity, lineHeight);
				cachedIntrinsic = {
					minContentWidth: pretextPrepared.layout(0, lineHeight).width,
					maxContentWidth: unconstrained.width
				};
				return cachedIntrinsic;
			},
			layout(constraints) {
				const maxWidth = constraints.maxWidth ?? Infinity;
				const result = pretextPrepared.layout(maxWidth, lineHeight);
				const lineCount = result.lines?.length ?? 1;
				return {
					width: constraints.shrinkWrap ? result.width : Math.min(maxWidth, result.width),
					height: result.height,
					lineCount,
					firstBaseline: lineHeight,
					lastBaseline: lineCount > 0 ? (lineCount - 1) * lineHeight + lineHeight : lineHeight,
					truncated: false
				};
			}
		};
	} };
}
/**
* Plugin: add Pretext-based proportional text measurement.
*
* @param pretext - The pretext module (import from "@chenglou/pretext")
*/
function withPretext(pretext) {
	return (engine) => {
		engine.textLayout = createPretextMeasurer(pretext);
		return engine;
	};
}
//#endregion
export { ALIGN_AUTO, ALIGN_BASELINE, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_FLEX_START, ALIGN_SPACE_AROUND, ALIGN_SPACE_BETWEEN, ALIGN_SPACE_EVENLY, ALIGN_STRETCH, CONTAINER_TYPE_INLINE_SIZE, CONTAINER_TYPE_NORMAL, DEFAULT_PRESET, DIRECTION_INHERIT, DIRECTION_LTR, DIRECTION_RTL, DISPLAY_FLEX, DISPLAY_NONE, EDGE_ALL, EDGE_BOTTOM, EDGE_END, EDGE_HORIZONTAL, EDGE_LEFT, EDGE_RIGHT, EDGE_START, EDGE_TOP, EDGE_VERTICAL, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_COLUMN_REVERSE, FLEX_DIRECTION_ROW, FLEX_DIRECTION_ROW_REVERSE, GUTTER_ALL, GUTTER_COLUMN, GUTTER_ROW, JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_FLEX_START, JUSTIFY_SPACE_AROUND, JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_EVENLY, LengthError, MEASURE_MODE_AT_MOST, MEASURE_MODE_EXACTLY, MEASURE_MODE_MIN_CONTENT, MEASURE_MODE_UNDEFINED, Node, OVERFLOW_HIDDEN, OVERFLOW_SCROLL, OVERFLOW_VISIBLE, POSITION_TYPE_ABSOLUTE, POSITION_TYPE_RELATIVE, POSITION_TYPE_STATIC, UNIT_AUTO, UNIT_CALC, UNIT_CH, UNIT_CQI, UNIT_CQMIN, UNIT_FIT_CONTENT, UNIT_LH, UNIT_PERCENT, UNIT_POINT, UNIT_SNUG_CONTENT, UNIT_UNDEFINED, WRAP_NO_WRAP, WRAP_WRAP, WRAP_WRAP_REVERSE, createBareFlexily, createDefaultStyle, createFlexily, createMonospaceMeasurer, createPretextMeasurer, createTestMeasurer, createValue, layoutCacheHits, layoutNodeCalls, layoutPositioningCalls, layoutSizingCalls, parseLength, pipe, resetLayoutStats, withMonospace, withPretext, withTestMeasurer };

//# sourceMappingURL=index.mjs.map