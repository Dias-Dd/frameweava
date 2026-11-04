"use strict";
(() => {
  // dist/binding.mjs
  function createBinding() {
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
      var binding_entry_exports = {};
      __export(binding_entry_exports, {
        Engine: () => Engine,
        initSync: () => initSync,
        live_sessions: () => live_sessions
      });
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
         * @param {string} text
         * @param {number} base
         * @returns {number}
         */
        analyze(text, base) {
          const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
          const len0 = WASM_VECTOR_LEN;
          const ret = wasm.engine_analyze(this.__wbg_ptr, ptr0, len0, base);
          if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
          }
          return ret[0] >>> 0;
        }
        /**
         * @param {string} text
         * @param {number} base
         * @param {number} start
         * @param {number} end
         * @returns {number}
         */
        analyze_line(text, base, start, end) {
          const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
          const len0 = WASM_VECTOR_LEN;
          const ret = wasm.engine_analyze_line(this.__wbg_ptr, ptr0, len0, base, start, end);
          if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
          }
          return ret[0] >>> 0;
        }
        /**
         * @returns {Float64Array}
         */
        metadata() {
          const ret = wasm.engine_metadata(this.__wbg_ptr);
          if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
          }
          var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
          wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
          return v1;
        }
        constructor() {
          const ret = wasm.engine_new();
          this.__wbg_ptr = ret;
          EngineFinalization.register(this, this.__wbg_ptr, this);
          return this;
        }
        /**
         * @param {number} start
         * @param {number} count
         * @returns {Float64Array}
         */
        read_bidi_runs(start, count) {
          const ret = wasm.engine_read_bidi_runs(this.__wbg_ptr, start, count);
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
        read_candidates(start, count) {
          const ret = wasm.engine_read_candidates(this.__wbg_ptr, start, count);
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
        read_levels(start, count) {
          const ret = wasm.engine_read_levels(this.__wbg_ptr, start, count);
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
        read_paragraphs(start, count) {
          const ret = wasm.engine_read_paragraphs(this.__wbg_ptr, start, count);
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
        read_runs(start, count) {
          const ret = wasm.engine_read_runs(this.__wbg_ptr, start, count);
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
        read_visual_indices(start, count) {
          const ret = wasm.engine_read_visual_indices(this.__wbg_ptr, start, count);
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
      var cachedUint8ArrayMemory0 = null;
      function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
          cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
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

  // runtime/session.mjs
  var BindgenError = class extends Error {
    constructor(code, message) {
      super(message);
      this.name = "BindgenError";
      this.code = code;
    }
  };
  var fail = (code, message) => {
    throw new BindgenError(code, message);
  };
  var inventory = (module) => WebAssembly.Module.imports(module).map(({ module: module2, name, kind }) => ({ module: module2, name, kind })).sort((a, b) => {
    const x = a.module + "\0" + a.name, y = b.module + "\0" + b.name;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  async function createSession(bytes, profile, createBinding2) {
    if (profile?.id !== "wasm-bindgen-data-v1" || profile.revision !== 1 || profile.generator !== "0.2.129" || !Array.isArray(profile.methods) || !profile.methods.length)
      fail("E_BINDGEN_PROFILE", "Unsupported wasm-bindgen data profile");
    let compiled;
    try {
      compiled = await WebAssembly.compile(bytes);
    } catch (error) {
      fail("E_BINDGEN_BINARY", `Cannot compile WASM: ${error.message}`);
    }
    const imports = inventory(compiled);
    if (imports.some((i) => i.kind !== "function") || JSON.stringify(imports) !== JSON.stringify(profile.imports)) fail("E_BINDGEN_IMPORTS", "WASM imports disagree with the verified, reviewed data profile");
    if (typeof createBinding2 !== "function" || typeof profile.entryClass !== "string" || !/^\w+$/.test(profile.entryClass)) fail("E_BINDGEN_EXPORT", "Invalid generated binding factory/class");
    let binding = createBinding2(), engine, exports;
    if (!Object.hasOwn(binding, profile.entryClass) || !Object.hasOwn(binding, "initSync") || !Object.hasOwn(binding, "live_sessions") || typeof binding.initSync !== "function" || typeof binding[profile.entryClass] !== "function" || typeof binding.live_sessions !== "function" || typeof binding[profile.entryClass].prototype?.free !== "function") fail("E_BINDGEN_EXPORT", "Missing generated constructor/initSync/live_sessions/free");
    try {
      exports = binding.initSync({ module: compiled });
      if (!(exports.memory instanceof WebAssembly.Memory) || !(exports.memory.buffer instanceof ArrayBuffer)) fail("E_BINDGEN_PROFILE", "Expected private non-shared WASM memory");
      engine = new binding[profile.entryClass]();
      if (profile.methods.some((name) => ["free", "__proto__", "constructor", "prototype", "dispose", "diagnostics"].includes(name) || typeof engine[name] !== "function")) fail("E_BINDGEN_EXPORT", "Invalid public method declaration");
    } catch (error) {
      try {
        engine?.free();
      } finally {
        engine = binding = exports = compiled = void 0;
      }
      throw new BindgenError("E_BINDGEN_INIT", String(error?.message ?? error));
    }
    let disposed = false;
    return {
      invoke(method, args) {
        if (disposed) fail("E_BINDGEN_DISPOSED", "Binding is disposed");
        if (!profile.methods.includes(method) || !Array.isArray(args)) fail("E_BINDGEN_ARGUMENT", "Undeclared public function or invalid arguments");
        try {
          return engine[method](...args);
        } catch (error) {
          fail("E_BINDGEN_CALL", `${method}: ${error?.message ?? String(error)}`);
        }
      },
      diagnostics() {
        return disposed ? { disposed: true, liveSessions: 0, memoryBytes: 0 } : { disposed: false, liveSessions: binding.live_sessions(), memoryBytes: exports.memory.buffer.byteLength };
      },
      dispose() {
        if (disposed) return { remainingSessions: 0 };
        disposed = true;
        try {
          engine.free();
          const remainingSessions = binding.live_sessions();
          if (remainingSessions !== 0) fail("E_BINDGEN_DISPOSE", "Generated free did not release the owned Rust session");
          return { remainingSessions };
        } finally {
          engine = binding = exports = compiled = void 0;
        }
      }
    };
  }

  // runtime/wire.ts
  function cloneData(value, transfer = [], depth = 0) {
    if (depth > 8) throw new BindgenError("E_BINDGEN_ARGUMENT", "Data nesting exceeds 8");
    if (typeof value === "string") {
      if (value.length > 1024 * 1024) throw new BindgenError("E_BINDGEN_ARGUMENT", "String exceeds 1 MiB");
      return value;
    }
    if (value === void 0 || value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new BindgenError("E_BINDGEN_ARGUMENT", "Expected finite numbers");
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 4096) throw new BindgenError("E_BINDGEN_ARGUMENT", "Array exceeds 4096 items");
      return value.map((item) => cloneData(item, transfer, depth + 1));
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      if (value.byteLength > 16 * 1024 * 1024) throw new BindgenError("E_BINDGEN_ARGUMENT", "Typed array exceeds 16 MiB");
      const copy = value instanceof Float32Array ? new Float32Array(value) : value instanceof Float64Array ? new Float64Array(value) : value instanceof Uint8Array ? new Uint8Array(value) : value instanceof Uint32Array ? new Uint32Array(value) : value instanceof Int32Array ? new Int32Array(value) : void 0;
      if (!copy) throw new BindgenError("E_BINDGEN_ARGUMENT", "Unsupported typed array kind");
      transfer.push(copy.buffer);
      return copy;
    }
    throw new BindgenError("E_BINDGEN_ARGUMENT", "Profile accepts primitive data, arrays and typed arrays, not host objects/callbacks");
  }

  // runtime/worker.ts
  var scope = globalThis;
  var session;
  var initializationMs = 0;
  scope.onmessage = async ({ data }) => {
    const { v, id, method } = data;
    try {
      if (v !== 1 || !Number.isSafeInteger(id) || id < 1) throw new BindgenError("E_BINDGEN_PROTOCOL", "Unsupported Worker protocol");
      if (method === "init") {
        if (session) throw new BindgenError("E_BINDGEN_INIT", "Already initialized");
        const start = performance.now();
        session = await createSession(data.bytes, data.profile, createBinding);
        initializationMs = performance.now() - start;
        scope.postMessage({ v: 1, id, result: true });
      } else if (method === "invoke") {
        if (!session) throw new BindgenError("E_BINDGEN_INIT", "Not initialized");
        const result = session.invoke(data.name, data.args), transfer = [];
        scope.postMessage({ v: 1, id, result: cloneData(result, transfer) }, transfer);
      } else if (method === "diagnostics") scope.postMessage({ v: 1, id, result: { ...session?.diagnostics(), initializationMs } });
      else if (method === "dispose") {
        const result = session?.dispose() ?? { remainingSessions: 0 };
        session = void 0;
        scope.postMessage({ v: 1, id, result });
        scope.close();
      } else throw new BindgenError("E_BINDGEN_PROTOCOL", "Unknown Worker method");
    } catch (error) {
      const e = error;
      scope.postMessage({ v: 1, id, error: { code: e.code ?? "E_BINDGEN_WORKER", message: String(e.message ?? error) } });
    }
  };
})();
