/* tslint:disable */
/* eslint-disable */

export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    analyze(text: string, base: number): number;
    analyze_line(text: string, base: number, start: number, end: number): number;
    metadata(): Float64Array;
    constructor();
    read_bidi_runs(start: number, count: number): Float64Array;
    read_candidates(start: number, count: number): Float64Array;
    read_levels(start: number, count: number): Float64Array;
    read_paragraphs(start: number, count: number): Float64Array;
    read_runs(start: number, count: number): Float64Array;
    read_visual_indices(start: number, count: number): Float64Array;
    reset_results(): void;
}

export function live_sessions(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_analyze: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly engine_analyze_line: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly engine_metadata: (a: number) => [number, number, number, number];
    readonly engine_new: () => number;
    readonly engine_read_bidi_runs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_read_candidates: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_read_levels: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_read_paragraphs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_read_runs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_read_visual_indices: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_reset_results: (a: number) => void;
    readonly live_sessions: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
