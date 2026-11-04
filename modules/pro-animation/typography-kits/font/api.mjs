// modules/pro-animation/typography-kits/font/runtime/session.mjs
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
async function createSession(bytes, profile, createBinding) {
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
  if (typeof createBinding !== "function" || typeof profile.entryClass !== "string" || !/^\w+$/.test(profile.entryClass)) fail("E_BINDGEN_EXPORT", "Invalid generated binding factory/class");
  let binding = createBinding(), engine, exports;
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

// modules/pro-animation/typography-kits/font/runtime/wire.ts
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

// modules/pro-animation/typography-kits/font/runtime/client.ts
async function createClient(load, options = {}) {
  const timeout = options.initializationTimeoutMs ?? 15e3;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new BindgenError("E_BINDGEN_ARGUMENT", "Invalid initialization timeout");
  if (options.signal?.aborted) throw new BindgenError("E_BINDGEN_CANCELLED", "Initialization cancelled");
  const [bytes, encoded, source] = await Promise.all([load({ module: "bytes", format: "resource" }), load({ module: "profile", format: "resource" }), options.worker ? load({ module: "worker", format: "resource" }) : Promise.resolve(void 0)]);
  const profile = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encoded));
  if (profile.id !== "wasm-bindgen-data-v1" || !Array.isArray(profile.resources) || profile.resources.length > 48) throw new BindgenError("E_BINDGEN_PROFILE", "Invalid profile resources");
  await Promise.all(profile.resources.map((module) => load({ module, format: "resource" })));
  if (options.signal?.aborted) throw new BindgenError("E_BINDGEN_CANCELLED", "Initialization cancelled");
  if (!options.worker) {
    const binding = await load({ module: "binding", format: "javascript" });
    const session = await createSession(bytes.slice().buffer, profile, binding.createBinding);
    const cancel2 = () => {
      session.dispose();
    };
    options.signal?.addEventListener("abort", cancel2, { once: true });
    if (options.signal?.aborted) {
      session.dispose();
      throw new BindgenError("E_BINDGEN_CANCELLED", "Initialization cancelled");
    }
    return { async invoke(name, args) {
      cloneData(args);
      return session.invoke(name, args);
    }, async diagnostics() {
      return session.diagnostics();
    }, async dispose() {
      options.signal?.removeEventListener("abort", cancel2);
      return session.dispose();
    } };
  }
  const url = URL.createObjectURL(new Blob([new TextDecoder("utf-8", { fatal: true }).decode(source)], { type: "text/javascript" }));
  let worker;
  try {
    worker = new Worker(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  let sequence = 0, dead = false, closing = false, cleanup;
  const pending = /* @__PURE__ */ new Map();
  function terminate(error = new BindgenError("E_BINDGEN_DISPOSED", "Worker terminated")) {
    if (dead) return;
    dead = true;
    worker.terminate();
    URL.revokeObjectURL(url);
    options.signal?.removeEventListener("abort", cancel);
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    pending.clear();
  }
  function cancel() {
    terminate(new BindgenError("E_BINDGEN_CANCELLED", "Worker cancelled"));
  }
  options.signal?.addEventListener("abort", cancel, { once: true });
  worker.onmessage = ({ data }) => {
    const call = pending.get(data.id);
    if (!call) return;
    if (data.v !== 1) {
      terminate(new BindgenError("E_BINDGEN_PROTOCOL", "Response version mismatch"));
      return;
    }
    pending.delete(data.id);
    clearTimeout(call.timer);
    if (data.error) call.reject(new BindgenError(data.error.code, data.error.message));
    else call.resolve(data.result);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    terminate(new BindgenError("E_BINDGEN_WORKER", event.message || "Worker failed"));
  };
  worker.onmessageerror = () => terminate(new BindgenError("E_BINDGEN_PROTOCOL", "Message decode failed"));
  function request(method, data = {}, transfer = []) {
    if (dead || closing && method !== "dispose") return Promise.reject(new BindgenError("E_BINDGEN_DISPOSED", "Binding disposed"));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = method === "init" ? setTimeout(() => terminate(new BindgenError("E_BINDGEN_TIMEOUT", "Worker initialization timed out")), timeout) : void 0;
      pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ v: 1, id, method, ...data }, transfer);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }
  try {
    const copy = bytes.slice();
    await request("init", { bytes: copy.buffer, profile }, [copy.buffer]);
  } catch (error) {
    terminate();
    throw error;
  }
  return {
    invoke(name, args) {
      const transfer = [], copy = cloneData(args, transfer);
      return request("invoke", { name, args: copy }, transfer);
    },
    diagnostics() {
      return dead ? Promise.resolve({ disposed: true, liveSessions: 0, memoryBytes: 0 }) : request("diagnostics");
    },
    dispose() {
      return cleanup ??= (async () => {
        if (dead) return { remainingSessions: 0 };
        closing = true;
        try {
          return await request("dispose");
        } finally {
          terminate();
        }
      })();
    }
  };
}

// modules/pro-animation/typography-kits/font/generated/api.ts
async function createEngineApi(load, options = {}) {
  const client = await createClient(load, options);
  return Object.assign(Object.fromEntries(["append_font", "begin_font", "color_glyph_paint", "color_palette", "finish_font", "font_axes", "font_bitmap_strikes", "font_color_profile", "font_embedded_bytes", "font_embedded_metadata", "font_metrics", "glyph_metrics", "map_codepoints", "map_variants", "normalized_coords", "outline_glyph", "read_glyphs", "read_outline", "reset_results", "resolve_location", "set_variations", "shape_run_context", "shape_run"].map((name) => [name, (...args) => client.invoke(name, args)])), { dispose: () => client.dispose(), diagnostics: () => client.diagnostics() });
}
export {
  createEngineApi
};
