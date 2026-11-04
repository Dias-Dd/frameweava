// modules/rigid-body-effects/runtime/session.mjs
var ModuleError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ModuleError";
    this.code = code;
  }
};
var fail = (code, message) => {
  throw new ModuleError(code, message);
};
var MAX_BYTES = 16 * 1024 * 1024;
function bindInstance(instance) {
  let api = instance?.exports;
  const names = ["fw_abi_version", "fw_init", "fw_alloc", "fw_free", "fw_call", "fw_dispose", "fw_buffer_count"];
  if (!(api?.memory instanceof WebAssembly.Memory) || names.some((name) => typeof api[name] !== "function"))
    fail("E_WASM_EXPORT", `bytes-v1 requires memory and functions: ${names.join(", ")}`);
  if (api.fw_abi_version() !== 1) fail("E_WASM_ABI", "Unsupported bytes ABI; expected version 1");
  if (api.fw_init() !== 0) fail("E_WASM_INIT", "Rust module initialization failed");
  let disposed = false;
  const view = (pointer, length) => {
    if (!Number.isInteger(pointer) || pointer <= 0 || pointer + length > api.memory.buffer.byteLength)
      fail("E_WASM_MEMORY", "Rust returned an invalid memory range");
    return new Uint8Array(api.memory.buffer, pointer, length);
  };
  return {
    call(operation, input, capacity) {
      if (disposed) fail("E_WASM_DISPOSED", "Module is disposed");
      if (!Number.isInteger(operation) || operation < 0 || operation > 4294967295 || !(input instanceof Uint8Array) || input.length > MAX_BYTES || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_BYTES)
        fail("E_WASM_ARGUMENT", "Expected u32 operation, bounded Uint8Array and positive output capacity");
      let source = 0, target = 0, result, failure;
      try {
        if (input.length) {
          source = api.fw_alloc(input.length);
          if (!source) fail("E_WASM_MEMORY", "Input allocation failed");
        }
        target = api.fw_alloc(capacity);
        if (!target || target === source) fail("E_WASM_MEMORY", "Output allocation failed or aliased input");
        if (source) view(source, input.length).set(input);
        view(target, capacity);
        const written = api.fw_call(operation, source, input.length, target, capacity);
        if (!Number.isInteger(written) || written < 0) fail("E_WASM_CALL", `Rust operation ${operation} failed (${written})`);
        if (written > capacity) fail("E_WASM_MEMORY", "Rust output exceeds capacity");
        result = view(target, written).slice();
      } catch (error) {
        failure = error;
      } finally {
        let bad = false;
        for (const pointer of /* @__PURE__ */ new Set([source, target])) if (pointer) {
          try {
            if (api.fw_free(pointer) !== 0) bad = true;
          } catch {
            bad = true;
          }
        }
        if (bad) failure = new ModuleError("E_WASM_MEMORY", `Buffer release failed${failure ? ` after ${failure.message}` : ""}`);
      }
      if (failure) throw failure;
      return result;
    },
    diagnostics() {
      if (disposed) return { disposed: true, buffers: 0 };
      return { disposed: false, buffers: api.fw_buffer_count() };
    },
    dispose() {
      if (disposed) return { remainingBuffers: 0 };
      disposed = true;
      try {
        const status = api.fw_dispose(), remainingBuffers = api.fw_buffer_count();
        if (status !== 0 || remainingBuffers !== 0) fail("E_WASM_DISPOSE", "Rust module did not release its buffers");
        return { remainingBuffers };
      } finally {
        api = void 0;
        instance = void 0;
      }
    }
  };
}
async function instantiateModule(bytes) {
  let compiled;
  try {
    compiled = await WebAssembly.compile(bytes);
  } catch (error) {
    fail("E_WASM_BINARY", `Cannot compile WASM: ${error.message}`);
  }
  if (WebAssembly.Module.imports(compiled).length)
    fail("E_WASM_IMPORTS", "R1 core-v1 requires no host imports; see wasm-bindgen compatibility notes");
  return bindInstance(await WebAssembly.instantiate(compiled, {}));
}

// src/core/errors.ts
var EngineError = class extends Error {
  code;
  stageId;
  frame;
  hint;
  details;
  constructor(code, message, context = {}) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    Object.assign(this, context);
  }
};

// src/core/simulation.ts
var FixedStepRunner = class {
  constructor(simulation, options) {
    this.simulation = simulation;
    if (!Number.isFinite(options.fps) || options.fps <= 0) throw new EngineError("E_SIMULATION", "Simulation FPS must be positive.");
    this.interval = options.checkpointInterval ?? 30;
    this.maxCheckpoints = options.maxCheckpoints ?? 32;
    this.maxSteps = options.maxSteps ?? 1e5;
    if (!Number.isSafeInteger(this.interval) || this.interval < 1 || !Number.isSafeInteger(this.maxCheckpoints) || this.maxCheckpoints < 2 || !Number.isSafeInteger(this.maxSteps) || this.maxSteps < 1)
      throw new EngineError("E_SIMULATION", "Invalid checkpoint or replay limits.");
    this.dt = 1 / options.fps;
    this.simulation.reset();
    this.save(0);
  }
  simulation;
  checkpoints = /* @__PURE__ */ new Map();
  current = 0;
  interval;
  maxCheckpoints;
  maxSteps;
  dt;
  save(frame) {
    this.checkpoints.set(frame, structuredClone(this.simulation.snapshot()));
    while (this.checkpoints.size > this.maxCheckpoints) {
      const oldest = [...this.checkpoints.keys()].find((key) => key !== 0);
      this.checkpoints.delete(oldest);
    }
  }
  seek(frame) {
    if (!Number.isSafeInteger(frame) || frame < 0) throw new EngineError("E_SIMULATION_FRAME", "Fixed-step simulation requires a nonnegative integer local frame.");
    if (frame < this.current) {
      const checkpoint = Math.max(...[...this.checkpoints.keys()].filter((key) => key <= frame));
      this.simulation.restore(structuredClone(this.checkpoints.get(checkpoint)));
      this.current = checkpoint;
    } else {
      const checkpoint = Math.max(...[...this.checkpoints.keys()].filter((key) => key <= frame));
      if (checkpoint > this.current) {
        this.simulation.restore(structuredClone(this.checkpoints.get(checkpoint)));
        this.current = checkpoint;
      }
    }
    if (frame - this.current > this.maxSteps) throw new EngineError("E_SIMULATION_LIMIT", `Seek needs ${frame - this.current} replay steps, exceeding ${this.maxSteps}.`);
    while (this.current < frame) {
      this.current++;
      this.simulation.step(this.dt, this.current);
      if (this.current % this.interval === 0) this.save(this.current);
    }
    return structuredClone(this.simulation.snapshot());
  }
  reset() {
    this.simulation.reset();
    this.current = 0;
    this.checkpoints.clear();
    this.save(0);
  }
  get checkpointFrames() {
    return [...this.checkpoints.keys()].sort((a, b) => a - b);
  }
};

