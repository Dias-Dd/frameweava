/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_engine_free: (a: number, b: number) => void;
export const engine_append: (a: number, b: number, c: number, d: number) => [number, number];
export const engine_begin: (a: number, b: number, c: number, d: number) => [number, number];
export const engine_boolean: (a: number, b: number) => [number, number, number];
export const engine_collapsed_contours: (a: number) => number;
export const engine_face_info: (a: number, b: number) => [number, number, number, number];
export const engine_finish_operand: (a: number, b: number) => [number, number];
export const engine_finish_stroke_contour: (a: number, b: number) => [number, number];
export const engine_input_points: (a: number) => number;
export const engine_new: () => number;
export const engine_offset: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
export const engine_read_contour: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
export const engine_reset: (a: number) => void;
export const engine_stroke: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const live_sessions: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
