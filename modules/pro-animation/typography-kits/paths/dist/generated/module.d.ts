/* tslint:disable */
/* eslint-disable */

/**
 * Stage-local owned geometry session behind the existing wasm-bindgen data Kit.
 * Input/output are chunked; there is no new Stage, timeline, scheduler or renderer.
 */
export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Append interleaved physical x/y values to the current contour; no whole-input transport cap is added.
     */
    append(values: Float64Array, finish: boolean): void;
    /**
     * Start a new solve using an explicit physical-pixel integer grid and floating origin.
     */
    begin(grid: number, origin_x: number, origin_y: number): void;
    /**
     * Boolean modes: 0 union, 1 intersection, 2 first-minus-rest, 3 xor.
     */
    boolean(operation: number): number;
    collapsed_contours(): number;
    /**
     * Returns point counts for the solid outer ring followed by each immediate hole.
     */
    face_info(face: number): Float64Array;
    /**
     * Normalize one PathData operand with its own fill rule before combining operands.
     * Rule 0=nonzero, 1=evenodd; overlapping independent operands never cancel by winding accident.
     */
    finish_operand(rule: number): void;
    /**
     * Finish a raw centerline contour. Unlike filled operands, two distinct open points are valid.
     */
    finish_stroke_contour(closed: boolean): void;
    input_points(): number;
    constructor();
    /**
     * Offset the already-normalized union. Positive expands filled regions, negative insets them.
     * Joins 0=miter, 1=round, 2=bevel, 3=square; tolerances are physical pixels.
     */
    offset(distance: number, join: number, miter: number, arc_tolerance: number): number;
    /**
     * Read a bounded transport chunk. The caller never sees Rust pointers or a live memory view.
     */
    read_contour(face: number, contour: number, start: number, count: number): Float64Array;
    /**
     * Release owned geometry after consumption/error without destroying the reusable Kit session.
     */
    reset(): void;
    /**
     * Convert raw centerlines to true filled stroke outlines. width is full physical pixel width.
     * Open caps 0=butt,1=round,2=square; closed paths use Joined, never Polygon filling.
     */
    stroke(width: number, cap: number, join: number, miter: number, arc_tolerance: number): number;
}

export function live_sessions(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_append: (a: number, b: number, c: number, d: number) => [number, number];
    readonly engine_begin: (a: number, b: number, c: number, d: number) => [number, number];
    readonly engine_boolean: (a: number, b: number) => [number, number, number];
    readonly engine_collapsed_contours: (a: number) => number;
    readonly engine_face_info: (a: number, b: number) => [number, number, number, number];
    readonly engine_finish_operand: (a: number, b: number) => [number, number];
    readonly engine_finish_stroke_contour: (a: number, b: number) => [number, number];
    readonly engine_input_points: (a: number) => number;
    readonly engine_new: () => number;
    readonly engine_offset: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly engine_read_contour: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly engine_reset: (a: number) => void;
    readonly engine_stroke: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly live_sessions: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