// src/core/time.ts
function rational(value) {
  const rate = typeof value === "number" ? { num: value, den: 1 } : value;
  if (!Number.isSafeInteger(rate.num) || !Number.isSafeInteger(rate.den) || rate.den <= 0 || rate.num <= 0)
    throw new EngineError("E_TIME", "A frame rate must be a positive integer or a positive rational {num, den}.");
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(rate.num, rate.den);
  return { num: rate.num / divisor, den: rate.den / divisor };
}
function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededRandom(seed, frame = 0, salt = 0) {
  let x = hashString(`${seed}|${frame}|${salt}`);
  x ^= x >>> 16;
  x = Math.imul(x, 2146121005);
  x ^= x >>> 15;
  x = Math.imul(x, 2221713035);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// src/core/animation.ts
var EXPRESSION_OPERATIONS = /* @__PURE__ */ new Set(["time", "frame", "globalTime", "globalFrame", "progress", "add", "sub", "mul", "div", "sin", "cos", "abs", "min", "max", "clamp", "pow", "floor", "ceil", "mod", "random"]);
function expression(op, ...args) {
  return { $expr: op, args };
}
var expr = {
  time: expression("time"),
  frame: expression("frame"),
  globalTime: expression("globalTime"),
  globalFrame: expression("globalFrame"),
  progress: expression("progress"),
  add: (...args) => expression("add", ...args),
  sub: (a, b) => expression("sub", a, b),
  mul: (...args) => expression("mul", ...args),
  div: (a, b) => expression("div", a, b),
  sin: (a) => expression("sin", a),
  cos: (a) => expression("cos", a),
  abs: (a) => expression("abs", a),
  min: (...args) => expression("min", ...args),
  max: (...args) => expression("max", ...args),
  clamp: (a, min, max) => expression("clamp", a, min, max),
  pow: (a, b) => expression("pow", a, b),
  floor: (a) => expression("floor", a),
  ceil: (a) => expression("ceil", a),
  mod: (a, b) => expression("mod", a, b),
  random: (salt = 0) => expression("random", salt)
};
function spring(options) {
  const result = {
    from: options.from,
    to: options.to,
    start: options.start ?? 0,
    stiffness: options.stiffness ?? 170,
    damping: options.damping ?? 26,
    mass: options.mass ?? 1,
    velocity: options.velocity ?? 0
  };
  if (Object.values(result).some((v) => !Number.isFinite(v)) || result.mass <= 0 || result.stiffness <= 0 || result.damping < 0)
    throw new EngineError("E_SPRING", "Spring needs finite parameters, positive mass/stiffness and nonnegative damping.");
  return { $spring: result };
}
function validateEasing(easing) {
  if (easing === void 0 || ["linear", "step", "easeIn", "easeOut", "easeInOut"].includes(easing)) return;
  const points = easing?.bezier;
  if (!Array.isArray(points) || points.length !== 4 || points.some((p) => !Number.isFinite(p)) || points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1)
    throw new EngineError("E_EASING", "Cubic Bezier easing requires four finite values with x control points inside [0,1].");
}
function validateKeyframes(keys) {
  if (!Array.isArray(keys) || !keys.length) throw new EngineError("E_KEYFRAMES", "A keyframe track must contain at least one key.");
  let previous = -Infinity;
  let type;
  for (const key of keys) {
    if (!key || !Number.isFinite(key.frame) || key.frame < 0 || key.frame <= previous)
      throw new EngineError("E_KEYFRAMES", "Keyframes must have finite, nonnegative, strictly increasing frame numbers.");
    if (!(typeof key.value === "number" && Number.isFinite(key.value)) && typeof key.value !== "string")
      throw new EngineError("E_KEYFRAMES", "Keyframe values must be finite numbers or strings.");
    type ??= typeof key.value;
    if (type !== typeof key.value) throw new EngineError("E_KEYFRAMES", "All values in a keyframe track must have the same type.");
    validateEasing(key.easing);
    previous = key.frame;
  }
}
var cubic = (p1, p2, t) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
function easingAt(easing, t) {
  t = Math.max(0, Math.min(1, t));
  if (!easing || easing === "linear") return t;
  if (easing === "step") return t === 1 ? 1 : 0;
  if (easing === "easeIn") return t * t;
  if (easing === "easeOut") return 1 - (1 - t) * (1 - t);
  if (easing === "easeInOut") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const [x1, y1, x2, y2] = easing.bezier;
  let low = 0, high = 1;
  for (let i = 0; i < 36; i++) {
    const u = (low + high) / 2;
    if (cubic(x1, x2, u) < t) low = u;
    else high = u;
  }
  return cubic(y1, y2, (low + high) / 2);
}
var named = { transparent: "#00000000", black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", cyan: "#00ffff", magenta: "#ff00ff", yellow: "#ffff00" };
function parseColor(input) {
  const source = named[input.toLowerCase()] ?? input;
  if (/^#[\da-f]{3,4}$/i.test(source)) {
    const values = source.slice(1).split("").map((v) => parseInt(v + v, 16));
    return [values[0], values[1], values[2], (values[3] ?? 255) / 255];
  }
  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(source)) return [parseInt(source.slice(1, 3), 16), parseInt(source.slice(3, 5), 16), parseInt(source.slice(5, 7), 16), source.length === 9 ? parseInt(source.slice(7, 9), 16) / 255 : 1];
  const match = source.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === void 0 ? 1 : Number(match[4])];
  return void 0;
}
function interpolate(a, b, t) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (a === b) return a;
  const ca = parseColor(String(a)), cb = parseColor(String(b));
  if (ca && cb) {
    const c = ca.map((v, i) => v + (cb[i] - v) * t);
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Number(c[3].toFixed(6))})`;
  }
  return t < 1 ? a : b;
}
function keyframesAt(track, frame) {
  const keys = track.$keyframes;
  if (frame <= keys[0].frame) return keys[0].value;
  if (frame >= keys[keys.length - 1].frame) return keys[keys.length - 1].value;
  let low = 0, high = keys.length - 1;
  while (high - low > 1) {
    const mid = low + high >> 1;
    if (keys[mid].frame <= frame) low = mid;
    else high = mid;
  }
  return interpolate(keys[low].value, keys[high].value, easingAt(keys[high].easing, (frame - keys[low].frame) / (keys[high].frame - keys[low].frame)));
}
function springAt(springValue, context) {
  const p = springValue.$spring;
  const t = Math.max(0, (context.frame - p.start) * context.fps.den / context.fps.num);
  const x0 = p.from - p.to, w0 = Math.sqrt(p.stiffness / p.mass), z = p.damping / (2 * Math.sqrt(p.stiffness * p.mass));
  if (z < 1 - 1e-8) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return p.to + Math.exp(-z * w0 * t) * (x0 * Math.cos(wd * t) + (p.velocity + z * w0 * x0) / wd * Math.sin(wd * t));
  }
  if (z <= 1 + 1e-8) return p.to + Math.exp(-w0 * t) * (x0 + (p.velocity + w0 * x0) * t);
  const r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1));
  const c1 = (p.velocity - r2 * x0) / (r1 - r2), c2 = x0 - c1;
  return p.to + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}
function expressionAt(node, context) {
  const a = node.args.map((x) => typeof x === "number" ? x : expressionAt(x, context));
  let result;
  switch (node.$expr) {
    case "time":
      result = context.time;
      break;
    case "frame":
      result = context.frame;
      break;
    case "globalTime":
      result = context.globalTime;
      break;
    case "globalFrame":
      result = context.globalFrame;
      break;
    case "progress":
      result = context.progress;
      break;
    case "add":
      result = a.reduce((x, y) => x + y, 0);
      break;
    case "sub":
      result = a[0] - a[1];
      break;
    case "mul":
      result = a.reduce((x, y) => x * y, 1);
      break;
    case "div":
      result = a[0] / a[1];
      break;
    case "sin":
      result = Math.sin(a[0]);
      break;
    case "cos":
      result = Math.cos(a[0]);
      break;
    case "abs":
      result = Math.abs(a[0]);
      break;
    case "min":
      result = Math.min(...a);
      break;
    case "max":
      result = Math.max(...a);
      break;
    case "clamp":
      result = Math.min(a[2], Math.max(a[1], a[0]));
      break;
    case "pow":
      result = Math.pow(a[0], a[1]);
      break;
    case "floor":
      result = Math.floor(a[0]);
      break;
    case "ceil":
      result = Math.ceil(a[0]);
      break;
    case "mod":
      result = a[0] % a[1];
      break;
    case "random":
      result = seededRandom(context.seed, context.frame, a[0] ?? 0);
      break;
    default:
      throw new EngineError("E_EXPRESSION", `Unsupported expression operation: ${node.$expr}`);
  }
  if (!Number.isFinite(result)) throw new EngineError("E_EXPRESSION", `Expression ${node.$expr} produced a non-finite number.`, { frame: context.globalFrame });
  return result;
}
function evaluate(value, context) {
  if (!value || typeof value !== "object") return value;
  if ("$keyframes" in value) return keyframesAt(value, context.frame);
  if ("$expr" in value) return expressionAt(value, context);
  if ("$spring" in value) return springAt(value, context);
  if (Array.isArray(value)) return value.map((item) => evaluate(item, context));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluate(item, context)]));
}

// src/media/surface.ts
var linear709 = { primaries: "rec709", whitePoint: "D65", transfer: "linear", reference: "scene", range: "full", referenceWhiteNits: 100 };
var acescg = { ...linear709, primaries: "acescg", whitePoint: "D60" };
var linear2020 = { ...linear709, primaries: "rec2020" };
var srgb = { ...linear709, transfer: "srgb", reference: "display" };
var pq2020 = { ...linear2020, transfer: "pq", reference: "display", peakNits: 1e3 };
var hlg2020 = { ...pq2020, transfer: "hlg", hlgSystemGamma: 1.2 };
var littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// src/audio/block.ts
var audioLimits = { samples: 262144, bytes: 16 * 1024 * 1024 };

// src/core/graph.ts
function assertJson(value, path = "$", ancestors = /* @__PURE__ */ new Set(), depth = 0) {
  if (depth > 96) throw new EngineError("E_SERIALIZE", `JSON exceeds maximum nesting depth at ${path}.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new EngineError("E_SERIALIZE", `Non-finite number at ${path}.`);
  }
  if (typeof value !== "object") throw new EngineError("E_SERIALIZE", `Unsupported ${typeof value} at ${path}; use expression ASTs or a native Stage module.`);
  if (ancestors.has(value)) throw new EngineError("E_SERIALIZE", `Cyclic object at ${path}.`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new EngineError("E_SERIALIZE", `Non-plain object at ${path}; native runtime objects cannot cross Stage boundaries.`);
  ancestors.add(value);
  for (const [key, item] of Object.entries(value)) assertJson(item, `${path}.${key}`, ancestors, depth + 1);
  ancestors.delete(value);
}
function validateExpression(node) {
  if (!EXPRESSION_OPERATIONS.has(node.$expr) || !Array.isArray(node.args)) throw new EngineError("E_EXPRESSION", `Unknown or invalid expression ${node.$expr}.`);
  const zero = ["time", "frame", "globalTime", "globalFrame", "progress"], unary = ["sin", "cos", "abs", "floor", "ceil", "random"], binary = ["sub", "div", "pow", "mod"];
  if (zero.includes(node.$expr) && node.args.length !== 0 || unary.includes(node.$expr) && node.args.length !== 1 || binary.includes(node.$expr) && node.args.length !== 2 || node.$expr === "clamp" && node.args.length !== 3 || ["min", "max"].includes(node.$expr) && node.args.length === 0)
    throw new EngineError("E_EXPRESSION", `Expression ${node.$expr} has the wrong argument count.`);
  for (const arg of node.args) {
    if (typeof arg === "number") {
      if (!Number.isFinite(arg)) throw new EngineError("E_EXPRESSION", "Expression constants must be finite.");
    } else if (arg && typeof arg === "object" && "$expr" in arg) validateExpression(arg);
    else throw new EngineError("E_EXPRESSION", "Expression arguments must be numbers or expression nodes.");
  }
}
function checkSignals(value) {
  if (!value || typeof value !== "object") return;
  if ("$keyframes" in value) {
    validateKeyframes(value.$keyframes);
    return;
  }
  if ("$expr" in value) {
    validateExpression(value);
    return;
  }
  if ("$spring" in value) {
    const p = value.$spring;
    if (!p || typeof p !== "object") throw new EngineError("E_SPRING", "Invalid spring.");
    spring(p);
    return;
  }
  for (const item of Object.values(value)) checkSignals(item);
}
var transformProperties = ["x", "y", "scale", "scaleX", "scaleY", "rotation", "opacity", "originX", "originY"];
var visualProperties = [...transformProperties, "kind", "id", "start", "end", "children", "content", "fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "align", "width", "height", "radius", "fill", "stroke", "strokeWidth", "key"];

// modules/rigid-body-effects/src/config.ts
function rigidError(code, message) {
  throw Object.assign(new Error(message), { code });
}
function object(v, name, keys) {
  if (!v || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) rigidError("E_RIGID_PARAMETER", name + " must be a plain object");
  for (const key of Reflect.ownKeys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, key);
    if (typeof key !== "string" || !keys.includes(key) || !d.enumerable || !("value" in d)) rigidError("E_RIGID_PARAMETER", name + " contains an unknown/accessor field");
  }
  return v;
}
function finite(v, name, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) rigidError("E_RIGID_PARAMETER", name + " must be finite within its declared range");
  return v;
}
function integer2(v, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = finite(v, name, min, max);
  if (!Number.isSafeInteger(n)) rigidError("E_RIGID_PARAMETER", name + " must be a safe integer");
  return n;
}
function boolean(v, name) {
  if (typeof v !== "boolean") rigidError("E_RIGID_PARAMETER", name + " must be boolean");
  return v;
}
function id(v, name) {
  if (typeof v !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v)) rigidError("E_RIGID_PARAMETER", name + " needs a stable ID");
  return v;
}
function vector(v, name, min = -Number.MAX_VALUE) {
  if (!Array.isArray(v) || v.length !== 3) rigidError("E_RIGID_PARAMETER", name + " must have three components");
  return v.map((x) => finite(x, name, min));
}
function quaternion(v, name) {
  if (!Array.isArray(v) || v.length !== 4) rigidError("E_RIGID_PARAMETER", name + " must be XYZW");
  const q = v.map((x) => finite(x, name));
  if (Math.abs(q.reduce((s, x) => s + x * x, 0) - 1) > 1e-8) rigidError("E_RIGID_PARAMETER", name + " must already be a unit quaternion");
  return q;
}
function locks(v, name) {
  if (!Array.isArray(v) || v.length !== 3) rigidError("E_RIGID_PARAMETER", name + " needs three booleans");
  return v.map((x) => boolean(x, name));
}
function array(v, name, max) {
  if (!Array.isArray(v) || v.length > max) rigidError("E_RIGID_BUDGET", name + " must be an array within the explicit budget");
  if (Reflect.ownKeys(v).length !== v.length + 1) rigidError("E_RIGID_PARAMETER", name + " must be a dense, undecorated data array");
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!d || !("value" in d)) rigidError("E_RIGID_PARAMETER", name + " must contain own data elements");
  }
  return v;
}
function unique(ids, name) {
  if (new Set(ids).size !== ids.length) rigidError("E_RIGID_PARAMETER", "Duplicate " + name);
}
function controlContext(frame, fps, substeps, seed) {
  const time = frame * fps.den / fps.num;
  return { frame, time, globalFrame: frame, globalTime: time, dt: fps.den / fps.num / substeps, fps, durationInFrames: 1, progress: 0, seed };
}
function sampleContext(value, fps, substeps) {
  const ctx = object(value, "FrameContext", ["frame", "time", "fps", "globalFrame", "globalTime", "dt", "durationInFrames", "progress", "seed"]);
  const frame = finite(ctx.frame, "frame", 0), time = finite(ctx.time, "time", 0), rate = object(ctx.fps, "fps", ["num", "den"]), normalized = rational(rate);
  if (normalized.num !== fps.num || normalized.den !== fps.den || !Number.isSafeInteger(frame * substeps) || Math.abs(time - frame * fps.den / fps.num) > 1e-9 * Math.max(1, Math.abs(time))) rigidError("E_RIGID_TIME", "Frame/time/FPS must agree and frame must align to configured fixed substeps");
  return { frame, time, fps: { ...fps } };
}
function signals(v, name) {
  if (!Array.isArray(v) || v.length !== 3) rigidError("E_RIGID_PARAMETER", name + " needs three numeric Signals");
  assertJson(v);
  checkSignals(v);
  function visit(v2, depth = 0) {
    if (depth > 32) rigidError("E_RIGID_PARAMETER", "Signal nesting exceeds the parameter budget");
    if (typeof v2 === "number") return;
    if (!v2 || typeof v2 !== "object") rigidError("E_RIGID_PARAMETER", "Numeric Signal required");
    if (v2.$expr && ["globalFrame", "globalTime", "progress"].includes(v2.$expr)) rigidError("E_RIGID_TIME", "Physics controls currently support explicit local time/frame; global/progress mapping is unsupported");
    for (const x of Object.values(v2)) if (x && typeof x === "object") {
      for (const y of Array.isArray(x) ? x : [x]) if (y && typeof y === "object") visit(y, depth + 1);
    }
  }
  v.forEach((x) => visit(x));
  const result = structuredClone(v);
  vector(evaluate(result, controlContext(0, { num: 24, den: 1 }, 1, 1)), name);
  return result;
}
function normalizeWorld(input) {
  const o = object(input, "world", ["fps", "substeps", "seed", "gravity", "bodies", "joints", "solver", "budgets"]), fps = rational(o.fps), substeps = integer2(o.substeps ?? 4, "substeps"), seed = integer2(o.seed ?? 1, "seed", 0, 4294967295);
  const hz = fps.num / fps.den * substeps;
  if (!Number.isFinite(hz) || hz <= 0 || !Number.isFinite(1 / hz) || 1 / hz === 0) rigidError("E_RIGID_TIME", "Fixed substep frequency is not representable");
  const b = object(o.budgets ?? {}, "budgets", ["maxBodies", "maxColliders", "maxJoints", "maxEventsPerStep", "maxPointsPerEvent", "maxSnapshotBytes", "maxCheckpointBytes", "maxOutputBytes", "checkpointInterval", "maxCheckpoints", "maxReplaySteps"]);
  const budgets = { maxBodies: integer2(b.maxBodies ?? 1e4, "maxBodies"), maxColliders: integer2(b.maxColliders ?? 2e4, "maxColliders"), maxJoints: integer2(b.maxJoints ?? 1e4, "maxJoints"), maxEventsPerStep: integer2(b.maxEventsPerStep ?? 16384, "maxEventsPerStep"), maxPointsPerEvent: integer2(b.maxPointsPerEvent ?? 32, "maxPointsPerEvent"), maxSnapshotBytes: integer2(b.maxSnapshotBytes ?? 4194304, "maxSnapshotBytes", 64, 16777216), maxCheckpointBytes: integer2(b.maxCheckpointBytes ?? 134217728, "maxCheckpointBytes"), maxOutputBytes: integer2(b.maxOutputBytes ?? 16777216, "maxOutputBytes", 64, 16777216), checkpointInterval: integer2(b.checkpointInterval ?? 30, "checkpointInterval"), maxCheckpoints: integer2(b.maxCheckpoints ?? 8, "maxCheckpoints", 2), maxReplaySteps: integer2(b.maxReplaySteps ?? 1e6, "maxReplaySteps") };
  const planned = budgets.maxSnapshotBytes * (budgets.maxCheckpoints + 3);
  if (!Number.isSafeInteger(planned) || planned > budgets.maxCheckpointBytes) rigidError("E_RIGID_BUDGET", "Planned retained checkpoint/snapshot copies exceed maxCheckpointBytes");
  const colliderIds = [], colliderBodies = [], controls = [];
  const bodies = array(o.bodies, "bodies", budgets.maxBodies).map((v, index) => {
    const x = object(v, "body", ["id", "kind", "position", "rotation", "linearVelocity", "angularVelocity", "linearDamping", "angularDamping", "gravityScale", "canSleep", "ccd", "lockTranslation", "lockRotation", "colliders", "force", "torque", "kinematicPosition"]);
    if (!["dynamic", "fixed", "kinematic"].includes(x.kind)) rigidError("E_RIGID_PARAMETER", "Unknown body kind");
    if (x.kinematicPosition !== void 0 && x.kind !== "kinematic" || (x.force !== void 0 || x.torque !== void 0) && x.kind !== "dynamic") rigidError("E_RIGID_PARAMETER", "Force/torque require dynamic bodies; targets require kinematic bodies");
    controls.push({ force: signals(x.force ?? [0, 0, 0], "force"), torque: signals(x.torque ?? [0, 0, 0], "torque"), ...x.kinematicPosition !== void 0 ? { target: signals(x.kinematicPosition, "kinematicPosition") } : {} });
    const colliders = array(x.colliders, "colliders", budgets.maxColliders).map((v2) => {
      const c = object(v2, "collider", ["id", "shape", "position", "rotation", "density", "friction", "restitution", "sensor", "forceThreshold"]), shape = object(c.shape, "shape", ["kind", "radius", "halfExtents", "halfHeight"]);
      let s;
      if (shape.kind === "ball") {
        object(shape, "ball", ["kind", "radius"]);
        s = { kind: "ball", radius: finite(shape.radius, "radius", Number.MIN_VALUE) };
      } else if (shape.kind === "cuboid") {
        object(shape, "cuboid", ["kind", "halfExtents"]);
        s = { kind: "cuboid", halfExtents: vector(shape.halfExtents, "halfExtents", Number.MIN_VALUE) };
      } else if (shape.kind === "capsule") {
        object(shape, "capsule", ["kind", "radius", "halfHeight"]);
        s = { kind: "capsule", radius: finite(shape.radius, "radius", Number.MIN_VALUE), halfHeight: finite(shape.halfHeight, "halfHeight", 0) };
      } else rigidError("E_RIGID_PARAMETER", "Unknown collider shape");
      colliderIds.push(id(c.id, "collider.id"));
      colliderBodies.push(index);
      if (colliderIds.length > budgets.maxColliders) rigidError("E_RIGID_BUDGET", "Total collider count exceeds maxColliders");
      const density = finite(c.density ?? 1, "density", Number.MIN_VALUE), volume = s.kind === "ball" ? 4 / 3 * Math.PI * s.radius ** 3 : s.kind === "cuboid" ? 8 * s.halfExtents[0] * s.halfExtents[1] * s.halfExtents[2] : Math.PI * s.radius ** 2 * (2 * s.halfHeight) + 4 / 3 * Math.PI * s.radius ** 3, scale = s.kind === "cuboid" ? Math.max(...s.halfExtents) : s.kind === "capsule" ? Math.max(s.radius, s.halfHeight) : s.radius, mass = volume * density, momentScale = scale ** 2 * mass;
      if (!Number.isFinite(volume) || volume <= 0 || !Number.isFinite(mass) || mass <= 0 || !Number.isFinite(momentScale) || momentScale <= 0) rigidError("E_RIGID_PARAMETER", "Collider volume/mass/inertia scale is not representable in f64; no silent underflow or clamp");
      return { shape: s, position: vector(c.position ?? [0, 0, 0], "collider.position"), rotation: quaternion(c.rotation ?? [0, 0, 0, 1], "collider.rotation"), density, friction: finite(c.friction ?? 0.5, "friction", 0), restitution: finite(c.restitution ?? 0, "restitution", 0, 1), sensor: boolean(c.sensor ?? false, "sensor"), forceThreshold: finite(c.forceThreshold ?? 0, "forceThreshold", 0) };
    });
    if (x.kind === "dynamic" && !colliders.length) rigidError("E_RIGID_PARAMETER", "Dynamic bodies require an explicit mass-bearing collider in this version");
    return { id: id(x.id, "body.id"), kind: x.kind, position: vector(x.position ?? [0, 0, 0], "position"), rotation: quaternion(x.rotation ?? [0, 0, 0, 1], "rotation"), linearVelocity: vector(x.linearVelocity ?? [0, 0, 0], "linearVelocity"), angularVelocity: vector(x.angularVelocity ?? [0, 0, 0], "angularVelocity"), linearDamping: finite(x.linearDamping ?? 0, "linearDamping", 0), angularDamping: finite(x.angularDamping ?? 0, "angularDamping", 0), gravityScale: finite(x.gravityScale ?? 1, "gravityScale"), canSleep: boolean(x.canSleep ?? true, "canSleep"), ccd: boolean(x.ccd ?? false, "ccd"), lockTranslation: locks(x.lockTranslation ?? [false, false, false], "lockTranslation"), lockRotation: locks(x.lockRotation ?? [false, false, false], "lockRotation"), colliders };
  });
  unique(bodies.map((b2) => b2.id), "body IDs");
  unique(colliderIds, "collider IDs");
  const bodyIndex = new Map(bodies.map((b2, i) => [b2.id, i])), jointIds = [];
  const joints = array(o.joints ?? [], "joints", budgets.maxJoints).map((v) => {
    const j = object(v, "joint", ["id", "kind", "bodyA", "bodyB", "anchorA", "anchorB", "contacts", "axis", "limits", "motor", "restLength", "stiffness", "damping"]);
    jointIds.push(id(j.id, "joint.id"));
    const a = bodyIndex.get(j.bodyA), b2 = bodyIndex.get(j.bodyB);
    if (a === void 0 || b2 === void 0 || a === b2) rigidError("E_RIGID_PARAMETER", "Joint endpoints must name two existing distinct bodies");
    const base = { kind: j.kind, bodyA: a, bodyB: b2, anchorA: vector(j.anchorA ?? [0, 0, 0], "anchorA"), anchorB: vector(j.anchorB ?? [0, 0, 0], "anchorB"), contacts: boolean(j.contacts ?? false, "joint.contacts") };
    if (j.kind === "fixed" || j.kind === "spherical") {
      object(j, "joint", ["id", "kind", "bodyA", "bodyB", "anchorA", "anchorB", "contacts"]);
      return base;
    }
    if (j.kind === "revolute" || j.kind === "prismatic") {
      object(j, "joint", ["id", "kind", "bodyA", "bodyB", "anchorA", "anchorB", "contacts", "axis", "limits", "motor"]);
      const axis = vector(j.axis, "axis");
      if (Math.abs(axis.reduce((s, x) => s + x * x, 0) - 1) > 1e-8) rigidError("E_RIGID_PARAMETER", "Joint axis must already be a unit vector");
      let limits, motor;
      if (j.limits !== void 0) {
        if (!Array.isArray(j.limits) || j.limits.length !== 2) rigidError("E_RIGID_PARAMETER", "limits need two values");
        limits = [finite(j.limits[0], "limit"), finite(j.limits[1], "limit")];
        if (limits[0] > limits[1]) rigidError("E_RIGID_PARAMETER", "Joint limits must be increasing");
      }
      if (j.motor !== void 0) {
        const m = object(j.motor, "motor", ["velocity", "maxForce"]);
        motor = { velocity: finite(m.velocity, "motor.velocity"), maxForce: finite(m.maxForce, "motor.maxForce", 0) };
      }
      return { ...base, axis, ...limits ? { limits } : {}, ...motor ? { motor } : {} };
    }
    if (j.kind === "spring") {
      object(j, "joint", ["id", "kind", "bodyA", "bodyB", "anchorA", "anchorB", "contacts", "restLength", "stiffness", "damping"]);
      return { ...base, restLength: finite(j.restLength, "restLength", 0), stiffness: finite(j.stiffness, "stiffness", 0), damping: finite(j.damping, "damping", 0) };
    }
    return rigidError("E_RIGID_PARAMETER", "Unknown joint kind");
  });
  unique(jointIds, "joint IDs");
  const solver = object(o.solver ?? {}, "solver", ["iterations", "ccdSubsteps", "lengthUnit", "maxLinearVelocity", "allowedLinearError", "predictionDistance", "maxCorrectiveVelocity", "contactRecycling", "contactClustering", "contactSoftness", "staticContactSoftness"]);
  const softness = (v) => {
    const x = object(v, "contactSoftness", ["frequency", "dampingRatio"]);
    return { frequency: finite(x.frequency, "contact frequency", Number.MIN_VALUE), dampingRatio: finite(x.dampingRatio, "contact damping ratio", 0) };
  };
  const native = { gravity: vector(o.gravity ?? [0, -9.81, 0], "gravity"), dt: 1 / hz, iterations: integer2(solver.iterations ?? 8, "iterations"), ccdSubsteps: integer2(solver.ccdSubsteps ?? 1, "ccdSubsteps", 0), lengthUnit: finite(solver.lengthUnit ?? 1, "lengthUnit", Number.MIN_VALUE), maxLinearVelocity: finite(solver.maxLinearVelocity ?? Number.MAX_VALUE, "maxLinearVelocity", Number.MIN_VALUE), allowedLinearError: finite(solver.allowedLinearError ?? 5e-3, "allowedLinearError", 0), predictionDistance: finite(solver.predictionDistance ?? 0.02, "predictionDistance", 0), maxCorrectiveVelocity: finite(solver.maxCorrectiveVelocity ?? 3, "maxCorrectiveVelocity", 0), contactRecycling: boolean(solver.contactRecycling ?? false, "contactRecycling"), contactClustering: boolean(solver.contactClustering ?? true, "contactClustering"), contactSoftness: softness(solver.contactSoftness ?? { frequency: 30, dampingRatio: 10 }), staticContactSoftness: softness(solver.staticContactSoftness ?? { frequency: 60, dampingRatio: 10 }), bodies: bodies.map(({ id: id2, ...body }) => body), joints, maxEvents: budgets.maxEventsPerStep, maxContactPoints: budgets.maxPointsPerEvent };
  const result = { fps, substeps, seed, budgets, bodies, colliderIds, colliderBodies, jointIds, controls, native };
  assertJson(result);
  return structuredClone(result);
}

