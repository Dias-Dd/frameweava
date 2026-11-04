// SPDX-License-Identifier: Apache-2.0 AND MIT; original pinned generator/glue.
export function createBinding(){
var __FrameweaveBindgen = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // binding-entry.mjs
  var binding_entry_exports = {};
  __export(binding_entry_exports, {
    Engine: () => Engine,
    initSync: () => initSync,
    live_sessions: () => live_sessions
  });

  // dist/generated/module.js
  var Engine = class {
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      EngineFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_engine_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} bytes
     */
    append_font(bytes) {
      const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.engine_append_font(this.__wbg_ptr, ptr0, len0);
      if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
      }
    }
    begin_font() {
      wasm.engine_begin_font(this.__wbg_ptr);
    }
    /**
     * Original Skrifa COLRv0/v1 traversal, with its cycle/depth guards intact. No pixel rasterization.
     * Version 1 header + format (-1 means no COLR), followed by ColorPainter events.
     * @param {number} glyph
     * @returns {Float64Array}
     */
    color_glyph_paint(glyph) {
      const ret = wasm.engine_color_glyph_paint(this.__wbg_ptr, glyph);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * Original CPAL entries, source sRGB straight RGBA bytes. Conversion/composition is explicit downstream.
     * @param {number} index
     * @returns {Float64Array}
     */
    color_palette(index) {
      const ret = wasm.engine_color_palette(this.__wbg_ptr, index);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * @param {number} face_index
     * @returns {number}
     */
    finish_font(face_index) {
      const ret = wasm.engine_finish_font(this.__wbg_ptr, face_index);
      if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
      }
      return ret[0] >>> 0;
    }
    /**
     * Packed OpenType tags plus original axis order/range/default/hidden.
     * @returns {Float64Array}
     */
    font_axes() {
      const ret = wasm.engine_font_axes(this.__wbg_ptr);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * Exact strikes, not implicit nearest-size selection. Format: 0 sbix, 1 CBDT/CBLC, 2 EBDT/EBLC.
     * @param {number} format
     * @returns {Float64Array}
     */
    font_bitmap_strikes(format) {
      const ret = wasm.engine_font_bitmap_strikes(this.__wbg_ptr, format);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * Reviewed Native COLRv1 callback profile, including degenerate-linear no-paint semantics.
     * @returns {number}
     */
    font_color_profile() {
      const ret = wasm.engine_font_color_profile(this.__wbg_ptr);
      return ret >>> 0;
    }
    /**
     * Encoded/packed original subresource bytes only, selected from the owned SFNT by glyph/format/strike.
     * Caller-supplied offsets, URLs, filesystem paths and compressed-document decoding are not accepted.
     * @param {number} glyph
     * @param {number} format
     * @param {number} strike
     * @returns {Uint8Array}
     */
    font_embedded_bytes(glyph, format, strike) {
      const ret = wasm.engine_font_embedded_bytes(this.__wbg_ptr, glyph, format, strike);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
      return v1;
    }
    /**
     * Schema1. SVG: [1,3,recordIndex,startGlyph,endGlyph,bytes,gzip].
     * Bitmap: [1,format,strike,glyph,w,h,ppemX,ppemY,bearingX,bearingY,innerX,innerY,
     * advancePresent,advance,origin(0 top-left/1 bottom-left),encoding(0 png/1 bgra/2 mask),bpp,packed,bytes].
     * @param {number} glyph
     * @param {number} format
     * @param {number} strike
     * @returns {Float64Array}
     */
    font_embedded_metadata(glyph, format, strike) {
      const ret = wasm.engine_font_embedded_metadata(this.__wbg_ptr, glyph, format, strike);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * Original Skrifa global metrics, unscaled font units, immutable current instance.
     * @returns {Float64Array}
     */
    font_metrics() {
      const ret = wasm.engine_font_metrics(this.__wbg_ptr);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * Original unhinted metrics/control bounds; not tight rendered-ink certification.
     * @param {Uint32Array} glyphs
     * @returns {Float64Array}
     */
    glyph_metrics(glyphs) {
      const ptr0 = passArray32ToWasm0(glyphs, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.engine_glyph_metrics(this.__wbg_ptr, ptr0, len0);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v2;
    }
    /**
     * Canonical nominal cmap only; no claim this replaces shaping.
     * @param {Uint32Array} points
     * @returns {Float64Array}
     */
    map_codepoints(points) {
      const ptr0 = passArray32ToWasm0(points, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.engine_map_codepoints(this.__wbg_ptr, ptr0, len0);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v2;
    }
    /**
     * Status:0 absent sequence,1 use-default mapping,2 explicit variant mapping.
     * @param {Uint32Array} pairs
     * @returns {Float64Array}
     */
    map_variants(pairs) {
      const ptr0 = passArray32ToWasm0(pairs, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.engine_map_variants(this.__wbg_ptr, ptr0, len0);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v2;
    }
    constructor() {
      const ret = wasm.engine_new();
      this.__wbg_ptr = ret;
      EngineFinalization.register(this, this.__wbg_ptr, this);
      return this;
    }
    /**
     * Actual normalized 2.14 coordinates, useful for reproducible font-instance provenance.
     * @returns {Float64Array}
     */
    normalized_coords() {
      const ret = wasm.engine_normalized_coords(this.__wbg_ptr);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * @param {number} glyph
     * @returns {number}
     */
    outline_glyph(glyph) {
      const ret = wasm.engine_outline_glyph(this.__wbg_ptr, glyph);
      if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
      }
      return ret[0] >>> 0;
    }
    /**
     * @param {number} start
     * @param {number} count
     * @returns {Float64Array}
     */
    read_glyphs(start, count) {
      const ret = wasm.engine_read_glyphs(this.__wbg_ptr, start, count);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    /**
     * @param {number} start
     * @param {number} count
     * @returns {Float64Array}
     */
    read_outline(start, count) {
      const ret = wasm.engine_read_outline(this.__wbg_ptr, start, count);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v1;
    }
    reset_results() {
      wasm.engine_reset_results(this.__wbg_ptr);
    }
    /**
     * Strict design-space settings -> original AVAR-aware normalized location.
     * This does NOT mutate the shaping instance or earlier glyph results.
     * @param {string} settings
     * @returns {Float64Array}
     */
    resolve_location(settings) {
      const ptr0 = passStringToWasm0(settings, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.engine_resolve_location(this.__wbg_ptr, ptr0, len0);
      if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
      }
      var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
      return v2;
    }
    /**
     * Absolute design-space settings, independent of the previous instance. E.g. wght=700,wdth=100.
     * @param {string} settings
     */
    set_variations(settings) {
      const ptr0 = passStringToWasm0(settings, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.engine_set_variations(this.__wbg_ptr, ptr0, len0);
      if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
      }
    }
    /**
     * Original HarfRust direction + joining context. Run clusters remain local UTF16 offsets.
     * 0 LTR, 1 RTL, 2 TTB, 3 BTT; direction is never disguised as paragraph bidi.
     * @param {string} text
     * @param {number} direction
     * @param {string} script
     * @param {string} language
     * @param {string} features
     * @param {string} before
     * @param {string} after
     * @returns {number}
     */
    shape_run_context(text, direction, script, language, features, before, after) {
      const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(script, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(language, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len2 = WASM_VECTOR_LEN;
      const ptr3 = passStringToWasm0(features, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len3 = WASM_VECTOR_LEN;
      const ptr4 = passStringToWasm0(before, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len4 = WASM_VECTOR_LEN;
      const ptr5 = passStringToWasm0(after, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len5 = WASM_VECTOR_LEN;
      const ret = wasm.engine_shape_run_context(this.__wbg_ptr, ptr0, len0, direction, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
      if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
      }
      return ret[0] >>> 0;
    }
    /**
     * A single explicitly directed/scripted run, not paragraph bidi/itemization or fallback.
     * Clusters enter as UTF-16 logical offsets; positions remain font units/y-up until the TS adapter maps them.
     * @param {string} text
     * @param {number} direction
     * @param {string} script
     * @param {string} language
     * @param {string} features
     * @returns {number}
     */
    shape_run(text, direction, script, language, features) {
      const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(script, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(language, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len2 = WASM_VECTOR_LEN;
      const ptr3 = passStringToWasm0(features, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len3 = WASM_VECTOR_LEN;
      const ret = wasm.engine_shape_run(this.__wbg_ptr, ptr0, len0, direction, ptr1, len1, ptr2, len2, ptr3, len3);
      if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
      }
      return ret[0] >>> 0;
    }
  };
  if (Symbol.dispose) Engine.prototype[Symbol.dispose] = Engine.prototype.free;
  function live_sessions() {
    const ret = wasm.live_sessions();
    return ret >>> 0;
  }
  function __wbg_get_imports() {
    const import0 = {
      __proto__: null,
      __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
      },
      __wbindgen_generic_0000000000000001: function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
      },
      __wbindgen_init_externref_table: function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, void 0);
        table.set(offset + 0, void 0);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
      }
    };
    return {
      __proto__: null,
      "./module_bg.js": import0
    };
  }
  var EngineFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((ptr) => wasm.__wbg_engine_free(ptr, 1));
  function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
  }
  function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
  }
  var cachedFloat64ArrayMemory0 = null;
  function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
      cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
  }
  function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
  }
  var cachedUint32ArrayMemory0 = null;
  function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
      cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
  }
  var cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }
  function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }
  function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }
  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === void 0) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr2 = malloc(buf.length, 1) >>> 0;
      getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr2;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 127) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      const ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }
  function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
  }
  var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
  cachedTextDecoder.decode();
  var MAX_SAFARI_DECODE_BYTES = 2146435072;
  var numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
      cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }
  var cachedTextEncoder = new TextEncoder();
  if (!("encodeInto" in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function(arg, view) {
      const buf = cachedTextEncoder.encode(arg);
      view.set(buf);
      return {
        read: arg.length,
        written: buf.length
      };
    };
  }
  var WASM_VECTOR_LEN = 0;
  var wasmModule;
  var wasmInstance;
  var wasm;
  function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
  }
  function initSync(module) {
    if (wasm !== void 0) return wasm;
    if (module !== void 0) {
      if (Object.getPrototypeOf(module) === Object.prototype) {
        ({ module } = module);
      } else {
        console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
      }
    }
    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
      module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
  }
  return __toCommonJS(binding_entry_exports);
})();

return __FrameweaveBindgen;
}
