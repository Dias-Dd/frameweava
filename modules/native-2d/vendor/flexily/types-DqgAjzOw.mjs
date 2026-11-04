import "./constants-CFQ3iRCM.mjs";
//#region src/length.ts
/** CSS length grammar. Scale comes from the adapter; percentages stay late-bound. */
var LengthError = class extends Error {
	input;
	reason;
	prop;
	constructor(input, reason, prop) {
		super(`${prop ? `${prop}: ` : ""}${JSON.stringify(input)} — ${reason}`);
		this.input = input;
		this.reason = reason;
		this.prop = prop;
		this.name = "LengthError";
	}
};
/** Parse once at style set. Changing an adapter's scale requires re-setting its styles. */
function parseLength(input, scale) {
	const fail = (reason) => {
		throw new LengthError(input, reason);
	};
	if (!scale || !Number.isFinite(scale.ch) || scale.ch <= 0 || !Number.isFinite(scale.lh) || scale.lh <= 0) fail("adapter scale ch and lh must be finite and greater than zero");
	let pos = 0;
	let math = false;
	const space = (at) => /[ \t\r\n\f]/.test(input[at] ?? "");
	const skip = () => {
		while (space(pos)) pos++;
	};
	const number = (expr) => "unit" in expr && expr.unit === 11;
	const leaf = (value, unit) => {
		if (!Number.isFinite(value)) fail("length or constant must be finite");
		return Object.freeze({
			value,
			unit
		});
	};
	function primary(inMath) {
		skip();
		if (inMath && input[pos] === "(") {
			pos++;
			const expr = sum();
			skip();
			if (input[pos++] !== ")") fail("expected closing parenthesis");
			return expr;
		}
		const name = /^[a-z]+/i.exec(input.slice(pos))?.[0].toLowerCase();
		if (name) {
			if (!inMath) math = true;
			pos += name.length;
			if (input[pos++] !== "(" || ![
				"calc",
				"min",
				"max",
				"clamp"
			].includes(name)) fail("expected a length or calc(), min(), max(), clamp()");
			const args = [sum()];
			skip();
			while (input[pos] === ",") {
				pos++;
				args.push(sum());
				skip();
			}
			if (input[pos++] !== ")") fail("expected closing parenthesis");
			if (name === "calc") {
				if (args.length !== 1) fail("calc() takes one expression");
				return args[0];
			}
			if (args.some(number)) fail("unitless numbers are only multiplication or division operands");
			if (name === "clamp") {
				if (args.length !== 3) fail("clamp() takes exactly three lengths");
				return Object.freeze({
					fn: "clamp",
					args: Object.freeze(args)
				});
			}
			return Object.freeze({
				fn: name,
				args: Object.freeze(args)
			});
		}
		const token = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?/i.exec(input.slice(pos))?.[0];
		if (!token) return fail("expected a length");
		pos += token.length;
		const value = Number(token);
		if (input[pos] === "%") {
			pos++;
			return leaf(value, 2);
		}
		const unit = /^[a-z]+/i.exec(input.slice(pos))?.[0].toLowerCase();
		if (!unit) return leaf(value, 11);
		pos += unit.length;
		if (unit === "ch") return leaf(value * scale.ch, 9);
		if (unit === "lh") return leaf(value * scale.lh, 10);
		if (unit === "cqi") return leaf(value, 6);
		if (unit === "px") fail("px has no adapter pixel scale; use ch for columns or lh for rows");
		if ([
			"cqmin",
			"cqb",
			"cqmax"
		].includes(unit)) fail(`${unit} waits for #26239`);
		return fail(`unsupported length unit ${unit}; use ch, lh, % or cqi`);
	}
	function product() {
		let left = primary(true);
		skip();
		while (input[pos] === "*" || input[pos] === "/") {
			const op = input[pos++];
			const right = primary(true);
			if (op === "/" && (!number(right) || right.value === 0)) fail(number(right) ? "division by zero" : "divide only by a unitless constant");
			if (op === "*" && !number(left) && !number(right)) fail("multiply only by a unitless constant");
			left = number(left) && number(right) ? leaf(op === "*" ? left.value * right.value : left.value / right.value, 11) : Object.freeze({
				op,
				left,
				right
			});
			skip();
		}
		return left;
	}
	function sum() {
		let left = product();
		skip();
		while (input[pos] === "+" || input[pos] === "-") {
			const op = input[pos];
			if (!space(pos - 1) || !space(pos + 1)) fail(`write spaces on both sides of binary ${op}; for example: 100% ${op} 2ch`);
			pos++;
			const right = product();
			if (number(left) || number(right)) fail("unitless numbers are only multiplication or division operands");
			left = Object.freeze({
				op,
				left,
				right
			});
			skip();
		}
		return left;
	}
	const expr = primary(false);
	skip();
	if (pos !== input.length) {
		if (/[+*/-]/.test(input[pos])) fail(`wrap it: calc(${input})`);
		fail("unexpected input after the length");
	}
	if (number(expr)) fail("unitless numbers are only multiplication or division operands; lengths need units");
	if ("unit" in expr) {
		if (!math && expr.value < 0) fail("negative bare dimensions are invalid; put arithmetic inside calc()");
		return Object.freeze({
			...expr,
			source: input
		});
	}
	return Object.freeze({
		value: 0,
		unit: 8,
		expr,
		source: input
	});
}
/** Validate units when the dimension's axis is known; basis is checked by its parent. */
function assertLengthAxis(value, axis, prop) {
	function mismatch(expr) {
		if ("unit" in expr) {
			if (expr.unit === 8) return expr.expr ? mismatch(expr.expr) : false;
			return axis === "inline" ? expr.unit === 10 : expr.unit === 9 || expr.unit === 6;
		}
		if ("op" in expr) return mismatch(expr.left) || mismatch(expr.right);
		return expr.args.some(mismatch);
	}
	if (mismatch(value)) throw new LengthError(value.source ?? "<Value>", `use ${axis === "inline" ? "ch or % on the inline axis" : "lh or % on the block axis"}; cross-axis units have no adapter aspect ratio`, prop);
}
//#endregion
//#region src/utils.ts
/**
* Flexily Utility Functions
*
* Helper functions for edge value manipulation and value resolution.
*/
/**
* Shared traversal stack for iterative tree operations.
* Avoids recursion (prevents stack overflow on deep trees) and avoids
* allocation during layout passes.
*/
const traversalStack = [];
function styleValueMatches(current, value, unit) {
	return current.unit === unit && Object.is(current.value, value);
}
function styleValuesEqual(current, next, unit = 1) {
	return typeof next === "number" ? styleValueMatches(current, next, unit) : styleValueMatches(current, next.value, next.unit) && current.expr === next.expr;
}
/** Validate all selected axes before changing any edge slot. */
function assertEdgeLength(value, edge, prop) {
	if (edge !== 1 && edge !== 3 && edge !== 7) assertLengthAxis(value, "inline", prop);
	if (edge === 1 || edge === 3 || edge === 7 || edge === 8) assertLengthAxis(value, "block", prop);
}
/** Numeric style getters cannot discard a user-set unit. */
function pointSpacing(value, getter, path) {
	if (value.unit === 0) return NaN;
	if (value.unit !== 1) throw new LengthError(value.source ?? "<Value>", `read the stored Value at ${path}`, getter);
	return value.value;
}
/**
* Return true when setEdgeValue would leave the edge array unchanged.
*/
function edgeValueMatches(arr, edge, value, unit = 1) {
	switch (edge) {
		case 0: return styleValuesEqual(arr[0], value, unit);
		case 1: return styleValuesEqual(arr[1], value, unit);
		case 2: return styleValuesEqual(arr[2], value, unit);
		case 3: return styleValuesEqual(arr[3], value, unit);
		case 6: return styleValuesEqual(arr[0], value, unit) && styleValuesEqual(arr[2], value, unit);
		case 7: return styleValuesEqual(arr[1], value, unit) && styleValuesEqual(arr[3], value, unit);
		case 8: return styleValuesEqual(arr[0], value, unit) && styleValuesEqual(arr[1], value, unit) && styleValuesEqual(arr[2], value, unit) && styleValuesEqual(arr[3], value, unit);
		case 4: return styleValuesEqual(arr[4], value, unit);
		case 5: return styleValuesEqual(arr[5], value, unit);
		default: return true;
	}
}
function edgeBorderMatches(arr, edge, value) {
	if (typeof value === "number" && Number.isNaN(value) && (edge === 4 || edge === 5)) return edgeValueMatches(arr, edge, 0, 0);
	return edgeValueMatches(arr, edge, value);
}
/**
* Set a value on an edge array (supports all edge types including logical START/END).
*/
function setEdgeValue(arr, edge, value, unit = 1) {
	const v = typeof value === "number" ? {
		value,
		unit
	} : value;
	switch (edge) {
		case 0:
			arr[0] = v;
			break;
		case 1:
			arr[1] = v;
			break;
		case 2:
			arr[2] = v;
			break;
		case 3:
			arr[3] = v;
			break;
		case 6:
			arr[0] = v;
			arr[2] = v;
			break;
		case 7:
			arr[1] = v;
			arr[3] = v;
			break;
		case 8:
			arr[0] = v;
			arr[1] = v;
			arr[2] = v;
			arr[3] = v;
			break;
		case 4:
			arr[4] = v;
			break;
		case 5: arr[5] = v;
	}
}
/**
* Set a border value on an edge array.
*/
function setEdgeBorder(arr, edge, value) {
	if (typeof value === "number" && Number.isNaN(value) && (edge === 4 || edge === 5)) setEdgeValue(arr, edge, 0, 0);
	else setEdgeValue(arr, edge, value);
}
/**
* Normalize an edge getter to its stored slot. Aggregates use the left edge.
*/
function getEdgeIndex(edge) {
	switch (edge) {
		case 0: return 0;
		case 1: return 1;
		case 2: return 2;
		case 3: return 3;
		case 4: return 4;
		case 5: return 5;
		default: return 0;
	}
}
/** Read a stored edge Value with the existing aggregate/unknown left fallback. */
function getEdgeValue(arr, edge) {
	return arr[getEdgeIndex(edge)];
}
/**
* Get a border value from an edge array.
*/
function getEdgeBorderValue(arr, edge) {
	return pointSpacing(getEdgeValue(arr, edge), "getBorder", "node.style.border");
}
/**
* Walk up the parent chain from `node`, return the nearest ancestor's frozen
* container-query inline-size (set by Pass 1 of layoutNode). The layout root
* is the implicit viewport container. NaN if no ancestor has been frozen yet.
*
* Used at resolveValue call sites for cqi/cqmin units (A0.1 Pass 2 consumption).
* The walk skips `node` itself — a CQ container's OWN width/height/padding values
* resolve against its PARENT's queryInlineSize (the container is the queried
* subject, not the query target). This matches CSS where `container-type: inline-size`
* + `width: 50cqi` would create a self-referential cycle; CSS resolves this by
* defining `cqi` against the *parent* containment context.
*
* O(tree depth), computed once for each node's own layout/measurement context.
* Direct child resolutions reuse the context derived by their parent.
*/
function findContainerQuerySize(node) {
	let cur = node.getParent();
	while (cur !== null) {
		const size = cur.getFrozenQuerySize();
		if (!Number.isNaN(size)) return size;
		cur = cur.getParent();
	}
	return NaN;
}
/** Dimensional values; excludes auto, content-sizing keywords and scalar operands. */
function isLength(unit) {
	return unit === 1 || unit === 2 || unit === 6 || unit === 7 || unit === 8 || unit === 9 || unit === 10;
}
/**
* Resolve a value (point, percent, or container-query unit) to an absolute number.
*
* Container-query units (`UNIT_CQI`, `UNIT_CQMIN`) resolve against `queryInlineSize`,
* which must be the **frozen** inline-size of the nearest CQ ancestor (Phase 1 of the
* A0.1 two-phase layout). When no CQ ancestor exists (i.e. `queryInlineSize` is NaN),
* cqi/cqmin resolve to 0 — same defensive convention as `UNIT_PERCENT` against NaN.
*
* In Phase 1, cqmin is identical to cqi because block-size queries aren't wired yet.
* The constant is reserved for forward-compat.
*/
function resolveValue(value, availableSize, queryInlineSize = NaN) {
	switch (value.unit) {
		case 1:
		case 9:
		case 10:
		case 11: return value.value;
		case 2:
			if (Number.isNaN(availableSize)) return 0;
			return availableSize * (value.value / 100);
		case 6:
		case 7:
			if (Number.isNaN(queryInlineSize)) return 0;
			return queryInlineSize * (value.value / 100);
		case 8:
			if (!value.expr) return 0;
			return evaluateMathExpr(value.expr, availableSize, queryInlineSize, value.source);
		default: return 0;
	}
}
/**
* Evaluate a math-function expression (A0.3) against the current resolution
* context. Recursively resolves leaf `Value`s via `resolveValue` and applies
* `min` / `max` / `clamp` semantics. CSS-aligned:
*   - `min()` / `max()` with zero args fall back to 0 (defensive; spec disallows)
*   - `clamp(min, val, max)` enforces `min ≤ result ≤ max`, with `min` winning
*     ties when `min > max` (CSS clamp definition)
*/
function evaluateMathExpr(expr, availableSize, queryInlineSize, source = "<MathExpr>") {
	if ("unit" in expr) return resolveValue(expr, availableSize, queryInlineSize);
	if ("op" in expr) {
		const left = evaluateMathExpr(expr.left, availableSize, queryInlineSize, source);
		const right = evaluateMathExpr(expr.right, availableSize, queryInlineSize, source);
		if (expr.op === "/" && right === 0) throw new LengthError(source, "division by zero");
		const result = expr.op === "+" ? left + right : expr.op === "-" ? left - right : expr.op === "*" ? left * right : left / right;
		if (!Number.isFinite(result)) throw new LengthError(source, "arithmetic must produce a finite length");
		return result;
	}
	if (expr.fn === "min") {
		if (expr.args.length === 0) return 0;
		let acc = Infinity;
		for (const arg of expr.args) {
			const v = evaluateMathExpr(arg, availableSize, queryInlineSize, source);
			if (v < acc) acc = v;
		}
		return acc;
	}
	if (expr.fn === "max") {
		if (expr.args.length === 0) return 0;
		let acc = -Infinity;
		for (const arg of expr.args) {
			const v = evaluateMathExpr(arg, availableSize, queryInlineSize, source);
			if (v > acc) acc = v;
		}
		return acc;
	}
	const minV = evaluateMathExpr(expr.args[0], availableSize, queryInlineSize, source);
	const val = evaluateMathExpr(expr.args[1], availableSize, queryInlineSize, source);
	const maxV = evaluateMathExpr(expr.args[2], availableSize, queryInlineSize, source);
	if (minV > maxV) return minV;
	if (val < minV) return minV;
	if (val > maxV) return maxV;
	return val;
}
let unknownBaseWidths = 0;
/** The pass count of nodes that sized their own percentage width as content. */
function unknownBaseWidthCount() {
	return unknownBaseWidths;
}
/** Set the pass count and return the previous one; a pass starts at 0 and restores the outer count. */
function swapUnknownBaseWidthCount(value) {
	const previous = unknownBaseWidths;
	unknownBaseWidths = value;
	return previous;
}
/** Preferred width needs content when its percentage base is not known yet.
* Alignment eligibility and parent allocation are separate questions.
*/
function widthUsesContent(value, available) {
	return !isLength(value.unit) || pctIndefinite(value, available);
}
/** Count a node's own percentage width that must size as content for now. */
function countUnknownBaseWidth(value, available) {
	if (isLength(value.unit) && pctIndefinite(value, available)) unknownBaseWidths++;
}
/** True when a percentage or percentage-containing math constraint is indefinite. */
function pctIndefinite(value, available) {
	return Number.isNaN(available) && containsPercent(value);
}
function containsPercent(expr) {
	if ("unit" in expr) return expr.unit === 2 || expr.expr !== void 0 && containsPercent(expr.expr);
	if ("op" in expr) return containsPercent(expr.left) || containsPercent(expr.right);
	for (const arg of expr.args) if (containsPercent(arg)) return true;
	return false;
}
/**
* Apply min/max constraints to a size.
*
* CSS behavior:
* - min: Floor constraint. Does NOT affect children's layout — the container expands
*   after shrink-wrap. When size is NaN (auto-sized), min is NOT applied here;
*   the post-shrink-wrap applyMinMax call (Phase 9) handles it.
* - max: Ceiling constraint. DOES affect children's layout — content wraps/clips
*   within the max. When size is NaN (auto-sized), max constrains the container
*   so children are laid out within the max bound.
*
* Percent constraints that can't resolve (available is NaN) are skipped entirely,
* since resolveValue returns 0 for percent-against-NaN, which would incorrectly
* clamp sizes to 0.
*/
function applyMinMax(size, min, max, available, queryInlineSize = NaN) {
	let result = size;
	if (max.unit !== 0) {
		if (pctIndefinite(max, available)) {} else {
			const maxValue = resolveValue(max, available, queryInlineSize);
			if (!Number.isNaN(maxValue)) {
				if (!Number.isNaN(result)) result = Math.min(result, maxValue);
			}
		}
	}
	if (min.unit !== 0) {
		if (pctIndefinite(min, available)) {} else {
			const minValue = resolveValue(min, available, queryInlineSize);
			if (!Number.isNaN(minValue)) {
				if (!Number.isNaN(result)) result = Math.max(result, minValue);
			}
		}
	}
	return result;
}
//#endregion
//#region src/logger.ts
// Frameweave admission: no optional module detection or wall-clock logging.
const log = Object.freeze({debug: undefined});
//#endregion
//#region src/layout-helpers.ts
/**
* Layout Helper Functions
*
* Edge resolution helpers for margins, padding, borders.
* These are pure functions with no state — safe to extract.
*/
/** A missing query argument identifies classic's existing numeric contract. */
function resolveSpacingValue(value, availableSize, queryInlineSize, prop = "spacing") {
	if (queryInlineSize === void 0 && value.unit !== 1 && value.unit !== 2 && value.unit !== 3 && value.unit !== 0) throw new LengthError(value.source ?? "<Value>", "production engine only", prop);
	return resolveValue(value, availableSize, queryInlineSize);
}
/**
* Check if flex direction is row-oriented (horizontal main axis).
*/
function isRowDirection(flexDirection) {
	return flexDirection === 2 || flexDirection === 3;
}
/**
* Check if flex direction is reversed.
*/
function isReverseDirection(flexDirection) {
	return flexDirection === 3 || flexDirection === 1;
}
/**
* Get the logical edge value (START/END) for a given physical index.
* Returns undefined if no logical value applies to this physical edge.
*
* EDGE_START/EDGE_END always resolve along the inline (horizontal) axis,
* regardless of flex direction. Direction (LTR/RTL) determines the mapping:
* - LTR: START->left, END->right
* - RTL: START->right, END->left
*/
function getLogicalEdgeValue(arr, physicalIndex, _flexDirection, direction = 1) {
	const isRTL = direction === 2;
	if (physicalIndex === 0) return isRTL ? arr[5] : arr[4];
	else if (physicalIndex === 2) return isRTL ? arr[4] : arr[5];
}
/**
* Resolve logical (START/END) margins/padding to physical values.
* EDGE_START/EDGE_END always resolve along the inline (horizontal) axis:
* - LTR: START->left, END->right
* - RTL: START->right, END->left
*
* Physical edges (LEFT/RIGHT/TOP/BOTTOM) are used directly.
* When both physical and logical are set, logical takes precedence.
*/
function resolveEdgeValue(arr, physicalIndex, flexDirection, availableSize, direction = 1, queryInlineSize, prop = "spacing") {
	const logicalValue = getLogicalEdgeValue(arr, physicalIndex, flexDirection, direction);
	const value = logicalValue && logicalValue.unit !== 0 ? logicalValue : arr[physicalIndex];
	return value.unit === 1 ? value.value : resolveSpacingValue(value, availableSize, queryInlineSize, prop);
}
/**
* Check if a logical edge margin is set to auto.
*/
function isEdgeAuto(arr, physicalIndex, flexDirection, direction = 1) {
	const logicalValue = getLogicalEdgeValue(arr, physicalIndex, flexDirection, direction);
	if (logicalValue && logicalValue.unit !== 0) return logicalValue.unit === 3;
	return arr[physicalIndex].unit === 3;
}
/**
* Resolve logical (START/END) position edges to physical values.
* Returns the resolved Value for a physical position index, considering
* logical EDGE_START/EDGE_END. Logical takes precedence over physical.
*
* EDGE_START/EDGE_END always resolve along the inline (horizontal) axis:
* - LTR: START->left, END->right
* - RTL: START->right, END->left
*/
function resolvePositionEdge(arr, physicalIndex, direction = 1) {
	const logicalValue = getLogicalEdgeValue(arr, physicalIndex, 0, direction);
	if (logicalValue && logicalValue.unit !== 0) return logicalValue;
	return arr[physicalIndex];
}
function resolveEdgeBorderValue(arr, physicalIndex, flexDirection, direction = 1, queryInlineSize) {
	return resolveEdgeValue(arr, physicalIndex, flexDirection, 0, direction, queryInlineSize, "border");
}
//#endregion
//#region src/defaults.ts
/** Static default preset. Phase 6 flips this to `"css"`. */
const DEFAULT_PRESET = "yoga";
//#endregion
//#region src/types.ts
/**
* Flexily Types
*
* TypeScript interfaces for the flexbox layout engine.
*/
/**
* Create a default Value (undefined).
*/
function createValue(value = 0, unit = 0) {
	return {
		value,
		unit
	};
}
const POINT_ZERO = Object.freeze({
	value: 0,
	unit: 1
});
const UNSET_EDGE = Object.freeze({
	value: 0,
	unit: 0
});
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
function createDefaultStyle(preset = DEFAULT_PRESET) {
	const isCss = preset === "css";
	return {
		display: 0,
		positionType: 1,
		position: [
			createValue(),
			createValue(),
			createValue(),
			createValue(),
			createValue(),
			createValue()
		],
		flexDirection: 2,
		flexWrap: 0,
		flexGrow: 0,
		flexShrink: isCss ? 1 : 0,
		flexBasis: createValue(0, 3),
		alignItems: 4,
		alignSelf: 0,
		alignContent: isCss ? 4 : 1,
		justifyContent: 0,
		width: createValue(0, 3),
		height: createValue(0, 3),
		minWidth: isCss ? createValue(0, 3) : createValue(),
		minHeight: isCss ? createValue(0, 3) : createValue(),
		maxWidth: createValue(),
		maxHeight: createValue(),
		aspectRatio: NaN,
		margin: [
			createValue(),
			createValue(),
			createValue(),
			createValue(),
			createValue(),
			createValue()
		],
		padding: [
			createValue(),
			createValue(),
			createValue(),
			createValue(),
			createValue(),
			createValue()
		],
		border: [
			POINT_ZERO,
			POINT_ZERO,
			POINT_ZERO,
			POINT_ZERO,
			UNSET_EDGE,
			UNSET_EDGE
		],
		gap: [POINT_ZERO, POINT_ZERO],
		overflow: 0,
		containerType: 0,
		containSize: false,
		fitWidth: void 0
	};
}
//#endregion
export { swapUnknownBaseWidthCount as A, pctIndefinite as C, setEdgeValue as D, setEdgeBorder as E, assertLengthAxis as F, parseLength as I, unknownBaseWidthCount as M, widthUsesContent as N, styleValueMatches as O, LengthError as P, isLength as S, resolveValue as T, edgeValueMatches as _, isReverseDirection as a, getEdgeIndex as b, resolveEdgeValue as c, log as d, applyMinMax as f, edgeBorderMatches as g, countUnknownBaseWidth as h, isEdgeAuto as i, traversalStack as j, styleValuesEqual as k, resolvePositionEdge as l, containsPercent as m, createValue as n, isRowDirection as o, assertEdgeLength as p, DEFAULT_PRESET as r, resolveEdgeBorderValue as s, createDefaultStyle as t, resolveSpacingValue as u, findContainerQuerySize as v, pointSpacing as w, getEdgeValue as x, getEdgeBorderValue as y };

//# sourceMappingURL=types-DqgAjzOw.mjs.map