// modules/rigid-body-effects/runtime/physics.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf8", { fatal: true });
var encode = (v) => encoder.encode(JSON.stringify(v));
var decode = (v) => JSON.parse(decoder.decode(v));
async function instantiatePhysics(bytes) {
  const raw = await instantiateModule(bytes);
  let config, runner, step = 0, contacts = [], failed = false, disposed = false, snapshotBytes = 0;
  function native(op, value, capacity) {
    try {
      return raw.call(op, value, capacity);
    } catch (error) {
      try {
        const e = decode(raw.call(8, new Uint8Array(), 8192));
        if (typeof e.code === "string" && typeof e.message === "string") rigidError(e.code, e.message);
      } catch (detail) {
        if (detail.code?.startsWith("E_RIGID_")) throw detail;
      }
      throw error;
    }
  }
  const json = (op, value, capacity = 4096) => decode(native(op, encode(value), capacity));
  function need() {
    if (disposed) rigidError("E_RIGID_DISPOSED", "Rigid simulation is disposed");
    if (!config || !runner) rigidError("E_RIGID_INITIALIZATION", "Rigid simulation has not been configured");
    return { c: config, r: runner };
  }
  function eventValues(c, events, at) {
    if (!Array.isArray(events) || events.length > c.budgets.maxEventsPerStep) rigidError("E_RIGID_EVENT_BUDGET", "Invalid event data");
    return events.map((e) => {
      if (!["started", "stopped", "force"].includes(e.kind) || !Number.isSafeInteger(e.colliderA) || !Number.isSafeInteger(e.colliderB) || !c.colliderIds[e.colliderA] || !c.colliderIds[e.colliderB] || typeof e.sensor !== "boolean" || typeof e.started !== "boolean" || !Array.isArray(e.points) || e.points.length > c.budgets.maxPointsPerEvent) rigidError("E_RIGID_PROTOCOL", "Malformed physical contact event");
      return { kind: e.kind, step: at, time: at * c.fps.den / c.fps.num / c.substeps, colliderA: c.colliderIds[e.colliderA], colliderB: c.colliderIds[e.colliderB], bodyA: c.bodies[c.colliderBodies[e.colliderA]].id, bodyB: c.bodies[c.colliderBodies[e.colliderB]].id, sensor: e.sensor, started: e.started, totalForce: vector(e.totalForce, "contact force"), totalMagnitude: finite(e.totalMagnitude, "contact force magnitude", 0), maxForceDirection: vector(e.maxForceDirection, "force direction"), maxForceMagnitude: finite(e.maxForceMagnitude, "maximum force", 0), points: e.points.map((p) => ({ pointA: vector(p.pointA, "contact point"), pointB: vector(p.pointB, "contact point"), normal: vector(p.normal, "contact normal") })) };
    });
  }
  function initialize(input) {
    if (config) rigidError("E_RIGID_INITIALIZATION", "World configuration is immutable; create another owner");
    const c = normalizeWorld(input);
    const simulation = {
      reset() {
        json(1, c.native);
        step = 0;
        contacts = [];
      },
      step(dt, next) {
        if ((next - 1) % c.substeps === 0) contacts = [];
        const start = controlContext((next - 1) / c.substeps, c.fps, c.substeps, c.seed), end = controlContext(next / c.substeps, c.fps, c.substeps, c.seed);
        const controls = c.controls.map((v, index) => ({ index, force: vector(evaluate(v.force, start), "force"), torque: vector(evaluate(v.torque, start), "torque"), ...v.target ? { target: vector(evaluate(v.target, end), "kinematicPosition") } : {} }));
        json(2, { step: next, dt, controls });
        const events = json(7, {}, c.budgets.maxOutputBytes);
        if (events.step !== next) rigidError("E_RIGID_TIME", "Native step number disagrees");
        for (const event of eventValues(c, events.events, next)) contacts.push(event);
        step = next;
      },
      snapshot() {
        const bytes2 = native(3, new Uint8Array(), c.budgets.maxSnapshotBytes);
        snapshotBytes = bytes2.length + encode(contacts).byteLength + 8;
        if (snapshotBytes > c.budgets.maxSnapshotBytes) rigidError("E_RIGID_BUDGET", "Native snapshot plus current-frame event values exceed maxSnapshotBytes");
        return { step, bytes: bytes2, contacts: structuredClone(contacts) };
      },
      restore(snapshot) {
        native(4, snapshot.bytes, 64);
        step = snapshot.step;
        contacts = structuredClone(snapshot.contacts);
      }
    };
    try {
      runner = new FixedStepRunner(simulation, { fps: c.fps.num / c.fps.den * c.substeps, checkpointInterval: c.budgets.checkpointInterval, maxCheckpoints: c.budgets.maxCheckpoints, maxSteps: c.budgets.maxReplaySteps });
      config = c;
      failed = false;
    } catch (error) {
      failed = true;
      raw.dispose();
      disposed = true;
      throw error;
    }
  }
  function sample(context) {
    const { c, r } = need();
    if (failed) rigidError("E_RIGID_FAILED", "Previous seek failed; reset or recreate the simulation");
    const { frame, time } = sampleContext(context, c.fps, c.substeps), at = frame * c.substeps;
    try {
      const result = r.seek(at), physical = json(5, {}, c.budgets.maxOutputBytes);
      if (physical.step !== at || physical.bodies.length !== c.bodies.length) rigidError("E_RIGID_PROTOCOL", "Native body state does not match the configured world");
      const bodies = physical.bodies.map((body, i) => {
        const q = body.rotation;
        if (!Array.isArray(q) || q.length !== 4 || q.some((n) => typeof n !== "number" || !Number.isFinite(n)) || Math.abs(q.reduce((s, x) => s + x * x, 0) - 1) > 1e-8 || typeof body.sleeping !== "boolean") rigidError("E_RIGID_NUMERIC", "Invalid quaternion/sleep state");
        return { id: c.bodies[i].id, position: vector(body.position, "body position"), rotation: q, linearVelocity: vector(body.linearVelocity, "linear velocity"), angularVelocity: vector(body.angularVelocity, "angular velocity"), sleeping: body.sleeping, mass: finite(body.mass, "body mass", 0) };
      });
      return { frame, time, step: at, fps: c.fps, seed: c.seed, bodies, contacts: result.contacts };
    } catch (error) {
      failed = true;
      throw error;
    }
  }
  function diagnostics() {
    const nativeInfo = disposed ? { worlds: 0 } : json(6, {}), c = config;
    return { ...raw.diagnostics(), worlds: nativeInfo.worlds, failed, currentStep: step, checkpointSteps: runner?.checkpointFrames ?? [], snapshotBytes, plannedCheckpointBytes: c ? c.budgets.maxSnapshotBytes * (c.budgets.maxCheckpoints + 3) : 0, physicalPeakBytes: null, backend: "rapier3d-f64-wasm", rapier: "0.36.1", precision: "f64", determinism: "enhanced" };
  }
  return {
    call(op, input, capacity) {
      if (disposed) rigidError("E_RIGID_DISPOSED", "Rigid simulation is disposed");
      let result;
      if (op === 100) {
        initialize(decode(input));
        result = { ready: true };
      } else if (op === 101) result = sample(decode(input));
      else if (op === 102) {
        const { r } = need();
        try {
          r.reset();
          failed = false;
          result = { reset: true };
        } catch (error) {
          failed = true;
          throw error;
        }
      } else rigidError("E_RIGID_OPERATION", "Unsupported public physics operation");
      const bytes2 = encode(result);
      if (bytes2.length > capacity) {
        failed = true;
        rigidError("E_RIGID_BYTES", "Physics output exceeds existing bytes-v1 reply budget");
      }
      return bytes2;
    },
    diagnostics,
    dispose() {
      if (disposed) return { remainingBuffers: 0 };
      disposed = true;
      runner = void 0;
      config = void 0;
      contacts = [];
      step = 0;
      snapshotBytes = 0;
      return raw.dispose();
    }
  };
}

