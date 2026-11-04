/* tslint:disable */
/* eslint-disable */

/**
 * One owned font instance per existing Kit client. No font registry, OS font loader or downloads.
 */
export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    append_font(bytes: Uint8Array): void;
    begin_font(): void;
    /**
     * Original Skrifa COLRv0/v1 traversal, with its cycle/depth guards intact. No pixel rasterization.
     * Version 1 header + format (-1 means no COLR), followed by ColorPainter events.
     */
    color_glyph_paint(glyph: number): Float64Array;
    /**
     * Original CPAL entries, source sRGB straight RGBA bytes. Conversion/composition is explicit downstream.
     */
    color_palette(index: number): Float64Array;
    finish_font(face_index: number): number;
    /**
     * Packed OpenType tags plus original axis order/range/default/hidden.
     */
    font_axes(): Float64Array;
    /**
     * Exact strikes, not implicit nearest-size selection. Format: 0 sbix, 1 CBDT/CBLC, 2 EBDT/EBLC.
     */
    font_bitmap_strikes(format: number): Float64Array;
    /**
     * Reviewed Native COLRv1 callback profile, including degenerate-linear no-paint semantics.
     */
    font_color_profile(): number;
    /**
     * Encoded/packed original subresource bytes only, selected from the owned SFNT by glyph/format/strike.
     * Caller-supplied offsets, URLs, filesystem paths and compressed-document decoding are not accepted.
     */
    font_embedded_bytes(glyph: number, format: number, strike: number): Uint8Array;
    /**
     * Schema1. SVG: [1,3,recordIndex,startGlyph,endGlyph,bytes,gzip].
     * Bitmap: [1,format,strike,glyph,w,h,ppemX,ppemY,bearingX,bearingY,innerX,innerY,
     * advancePresent,advance,origin(0 top-left/1 bottom-left),encoding(0 png/1 bgra/2 mask),bpp,packed,bytes].
     */
    font_embedded_metadata(glyph: number, format: number, strike: number): Float64Array;
    /**
     * Original Skrifa global metrics, unscaled font units, immutable current instance.
     */
    font_metrics(): Float64Array;
    /**
     * Original unhinted metrics/control bounds; not tight rendered-ink certification.
     */
    glyph_metrics(glyphs: Uint32Array): Float64Array;
    /**
     * Canonical nominal cmap only; no claim this replaces shaping.
     */
    map_codepoints(points: Uint32Array): Float64Array;
    /**
     * Status:0 absent sequence,1 use-default mapping,2 explicit variant mapping.
     */
    map_variants(pairs: Uint32Array): Float64Array;
    constructor();
    /**
     * Actual normalized 2.14 coordinates, useful for reproducible font-instance provenance.
     */
    normalized_coords(): Float64Array;
    outline_glyph(glyph: number): number;
    read_glyphs(start: number, count: number): Float64Array;
    read_outline(start: number, count: number): Float64Array;
    reset_results(): void;
    /**
     * Strict design-space settings -> original AVAR-aware normalized location.
     * This does NOT mutate the shaping instance or earlier glyph results.
     */
    resolve_location(settings: string): Float64Array;
    /**
     * Absolute design-space settings, independent of the previous instance. E.g. wght=700,wdth=100.
     */
    set_variations(settings: string): void;
    /**
     * Original HarfRust direction + joining context. Run clusters remain local UTF16 offsets.
     * 0 LTR, 1 RTL, 2 TTB, 3 BTT; direction is never disguised as paragraph bidi.
     */
    shape_run_context(text: string, direction: number, script: string, language: string, features: string, before: string, after: string): number;
    /**
     * A single explicitly directed/scripted run, not paragraph bidi/itemization or fallback.
     * Clusters enter as UTF-16 logical offsets; positions remain font units/y-up until the TS adapter maps them.
     */
    shape_run(text: string, direction: number, script: string, language: string, features: string): number;
}

export function live_sessions(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_append_font: (a: number, b: number, c: number) => [number, number];
    readonly engine_begin_font: (a: number) => void;
    readonly engine_color_glyph_paint: (a: number, b: number) => [number, number, number, number];
    readonly engine_color_palette: (a: number, b: number) => [number, number, number, number];
    readonly engine_finish_font: (a: number, b: number) => [number, number, number];
    readonly engine_font_axes: (a: number) => [number, number, number, number];
    readonly engine_font_bitmap_strikes: (a: number, b: number) => [number, number, number, number];
    readonly engine_font_color_profile: (a: number) => number;
    readonly engine_font_embedded_bytes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly engine_font_embedded_metadata: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly engine_font_metrics: (a: number) => [number, number, number, number];
    readonly engine_glyph_metrics: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_map_codepoints: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_map_variants: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_new: () => number;
    readonly engine_normalized_coords: (a: number) => [number, number, number, number];
    readonly engine_outline_glyph: (a: number, b: number) => [number, number, number];
    readonly engine_read_glyphs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_read_outline: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_reset_results: (a: number) => void;
    readonly engine_resolve_location: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_set_variations: (a: number, b: number, c: number) => [number, number];
    readonly engine_shape_run: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly engine_shape_run_context: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => [number, number, number];
    readonly live_sessions: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