// modules/rigid-body-effects/runtime/client.ts
async function createModuleClient(load, options = {}) {
  const timeout = options.initializationTimeoutMs ?? 15e3;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new ModuleError("E_WASM_ARGUMENT", "initializationTimeoutMs must be positive");
  if (options.signal?.aborted) throw new ModuleError("E_WASM_CANCELLED", "Module initialization cancelled");
  if (!options.worker) {
    const session = await instantiatePhysics((await load({ module: "bytes", format: "resource" })).slice().buffer);
    const cancel2 = () => {
      session.dispose();
    };
    options.signal?.addEventListener("abort", cancel2, { once: true });
    if (options.signal?.aborted) {
      session.dispose();
      throw new ModuleError("E_WASM_CANCELLED", "Module initialization cancelled");
    }
    return {
      async call(op, input, capacity) {
        return session.call(op, input, capacity);
      },
      async diagnostics() {
        return session.diagnostics();
      },
      async dispose() {
        options.signal?.removeEventListener("abort", cancel2);
        return session.dispose();
      }
    };
  }
  const [bytes, source] = await Promise.all([load({ module: "bytes", format: "resource" }), load({ module: "worker", format: "resource" })]);
  if (options.signal?.aborted) throw new ModuleError("E_WASM_CANCELLED", "Module initialization cancelled");
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
  function terminate(error = new ModuleError("E_WASM_DISPOSED", "Module Worker terminated")) {
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
    terminate(new ModuleError("E_WASM_CANCELLED", "Module Worker cancelled"));
  }
  options.signal?.addEventListener("abort", cancel, { once: true });
  worker.onmessage = ({ data }) => {
    const call = pending.get(data.id);
    if (!call) return;
    if (data.v !== 1) {
      terminate(new ModuleError("E_WASM_PROTOCOL", "Worker response version mismatch"));
      return;
    }
    pending.delete(data.id);
    clearTimeout(call.timer);
    if (data.error) call.reject(new ModuleError(data.error.code, data.error.message));
    else call.resolve(data.result);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    terminate(new ModuleError("E_WASM_WORKER", event.message || "Module Worker failed"));
  };
  worker.onmessageerror = () => terminate(new ModuleError("E_WASM_PROTOCOL", "Worker message cannot be decoded"));
  function request(method, data = {}, transfer = []) {
    if (dead || closing && method !== "dispose") return Promise.reject(new ModuleError("E_WASM_DISPOSED", "Module Worker is disposed"));
    const id2 = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = method === "init" ? setTimeout(() => terminate(new ModuleError("E_WASM_TIMEOUT", `Worker init exceeded ${timeout} ms`)), timeout) : void 0;
      pending.set(id2, { resolve, reject, timer });
      try {
        worker.postMessage({ v: 1, id: id2, method, ...data }, transfer);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id2);
        reject(error);
      }
    });
  }
  try {
    const copy = bytes.slice();
    await request("init", { bytes: copy.buffer }, [copy.buffer]);
  } catch (error) {
    terminate();
    throw error;
  }
  return {
    async call(operation, input, capacity) {
      const copy = input.slice();
      return new Uint8Array(await request("call", { operation, input: copy.buffer, capacity }, [copy.buffer]));
    },
    diagnostics() {
      return dead ? Promise.resolve({ disposed: true, buffers: 0 }) : request("diagnostics");
    },
    dispose() {
      return cleanup ??= (async () => {
        if (dead) return { remainingBuffers: 0 };
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

// modules/rigid-body-effects/src/api.ts
function createRigidBodyTools(load) {
  return { async createRigidBodies(input, options = {}) {
    const prepared = normalizeWorld(input), source = structuredClone(input);
    if (!options || Object.keys(options).some((k) => !["worker", "signal", "initializationTimeoutMs"].includes(k)) || options.worker !== void 0 && typeof options.worker !== "boolean") rigidError("E_RIGID_PARAMETER", "Invalid client options");
    const signal = options.signal, client = await createModuleClient(load, { ...options, worker: options.worker ?? true });
    try {
      await client.call(100, encode(source), 64);
    } catch (error) {
      await client.dispose();
      throw error;
    }
    let active, busy = false, disposed = false, closing;
    async function invoke(op, value) {
      if (disposed || closing) rigidError("E_RIGID_DISPOSED", "Rigid simulation is disposed");
      if (signal?.aborted) rigidError("E_RIGID_CANCELLED", "Simulation signal aborted");
      if (busy) rigidError("E_RIGID_BUSY", "Await the active sample/reset; calls are not silently reordered");
      busy = true;
      const call = (async () => {
        try {
          const result = decode(await client.call(op, encode(value), prepared.budgets.maxOutputBytes));
          if (signal?.aborted) rigidError("E_RIGID_CANCELLED", "Cancelled result is not published");
          return result;
        } catch (error) {
          if (error.code === "E_WASM_CANCELLED") rigidError("E_RIGID_CANCELLED", "Simulation Worker cancelled");
          throw error;
        }
      })().finally(() => {
        busy = false;
      });
      active = call;
      return call;
    }
    return {
      sample: async (context) => invoke(101, sampleContext(context, prepared.fps, prepared.substeps)),
      async reset() {
        await invoke(102, {});
      },
      async diagnostics() {
        if (disposed) return { disposed: true, buffers: 0, worlds: 0, failed: false, currentStep: 0, checkpointSteps: [], snapshotBytes: 0, plannedCheckpointBytes: 0, physicalPeakBytes: null, backend: "rapier3d-f64-wasm", rapier: "0.36.1", precision: "f64", determinism: "enhanced" };
        if (busy || closing) rigidError("E_RIGID_BUSY", "Await the active sample/close before diagnostics");
        return await client.diagnostics();
      },
      dispose() {
        return closing ??= (async () => {
          await active?.catch(() => {
          });
          disposed = true;
          return client.dispose();
        })();
      }
    };
  } };
}
export {
  createRigidBodyTools
};
