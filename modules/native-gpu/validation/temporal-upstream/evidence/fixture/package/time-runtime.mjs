// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\native-time\index.ts
import { EngineError as EngineError13 } from "@frameweave/engine";

// src/media/surface.ts
import { EngineError } from "@frameweave/engine";
var linear709 = { primaries: "rec709", whitePoint: "D65", transfer: "linear", reference: "scene", range: "full", referenceWhiteNits: 100 };
var acescg = { ...linear709, primaries: "acescg", whitePoint: "D60" };
var linear2020 = { ...linear709, primaries: "rec2020" };
var srgb = { ...linear709, transfer: "srgb", reference: "display" };
var pq2020 = { ...linear2020, transfer: "pq", reference: "display", peakNits: 1e3 };
var hlg2020 = { ...pq2020, transfer: "hlg", hlgSystemGamma: 1.2 };
var fail = (code, message) => {
  throw new EngineError(code, message);
};
function assertColor(c) {
  if (!c || Object.keys(c).some((k2) => !["primaries", "whitePoint", "transfer", "reference", "range", "referenceWhiteNits", "peakNits", "hlgSystemGamma"].includes(k2))) fail("E_MEDIA_COLOR", "Unknown color metadata field");
  if (!c || !["rec709", "rec2020", "display-p3", "acescg"].includes(c.primaries) || c.whitePoint !== (c.primaries === "acescg" ? "D60" : "D65") || !["linear", "srgb", "rec709", "pq", "hlg"].includes(c.transfer) || !["scene", "display"].includes(c.reference) || c.range !== "full" || !Number.isFinite(c.referenceWhiteNits) || c.referenceWhiteNits <= 0) fail("E_MEDIA_COLOR", "Explicit supported primaries, white point, transfer, reference, full range and positive reference white are required");
  if (["pq", "hlg"].includes(c.transfer) && (c.reference !== "display" || c.peakNits !== void 0 && (!Number.isFinite(c.peakNits) || c.peakNits < 100 || c.peakNits > 1e4))) fail("E_MEDIA_COLOR", "PQ/HLG require display reference and valid declared peak luminance");
  if (c.transfer === "hlg" && !Number.isFinite(c.peakNits)) fail("E_MEDIA_COLOR", "HLG OOTF requires an explicit display peak; PQ is absolute without one");
  if (c.transfer === "hlg" && c.primaries !== "rec2020") fail("E_MEDIA_COLOR", "This HLG OOTF adapter requires Rec.2020 primaries");
  if (c.transfer === "hlg" && (!Number.isFinite(c.hlgSystemGamma) || c.hlgSystemGamma < 1 || c.hlgSystemGamma > 2)) fail("E_MEDIA_COLOR", "Display HLG requires explicit system gamma 1..2");
}
var littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// modules/gpu-effects/pixel-shader.ts
import { EngineError as EngineError2 } from "@frameweave/engine";
function samePixelColor(a, b) {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k2) => a[k2] === b[k2]);
}

// modules/gpu-effects/resource-arena.ts
import { EngineError as EngineError3 } from "@frameweave/engine";
async function withGpuResources(scope, run) {
  const releases = /* @__PURE__ */ new Map();
  const adopt = (value, release) => {
    if (releases.has(value)) throw new EngineError3("E_GPU_RESOURCE_SCOPE", "Resource already adopted");
    releases.set(value, () => release(value));
    return value;
  };
  const arena = { image: (v) => adopt(v, (x) => scope.release(x)), buffer: (v) => adopt(v, (x) => scope.releaseBuffer(x)), adopt, keep: (v) => {
    if (!releases.delete(v)) throw new EngineError3("E_GPU_RESOURCE_SCOPE", "Only an adopted resource can be kept");
    return v;
  } };
  let result, primary, failed = false;
  try {
    result = await run(arena);
  } catch (e) {
    primary = e;
    failed = true;
  }
  const errors = [];
  for (const release of [...releases.values()].reverse()) try {
    await release();
  } catch (e) {
    errors.push(e);
  }
  if (errors.length) {
    const describe = (e) => {
      const x = e;
      return { code: x?.code ?? "E_GPU_RESOURCE_CLEANUP", message: x?.message ?? String(e) };
    };
    throw new EngineError3(primary instanceof EngineError3 ? primary.code : "E_GPU_RESOURCE_CLEANUP", primary instanceof Error ? primary.message : "GPU resource cleanup failed", { details: { primary: failed ? describe(primary) : null, cleanupErrors: errors.map(describe) } });
  }
  if (failed) throw primary;
  return result;
}

// src/core/animation.ts
import { EngineError as EngineError5 } from "@frameweave/engine";

// src/core/time.ts
import { EngineError as EngineError4 } from "@frameweave/engine";
function rational(value) {
  const rate = typeof value === "number" ? { num: value, den: 1 } : value;
  if (!Number.isSafeInteger(rate.num) || !Number.isSafeInteger(rate.den) || rate.den <= 0 || rate.num <= 0)
    throw new EngineError4("E_TIME", "A frame rate must be a positive integer or a positive rational {num, den}.");
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
      throw new EngineError5("E_EXPRESSION", `Unsupported expression operation: ${node.$expr}`);
  }
  if (!Number.isFinite(result)) throw new EngineError5("E_EXPRESSION", `Expression ${node.$expr} produced a non-finite number.`, { frame: context.globalFrame });
  return result;
}
function evaluate(value, context) {
  if (!value || typeof value !== "object") return value;
  if ("$keyframes" in value) return keyframesAt(value, context.frame);
  if ("$expr" in value) return expressionAt(value, context);
  if ("$spring" in value) return springAt(value, context);
  if (Array.isArray(value)) return value.map((item2) => evaluate(item2, context));
  return Object.fromEntries(Object.entries(value).map(([key, item2]) => [key, evaluate(item2, context)]));
}

// modules/gpu-image-effects/resident/parameters.ts
import { EngineError as EngineError6 } from "@frameweave/engine";
function fail2(message) {
  throw new EngineError6("E_GPU_IMAGE_PARAMETER", message);
}
function fields(o, keys, name) {
  if (!o || typeof o !== "object" || Array.isArray(o)) fail2(name + ": options object required");
  for (const k2 of Object.keys(o)) if (!["format", "signal", ...keys].includes(k2)) fail2(name + "." + k2 + ": unknown option");
  const output = o;
  if (output.format !== void 0 && !["rgba16float", "rgba32float"].includes(output.format)) fail2("Output must remain RGBA16F/32F");
  if (output.signal !== void 0 && !(output.signal instanceof AbortSignal)) fail2("AbortSignal required");
}
function number(v, fallback, name, ctx, min = -Infinity, max = Infinity) {
  const raw = v === void 0 ? fallback : v;
  if (typeof raw !== "number" && (!raw || typeof raw !== "object" || Array.isArray(raw))) fail2(name + ": number/Signal required");
  if (typeof raw !== "number" && !ctx) throw new EngineError6("E_GPU_IMAGE_CONTEXT", name + ": FrameContext required");
  const n = typeof raw === "number" ? raw : evaluate(raw, ctx);
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) fail2(name + ": finite value outside its declared range");
  const f = Math.fround(n);
  if (!Number.isFinite(f) || f !== 0 && Math.abs(f) < 2 ** -126) fail2(name + ": zero or normal finite Float32 required");
  return f;
}

// modules/gpu-image-effects/resident/arithmetic.ts
var arithmetic = "struct Pair { hi:vec4f, lo:vec4f }\nfn pair(value:vec4f)->Pair { return Pair(value,vec4f(0.)); }\nfn constant(hi:f32,lo:f32)->Pair { return Pair(vec4f(hi),vec4f(lo)); }\nfn normalize(hi:vec4f,lo:vec4f)->Pair {\n let sum=hi+lo;\n let error=lo-(sum-hi);\n return Pair(sum,error);\n}\nfn add(a:Pair,b:Pair)->Pair {\n let sum=a.hi+b.hi;\n let virtualB=sum-a.hi;\n let error=(a.hi-(sum-virtualB))+(b.hi-virtualB);\n return normalize(sum,(error+a.lo)+b.lo);\n}\nfn negate(a:Pair)->Pair { return Pair(-a.hi,-a.lo); }\nfn subtract(a:Pair,b:Pair)->Pair { return add(a,negate(b)); }\nfn multiply(a:Pair,b:Pair)->Pair {\n let product=a.hi*b.hi;\n let error=fma(a.hi,b.hi,-product);\n let cross=(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;\n return normalize(product,error+cross);\n}\nfn weighted(value:vec4f,weight:vec2f)->Pair {\n let product=value*weight.x;\n let error=fma(value,vec4f(weight.x),-product);\n return normalize(product,error+value*weight.y);\n}\nfn divide(a:Pair,b:Pair)->Pair {\n let first=a.hi/b.hi;\n let remainder=subtract(a,multiply(b,pair(first)));\n let second=(remainder.hi+remainder.lo)/b.hi;\n return normalize(first,second);\n}\nfn greater(a:Pair,b:Pair)->bool {\n return a.hi.x>b.hi.x || (a.hi.x==b.hi.x && a.lo.x>b.lo.x);\n}\nfn rounded(a:Pair)->vec4f { return a.hi+a.lo; }\n\n";

// modules/gpu-image-effects/resident/blends/kernels.ts
var blendKernel = { abiVersion: 1, id: "frameweave/blends/separable-pm", version: "1.0.0", inputCount: 2, parameterWords: 2, code: arithmetic + `
fn bad()->vec4f{return vec4f(bitcast<f32>(0x7fc00000u|(outputSize().x&1u)));}
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn normal(v:vec4f)->bool{let b=bitcast<vec4u>(v)&vec4u(0x7fffffffu);return all((b==vec4u(0u))|(b>=vec4u(0x00800000u)));}
fn pm(v:vec4f,mode:u32)->vec4f{if(!normal(v)){return bad();}if(mode==1u){let c=v.rgb*v.a;if(!normal(vec4f(c,v.a))||(v.a>0.&&any((c==vec3f(0.))&(v.rgb!=vec3f(0.))))){return bad();}return vec4f(c,v.a);}return v;}
fn minimum(a:Pair,b:Pair)->Pair{if(greater(a,b)){return b;}return a;}
fn maximum(a:Pair,b:Pair)->Pair{if(greater(a,b)){return a;}return b;}
fn absolute(v:Pair)->Pair{if(greater(scalar(0.),v)){return negate(v);}return v;}
// Exact power-of-two branch boundary for normal covered Alpha. Tiny Alpha has
// no positive normal-F32 channel below its half; avoid FTZ at that boundary.
fn lower_half(c:f32,a:f32)->bool{if(c<=0.){return true;}if(c>=a||a<0x1p-125f){return false;}return c<=a*.5;}
fn pixel(p:vec2u)->vec4f{
 let raw=pm(read0(vec2i(p)),alpha0());let b=pm(read1(vec2i(p)),alpha1());let opacity=paramF32(1u);let s=raw*opacity;
 if(!normal(s)||(opacity>0.&&any((s==vec4f(0.))&(raw!=vec4f(0.))))){return bad();}
 let sa=scalar(s.a);let ba=scalar(b.a);let one=scalar(1.);let alpha=rounded(add(sa,multiply(ba,subtract(one,sa)))).x;var out=vec4f(0.,0.,0.,alpha);
 for(var c=0u;c<3u;c++){
  let cs=scalar(s[c]);let cb=scalar(b[c]);
  if(s.a==0.||b.a==0.){out[c]=rounded(add(cs,multiply(cb,subtract(one,sa)))).x;continue;}
  let P=multiply(cb,sa);let Q=multiply(cs,ba);let AB=multiply(sa,ba);let base=add(multiply(cs,subtract(one,ba)),multiply(cb,subtract(one,sa)));var overlap=scalar(0.);var result=scalar(0.);
  switch paramU32(0u){
   case 3u:{overlap=minimum(P,Q);result=add(base,overlap);}
   case 10u:{overlap=maximum(P,Q);result=add(base,overlap);}
   case 23u:{overlap=absolute(subtract(P,Q));result=add(base,overlap);}
   case 25u:{let product=multiply(cs,cb);result=add(subtract(cs,product),subtract(cb,product));}
   case 16u,18u:{var low=lower_half(b[c],b.a);if(paramU32(0u)==18u){low=lower_half(s[c],s.a);}if(low){let product=multiply(cs,cb);result=add(add(base,product),product);}else{let product=multiply(subtract(ba,cb),subtract(sa,cs));result=subtract(subtract(add(base,AB),product),product);}}
   case 7u:{result=subtract(add(cs,cb),AB);}
   case 26u:{result=add(cb,multiply(cs,subtract(one,multiply(ba,scalar(2.)))));}
   case 19u:{result=add(add(base,add(P,Q)),subtract(Q,AB));}
   case 21u:{if(lower_half(s[c],s.a)){overlap=minimum(P,multiply(Q,scalar(2.)));}else{overlap=maximum(P,subtract(multiply(Q,scalar(2.)),AB));}result=add(base,overlap);}
   default:{return bad();}
  }
  out[c]=rounded(result).x;
 }
 return out;
}` };

// modules/gpu-image-effects/resident/blends/types.ts
var blendModes = { darken: 3, lighten: 10, difference: 23, exclusion: 25, overlay: 16, hardLight: 18, linearBurn: 7, subtractBlend: 26, linearLight: 19, pinLight: 21 };

// modules/gpu-image-effects/resident/blends/filters.ts
function createBlendFilters(scope, context, track = (v) => v, signal) {
  async function blend(name, s, b, o) {
    fields(o, ["opacity"], name);
    if (s.info.width !== b.info.width || s.info.height !== b.info.height) fail2(name + ": foreground/backdrop dimensions must match");
    const p = Uint32Array.of(blendModes[name], 0);
    new Float32Array(p.buffer)[1] = number(o.opacity, 1, "opacity", context, 0, 1);
    if (scope.stats().pendingPasses >= scope.capabilities().maxPendingPasses) await scope.complete({ signal: o.signal ?? signal });
    return track(await scope.run(await scope.compile(blendKernel), [s, b], { parameters: p, output: { format: o.format ?? s.info.format, alpha: "premultiplied" }, signal: o.signal ?? signal }));
  }
  return {
    async darken(s, b, o = {}) {
      return blend("darken", s, b, o);
    },
    async lighten(s, b, o = {}) {
      return blend("lighten", s, b, o);
    },
    async difference(s, b, o = {}) {
      return blend("difference", s, b, o);
    },
    async exclusion(s, b, o = {}) {
      return blend("exclusion", s, b, o);
    },
    async overlay(s, b, o = {}) {
      return blend("overlay", s, b, o);
    },
    async hardLight(s, b, o = {}) {
      return blend("hardLight", s, b, o);
    },
    async linearBurn(s, b, o = {}) {
      return blend("linearBurn", s, b, o);
    },
    async subtractBlend(s, b, o = {}) {
      return blend("subtractBlend", s, b, o);
    },
    async linearLight(s, b, o = {}) {
      return blend("linearLight", s, b, o);
    },
    async pinLight(s, b, o = {}) {
      return blend("pinLight", s, b, o);
    }
  };
}

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\time-controls.ts
import { EngineError as EngineError7 } from "@frameweave/engine";
function fail3(message) {
  throw new EngineError7("E_PA_TIME", message);
}
function finite(n, name) {
  if (typeof n !== "number" || !Number.isFinite(n)) fail3(`${name} must be finite`);
  return n;
}
var scalar = (value, ctx, name) => finite(evaluate(value, ctx), name);
function posterizeTime(options, context) {
  const t = scalar(options.time ?? context.time, context, "time"), origin = finite(options.origin ?? 0, "origin"), rate = rational(options.rate);
  const phase = finite((t - origin) * rate.num / rate.den, "sample phase");
  if (Math.abs(phase) > Number.MAX_SAFE_INTEGER) fail3("Sample index exceeds Float64 exact-integer resolution");
  return finite(origin + Math.floor(phase) * rate.den / rate.num, "posterized time");
}

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\native-time\plans.ts
import { EngineError as EngineError9 } from "@frameweave/engine";

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\shutter-sampling.ts
import { EngineError as EngineError8 } from "@frameweave/engine";
var fail4 = (message) => {
  throw new EngineError8("E_PA_TIME", message);
};
function finite2(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail4(`${name} must be finite`);
  return value;
}
function shutterSamples(options, context) {
  const count2 = options.count ?? 16;
  if (!Number.isSafeInteger(count2) || count2 < 1) fail4("count must be a positive safe integer");
  const fps = rational(context.fps), period = fps.den / fps.num;
  const scalar3 = (value, name) => finite2(evaluate(value, context), name);
  const time = scalar3(options.time ?? context.time, "time"), angle = scalar3(options.angleDegrees ?? 180, "angleDegrees"), phase = scalar3(options.phaseDegrees ?? -angle / 2, "phaseDegrees");
  if (angle < 0) fail4("angleDegrees must be nonnegative");
  const exposure = finite2(angle / 360 * period, "exposure seconds"), opening = finite2(phase / 360 * period, "opening offset");
  if (angle > 0 && exposure === 0) fail4("Positive exposure is below Float64 time resolution");
  const start = finite2(time + opening, "shutter start"), end3 = finite2(start + exposure, "shutter end");
  if (exposure > 0 && end3 <= start) fail4("Shutter endpoints are not resolvable at this absolute time");
  const rawTime = (index) => {
    const value = index < count2 / 2 ? start + (index + 0.5) / count2 * exposure : end3 - (count2 - 1 - index + 0.5) / count2 * exposure;
    return finite2(value, "sample time");
  };
  const at = (index) => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= count2) fail4(`Sample index must be inside [0, ${count2})`);
    const t = exposure === 0 ? start : rawTime(index);
    if (exposure > 0 && (t <= start || t >= end3 || index > 0 && t <= rawTime(index - 1) || index + 1 < count2 && t >= rawTime(index + 1))) fail4("Shutter sample spacing is below Float64 time resolution");
    return Object.freeze({ index, time: t, frame: finite2(t * (fps.num / fps.den), "sample frame"), weight: 1 / count2 });
  };
  at(0);
  if (count2 > 1) at(count2 - 1);
  return Object.freeze({
    count: count2,
    startTime: start,
    endTime: end3,
    exposureSeconds: exposure,
    at,
    *[Symbol.iterator]() {
      for (let i = 0; i < count2; i++) yield at(i);
    }
  });
}

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\native-time\plans.ts
var timeFail = (message) => {
  throw new EngineError9("E_PA_NATIVE_TIME", message);
};
function finite3(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) timeFail(name + " must be finite");
  return value;
}
function scalar2(value, context, name) {
  return finite3(evaluate(value, context), name);
}
function count(value, name, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) timeFail(name + " must be a safe integer >= " + minimum);
  return value;
}
function fields2(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k2) => !names.includes(k2))) timeFail("Unknown time option");
}
function resolveTimeRange(time, range) {
  finite3(time, "source time");
  if (!range) return time;
  fields2(range, ["start", "end", "boundary"]);
  const { start, end: end3 } = range, mode = range.boundary ?? "error";
  finite3(start, "range start");
  finite3(end3, "range end");
  if (end3 < start || !["error", "clamp", "loop", "ping-pong", "transparent"].includes(mode)) timeFail("Ordered range and known boundary required");
  if (time >= start && time <= end3) return time;
  if (mode === "transparent") return null;
  if (mode === "error") timeFail("Source time outside the explicit sample-centre range");
  if (mode === "clamp") return Math.max(start, Math.min(end3, time));
  const span = finite3(end3 - start, "range span");
  if (span === 0) timeFail("Loop/ping-pong needs a positive range");
  const delta = finite3(time - start, "relative time"), cycles = delta / span;
  if (!Number.isFinite(cycles) || Math.abs(cycles) > Number.MAX_SAFE_INTEGER) timeFail("Boundary phase exceeds Float64 resolution");
  let phase = delta % span;
  if (phase < 0) phase += span;
  return mode === "loop" ? start + phase : Math.abs(Math.floor(cycles) % 2) === 1 ? end3 - phase : start + phase;
}
function sourceTimeContext(context, time) {
  const rate = rational(context.fps);
  finite3(time, "source time");
  return Object.freeze({ ...context, time, frame: finite3(time * rate.num / rate.den, "source frame") });
}
function shutterTimeContext(context, time) {
  const rate = rational(context.fps);
  finite3(context.dt, "Stage dt");
  if (context.dt === 0) timeFail("Shutter subframes require nonzero affine Stage dt");
  if (!Number.isSafeInteger(context.durationInFrames) || context.durationInFrames < 1) timeFail("Finite Stage duration required");
  const local = sourceTimeContext(context, time), delta = finite3((time - context.time) / context.dt, "global frame delta");
  return Object.freeze({ ...local, globalFrame: finite3(context.globalFrame + delta, "global subframe"), globalTime: finite3(context.globalTime + delta * rate.den / rate.num, "global subtime"), progress: context.durationInFrames <= 1 ? 0 : finite3(context.progress + delta / (context.durationInFrames - 1), "subframe progress") });
}
function plan(length, at) {
  count(length, "sample count");
  return Object.freeze({ count: length, at(index) {
    count(index, "sample index", 0);
    if (index >= length) timeFail("Sample index out of range");
    return Object.freeze(at(index));
  }, *[Symbol.iterator]() {
    for (let i = 0; i < length; i++) yield this.at(i);
  } });
}
var item = (index, time, weight, context) => ({ index, time: finite3(time, "sample time"), weight: finite3(weight, "sample weight"), context: sourceTimeContext(context, time) });
function frameBlendSamples(options, context) {
  fields2(options, ["time", "fps", "origin", "method"]);
  const time = scalar2(options.time ?? context.time, context, "time"), rate = rational(options.fps ?? context.fps), origin = finite3(options.origin ?? 0, "origin"), method = options.method ?? "linear";
  if (!["hold", "nearest", "linear"].includes(method)) timeFail("Known frame sampling method required");
  const x = finite3((time - origin) * rate.num / rate.den, "source frame");
  if (Math.abs(x) > Number.MAX_SAFE_INTEGER - 1) timeFail("Source frame exceeds exact integer domain");
  const low = Math.floor(x), fraction = x - low, first = method === "nearest" ? Math.floor(x + 0.5) : low, length = method === "linear" && fraction > 0 ? 2 : 1;
  return plan(length, (i) => item(i, origin + (first + i) * rate.den / rate.num, length === 1 ? 1 : i === 0 ? 1 - fraction : fraction, context));
}
function echoSamples(options, context) {
  fields2(options, ["time", "echoes", "interval", "intensity", "decay"]);
  const echoes = count(options.echoes ?? 8, "echoes", 0);
  if (echoes === Number.MAX_SAFE_INTEGER) timeFail("Echo count plus current sample is not representable");
  const time = scalar2(options.time ?? context.time, context, "time"), dt = scalar2(options.interval ?? -context.fps.den / context.fps.num, context, "interval"), intensity = scalar2(options.intensity ?? 1, context, "intensity"), decay = scalar2(options.decay ?? 0.75, context, "decay");
  if (intensity < 0 || decay < 0 || decay > 1) timeFail("Nonnegative intensity and decay in [0,1] required");
  return plan(echoes + 1, (i) => {
    const weight = intensity * decay ** i;
    if (intensity > 0 && decay > 0 && weight === 0) timeFail("Echo weight underflow; shorten range or explicitly use zero decay");
    return item(i, time + i * dt, weight, context);
  });
}
function trailSamples(options, context) {
  fields2(options, ["time", "duration", "count", "direction", "falloff", "decay"]);
  const n = count(options.count ?? 16, "count"), duration = finite3(options.duration, "duration"), time = scalar2(options.time ?? context.time, context, "time"), direction = options.direction ?? "past", falloff = options.falloff ?? "exponential", decay = finite3(options.decay ?? 0.15, "decay");
  if (duration < 0 || !["past", "future"].includes(direction) || !["box", "linear", "exponential"].includes(falloff) || decay < 0 || decay > 1) timeFail("Invalid trail range/falloff");
  return plan(n, (i) => {
    const u = n === 1 ? 0 : i / (n - 1), w = falloff === "box" ? 1 : falloff === "linear" ? 1 - u : decay ** u;
    return item(i, time + (direction === "past" ? -1 : 1) * duration * u, w, context);
  });
}
function wideTimeSamples(options, context) {
  fields2(options, ["time", "before", "after", "count", "weight"]);
  const n = count(options.count ?? 16, "count"), time = scalar2(options.time ?? context.time, context, "time"), before = finite3(options.before, "before"), after = finite3(options.after, "after"), weight = options.weight ?? "box";
  if (before < 0 || after < 0 || !["box", "triangle"].includes(weight)) timeFail("Nonnegative window extents and known weight required");
  const span = finite3(before + after, "window span"), start = finite3(time - before, "window start");
  return plan(n, (i) => {
    const u = (i + 0.5) / n;
    return item(i, start + u * span, weight === "box" ? 1 : 1 - Math.abs(2 * u - 1), context);
  });
}
function shutterTimeSamples(options, context) {
  const shutter = shutterSamples(options, context);
  return plan(shutter.count, (i) => {
    const s = shutter.at(i);
    return { index: i, time: s.time, weight: s.weight, context: shutterTimeContext(context, s.time) };
  });
}
function strobeTime(time, options) {
  fields2(options, ["period", "onDuration", "origin", "off"]);
  finite3(time, "time");
  const period = finite3(options.period, "period"), on = finite3(options.onDuration, "onDuration"), origin = finite3(options.origin ?? 0, "origin"), off = options.off ?? "transparent";
  if (period <= 0 || on < 0 || on > period || !["transparent", "hold"].includes(off)) timeFail("Require 0 <= onDuration <= positive period");
  const phase = (time - origin) / period;
  if (!Number.isFinite(phase) || Math.abs(phase) > Number.MAX_SAFE_INTEGER) timeFail("Strobe phase exceeds Float64 domain");
  const cycle = Math.floor(phase), start = finite3(origin + cycle * period, "cycle start");
  return time - start < on ? time : off === "hold" ? finite3(start + on, "held strobe time") : null;
}

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\native-time\reduction.ts
import { EngineError as EngineError12 } from "@frameweave/engine";

// modules/gpu-effects/pixel-effects.ts
import { EngineError as EngineError11 } from "@frameweave/engine";

// src/media/color.ts
import { EngineError as EngineError10 } from "@frameweave/engine";

// modules/gpu-effects/float-pass-shaders.ts
var floatPassShader = `
struct Params {
 dims:vec4u,
 mode:vec4u,
 valuesHi:vec4f,
 valuesLo:vec4f,
 lumaHi:vec4f,
 lumaLo:vec4f,
 padding0:vec4f,
 padding1:vec4f,
}
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read> secondary:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> destination:array<vec4f>;
@group(0) @binding(3) var<storage,read> weights:array<vec2f>;
@group(0) @binding(4) var<uniform> p:Params;

struct Pair { hi:vec4f, lo:vec4f }
fn pair(value:vec4f)->Pair { return Pair(value,vec4f(0.)); }
fn constant(hi:f32,lo:f32)->Pair { return Pair(vec4f(hi),vec4f(lo)); }
fn normalize(hi:vec4f,lo:vec4f)->Pair {
 let sum=hi+lo;
 let error=lo-(sum-hi);
 return Pair(sum,error);
}
fn add(a:Pair,b:Pair)->Pair {
 let sum=a.hi+b.hi;
 let virtualB=sum-a.hi;
 let error=(a.hi-(sum-virtualB))+(b.hi-virtualB);
 return normalize(sum,(error+a.lo)+b.lo);
}
fn negate(a:Pair)->Pair { return Pair(-a.hi,-a.lo); }
fn subtract(a:Pair,b:Pair)->Pair { return add(a,negate(b)); }
fn multiply(a:Pair,b:Pair)->Pair {
 let product=a.hi*b.hi;
 let error=fma(a.hi,b.hi,-product);
 let cross=(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;
 return normalize(product,error+cross);
}
fn weighted(value:vec4f,weight:vec2f)->Pair {
 let product=value*weight.x;
 let error=fma(value,vec4f(weight.x),-product);
 return normalize(product,error+value*weight.y);
}
fn divide(a:Pair,b:Pair)->Pair {
 let first=a.hi/b.hi;
 let remainder=subtract(a,multiply(b,pair(first)));
 let second=(remainder.hi+remainder.lo)/b.hi;
 return normalize(first,second);
}
fn greater(a:Pair,b:Pair)->bool {
 return a.hi.x>b.hi.x || (a.hi.x==b.hi.x && a.lo.x>b.lo.x);
}
fn rounded(a:Pair)->vec4f { return a.hi+a.lo; }

fn gaussian(id:vec2u)->vec4f {
 var total=pair(vec4f(0.));
 for(var k=-i32(p.dims.z);k<=i32(p.dims.z);k++) {
  var x=i32(id.x);var y=i32(id.y);
  if(p.dims.w==0u){x+=k;}else{y+=k;}
  if(p.mode.x==1u){x=clamp(x,0,i32(p.dims.x)-1);y=clamp(y,0,i32(p.dims.y)-1);}
  else if(x<0||y<0||x>=i32(p.dims.x)||y>=i32(p.dims.y)){continue;}
  let sample=source[u32(y)*p.dims.x+u32(x)];
  total=add(total,weighted(sample,weights[u32(k+i32(p.dims.z))]));
 }
 return rounded(total);
}
fn threshold(index:u32)->vec4f {
 let value=source[index];
 if(value.a==0.){return vec4f(0.);}
 var luminance=weighted(vec4f(value.r),vec2f(p.lumaHi.r,p.lumaLo.r));
 luminance=add(luminance,weighted(vec4f(value.g),vec2f(p.lumaHi.g,p.lumaLo.g)));
 luminance=add(luminance,weighted(vec4f(value.b),vec2f(p.lumaHi.b,p.lumaLo.b)));
 let y=divide(luminance,pair(vec4f(value.a)));
 let limit=constant(p.valuesHi.x,p.valuesLo.x);
 if(!greater(y,limit)){return vec4f(0.);}
 let fraction=subtract(pair(vec4f(1.)),divide(limit,y));
 return rounded(multiply(pair(value),fraction));
}
fn combine(index:u32)->vec4f {
 let value=source[index];let bloom=secondary[index];
 let intensity=constant(p.valuesHi.y,p.valuesLo.y);
 let rgb=rounded(add(pair(value),multiply(pair(bloom),intensity)));
 var coverage=multiply(pair(vec4f(bloom.a)),intensity);
 let zero=pair(vec4f(0.));let one=pair(vec4f(1.));
 // This is PA-1 Glow's defined coverage saturation, never a Gaussian/RGB clamp.
 if(greater(zero,coverage)){coverage=zero;}
 if(greater(coverage,one)){coverage=one;}
 let alpha=rounded(add(pair(vec4f(value.a)),multiply(subtract(one,pair(vec4f(value.a))),coverage))).x;
 return vec4f(rgb.rgb,alpha);
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id:vec3u) {
 if(id.x>=p.dims.x||id.y>=p.dims.y){return;}
 let index=id.y*p.dims.x+id.x;
 switch(p.mode.y) {
  case 0u:{destination[index]=gaussian(id.xy);}
  case 1u:{destination[index]=threshold(index);}
  case 2u:{destination[index]=combine(index);}
  default:{destination[index]=vec4f(bitcast<f32>(0x7fc00000u|p.mode.w));}
 }
}`;

// modules/gpu-effects/pixel-effects.ts
var pixelCompensatedArithmetic = floatPassShader.slice(floatPassShader.indexOf("struct Pair"), floatPassShader.indexOf("fn gaussian"));
var kernel = (id, inputCount, parameterWords, code) => ({ abiVersion: 1, id: "frameweave/" + id, version: "1.0.0", inputCount, parameterWords, code });
var canonical = kernel("float-canonical", 1, 0, `fn pixel(p:vec2u)->vec4f{
 let v=read0(vec2i(p));let a=v.a;let rgb=select(v.rgb*a,v.rgb,alpha0()==0u);let out=vec4f(select(rgb,vec3f(0.),a==0.),a);
 if((a!=0.&&a<0x1p-24f)||any(abs(out.rgb)>vec3f(65504.))||any((abs(out.rgb)>vec3f(0.))&(abs(out.rgb)<vec3f(0x1p-100f)))){return vec4f(bitcast<f32>(0x7fc00000u|(p.x&1023u)));}return out;
}`);
var gaussian = kernel("float-gaussian-axis", 1, 774, pixelCompensatedArithmetic + `
 fn pixel(p:vec2u)->vec4f{var total=pair(vec4f(0.));let radius=i32(paramU32(0u));let d=vec2i(size0());
 for(var k=-radius;k<=radius;k++){var q=vec2i(p);if(paramU32(1u)==0u){q.x+=k;}else{q.y+=k;}
  if(paramU32(2u)!=0u){q=clamp(q,vec2i(0),d-1);}else if(any(q<vec2i(0))||any(q>=d)){continue;}
  let i=4u+2u*u32(k+radius);total=add(total,weighted(read0(q),vec2f(paramF32(i),paramF32(i+1u))));}return rounded(total);
 }`);
var threshold = kernel("float-glow-threshold", 1, 8, pixelCompensatedArithmetic + `
 fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));if(v.a==0.){return vec4f(0.);}
  var l=weighted(vec4f(v.r),vec2f(paramF32(2u),paramF32(3u)));l=add(l,weighted(vec4f(v.g),vec2f(paramF32(4u),paramF32(5u))));l=add(l,weighted(vec4f(v.b),vec2f(paramF32(6u),paramF32(7u))));
  let y=divide(l,pair(vec4f(v.a)));let limit=constant(paramF32(0u),paramF32(1u));if(!greater(y,limit)){return vec4f(0.);}
  return rounded(multiply(pair(v),subtract(pair(vec4f(1.)),divide(limit,y))));
 }`);
var combine = kernel("float-glow-combine", 2, 2, pixelCompensatedArithmetic + `
 fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));let bloom=read1(vec2i(p));let intensity=constant(paramF32(0u),paramF32(1u));let rgb=rounded(add(pair(v),multiply(pair(bloom),intensity)));
 var coverage=multiply(pair(vec4f(bloom.a)),intensity);let zero=pair(vec4f(0.));let one=pair(vec4f(1.));if(greater(zero,coverage)){coverage=zero;}if(greater(coverage,one)){coverage=one;}
 let a=rounded(add(pair(vec4f(v.a)),multiply(subtract(one,pair(vec4f(v.a))),coverage))).x;return vec4f(rgb.rgb,a);
 }`);
var over = kernel("float-over", 2, 0, pixelCompensatedArithmetic + `
 fn pixel(p:vec2u)->vec4f{let a=read0(vec2i(p));let b=read1(vec2i(p));return rounded(add(pair(a),multiply(pair(b),subtract(pair(vec4f(1.)),pair(vec4f(a.a))))));}
`);

// modules/native-effects/pa/kernels.ts
var k = (id, inputCount, parameterWords, code) => ({ abiVersion: 1, id: "frameweave/native-pa-" + id, version: "1.0.0", inputCount, parameterWords, code });
var head = pixelCompensatedArithmetic + `fn scalar(i:u32)->Pair{return constant(paramF32(i),paramF32(i+1u));}`;
var canonical2 = k("canonical", 1, 0, `fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(select(select(v.rgb*v.a,v.rgb,alpha0()==0u),vec3f(0.),v.a==0.),v.a);}`);
var begin = floatPassShader.indexOf("fn gaussian(");
var end = floatPassShader.indexOf("\nfn threshold(");
if (begin < 0 || end <= begin) throw Error("Original PA Gaussian source changed");
var gaussianBody = floatPassShader.slice(begin, end).replaceAll("p.dims.z", "paramU32(0u)").replaceAll("p.dims.w", "paramU32(1u)").replaceAll("p.dims.x", "size0().x").replaceAll("p.dims.y", "size0().y").replaceAll("p.mode.x", "paramU32(2u)").replaceAll("source[u32(y)*size0().x+u32(x)]", "read0(vec2i(x,y))").replaceAll("weights[u32(k+i32(paramU32(0u)))]", "vec2f(paramF32(4u+2u*u32(k+i32(paramU32(0u)))),paramF32(5u+2u*u32(k+i32(paramU32(0u)))))");
var gaussian2 = k("gaussian", 1, 774, guardedMath(3, head + gaussianBody + "\nfn pixel(p:vec2u)->vec4f{return gaussian(p);}"));
var threshold2 = k("threshold", 1, 9, guardedMath(8, head + `
fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));if(v.a==0.){return vec4f(0.);}
 var y=weighted(vec4f(v.r),vec2f(paramF32(2u),paramF32(3u)));y=add(y,weighted(vec4f(v.g),vec2f(paramF32(4u),paramF32(5u))));y=add(y,weighted(vec4f(v.b),vec2f(paramF32(6u),paramF32(7u))));y=divide(y,pair(vec4f(v.a)));
 if(!greater(y,scalar(0u))){return vec4f(0.);}return rounded(multiply(pair(v),subtract(pair(vec4f(1.)),divide(scalar(0u),y))));}`));
var combine2 = k("combine", 2, 3, guardedMath(2, head + `
fn pixel(p:vec2u)->vec4f{let source=read0(vec2i(p));let bloom=read1(vec2i(p));let intensity=scalar(0u);let rgb=rounded(add(pair(source),multiply(pair(bloom),intensity)));var coverage=multiply(pair(vec4f(bloom.a)),intensity);let zero=pair(vec4f(0.));let one=pair(vec4f(1.));if(greater(zero,coverage)){coverage=zero;}if(greater(coverage,one)){coverage=one;}let a=rounded(add(pair(vec4f(source.a)),multiply(subtract(one,pair(vec4f(source.a))),coverage))).x;return vec4f(rgb.rgb,a);}`));
var sampler = head + `
struct Coord{cell:vec2i,fx:Pair,fy:Pair}
fn coordinates(x:Pair,y:Pair)->Coord{var ix=floor(x.hi.x);var fx=subtract(x,pair(vec4f(ix)));if(fx.hi.x<0.||(fx.hi.x==0.&&fx.lo.x<0.)){ix-=1.;fx=add(fx,pair(vec4f(1.)));}if(fx.hi.x>1.||(fx.hi.x==1.&&fx.lo.x>=0.)){ix+=1.;fx=subtract(fx,pair(vec4f(1.)));}
 var iy=floor(y.hi.x);var fy=subtract(y,pair(vec4f(iy)));if(fy.hi.x<0.||(fy.hi.x==0.&&fy.lo.x<0.)){iy-=1.;fy=add(fy,pair(vec4f(1.)));}if(fy.hi.x>1.||(fy.hi.x==1.&&fy.lo.x>=0.)){iy+=1.;fy=subtract(fy,pair(vec4f(1.)));}return Coord(vec2i(i32(ix),i32(iy)),fx,fy);}
fn at(q:vec2i)->vec4f{var xy=q;if(paramU32(0u)!=0u){xy=clamp(xy,vec2i(0),vec2i(size0())-1);}return read0(xy);}
fn bilinearPair(x:Pair,y:Pair)->Pair{let c=coordinates(x,y);let one=pair(vec4f(1.));let ix=subtract(one,c.fx);let iy=subtract(one,c.fy);
 // Original CPU: (((s00*ix)*iy+(s10*fx)*iy)+(s01*ix)*fy)+(s11*fx)*fy.
 var result=multiply(multiply(pair(at(c.cell)),ix),iy);result=add(result,multiply(multiply(pair(at(c.cell+vec2i(1,0))),c.fx),iy));result=add(result,multiply(multiply(pair(at(c.cell+vec2i(0,1))),ix),c.fy));return add(result,multiply(multiply(pair(at(c.cell+vec2i(1))),c.fx),c.fy));}
fn bilinear(x:Pair,y:Pair)->vec4f{return rounded(bilinearPair(x,y));}
`;
function guardedMath(word, body) {
  return `fn round32(v:vec4f)->vec4f{return bitcast<vec4f>(bitcast<vec4u>(v)^vec4u(paramU32(${word}u)));}
` + body.replace("let sum=hi+lo;", "let sum=round32(hi+lo);").replace("let error=lo-(sum-hi);", "let error=round32(lo-round32(sum-hi));").replace("let sum=a.hi+b.hi;", "let sum=round32(a.hi+b.hi);").replace("let virtualB=sum-a.hi;", "let virtualB=round32(sum-a.hi);").replace("let error=(a.hi-(sum-virtualB))+(b.hi-virtualB);", "let error=round32(round32(a.hi-round32(sum-virtualB))+round32(b.hi-virtualB));").replace("return normalize(sum,(error+a.lo)+b.lo);", "return normalize(sum,round32(round32(error+a.lo)+b.lo));").replace("let product=a.hi*b.hi;", "let product=round32(a.hi*b.hi);").replace("let error=fma(a.hi,b.hi,-product);", "let error=round32(fma(a.hi,b.hi,-product));").replace("let cross=(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;", "let cross=round32(round32(round32(a.hi*b.lo)+round32(a.lo*b.hi))+round32(a.lo*b.lo));").replace("return normalize(product,error+cross);", "return normalize(product,round32(error+cross));").replace("let product=value*weight.x;", "let product=round32(value*weight.x);").replace("let error=fma(value,vec4f(weight.x),-product);", "let error=round32(fma(value,vec4f(weight.x),-product));").replace("return normalize(product,error+value*weight.y);", "return normalize(product,round32(error+round32(value*weight.y)));");
}
var guardedSampler = (word) => guardedMath(word, sampler);
var displacement = { ...k("sine-displacement", 1, 9, guardedSampler(8) + `
fn pixel(p:vec2u)->vec4f{let wx=constant(data0(2u*p.x),data0(2u*p.x+1u));let wy=constant(data0(2u*(size0().x+p.y)),data0(2u*(size0().x+p.y)+1u));let amount=scalar(2u);
 let x=add(add(pair(vec4f(f32(p.x))),multiply(multiply(amount,wy),wx)),scalar(4u));let y=add(add(pair(vec4f(f32(p.y))),multiply(multiply(amount,wx),constant(0.6, -0.00000002384185793236071))),scalar(6u));
 if(paramU32(1u)!=0u){let c=coordinates(add(x,constant(.5,0.)),add(y,constant(.5,0.)));return at(c.cell);}return bilinear(x,y);}`), abiVersion: 2, dataInputs: [{ type: "f32" }] };
var mapWarp = k("rg-map", 2, 4, guardedSampler(1) + `
fn pixel(p:vec2u)->vec4f{let map=read1(vec2i(p));let scale=scalar(2u);return bilinear(add(pair(vec4f(f32(p.x))),multiply(pair(vec4f(map.r)),scale)),add(pair(vec4f(f32(p.y))),multiply(pair(vec4f(map.g)),scale)));}`);
var inversePad = k("inverse-pad", 1, 4, guardedMath(3, pixelCompensatedArithmetic + `
fn pixel(p:vec2u)->vec4f{var a=0.;if(paramU32(2u)==0u){let q=vec2i(p)+vec2i(bitcast<i32>(paramU32(0u)),bitcast<i32>(paramU32(1u)));a=read0(q).a;}return vec4f(0.,0.,0.,rounded(subtract(pair(vec4f(1.)),pair(vec4f(a)))).x);}`));
var innerShadow = k("inner-shadow", 2, 11, guardedSampler(10).replace("if(paramU32(0u)!=0u)", "if(true)") + `
fn pixel(p:vec2u)->vec4f{let x=add(pair(vec4f(f32(p.x)+paramF32(9u))),scalar(5u));let y=add(pair(vec4f(f32(p.y)+paramF32(9u))),scalar(7u));let soft=bilinearPair(x,y);let mask=Pair(vec4f(soft.hi.a),vec4f(soft.lo.a));let ink=vec4f(paramF32(2u),paramF32(3u),paramF32(4u),1.);
 // Original isolated layer: tint*soft -> F32 publication, then source Alpha
 // and opacity are applied by the isolated parent in that precise order.
 let tinted=rounded(multiply(pair(ink),mask));let coverage=multiply(scalar(0u),pair(vec4f(read1(vec2i(p)).a)));return rounded(multiply(pair(tinted),coverage));}`);
var coverage = { ...k("coverage-ink", 0, 9, guardedMath(8, head + `
fn pixel(p:vec2u)->vec4f{let index=2u*(p.y*outputSize().x+p.x);let a=constant(data0(index),data0(index+1u));let ink=Pair(vec4f(paramF32(0u),paramF32(2u),paramF32(4u),1.),vec4f(paramF32(1u),paramF32(3u),paramF32(5u),0.));return rounded(multiply(multiply(ink,scalar(6u)),a));}`)), abiVersion: 2, dataInputs: [{ type: "f32" }] };

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\native-time\reduction.ts
var end2 = displacement.code.indexOf("fn scalar(");
if (end2 < 0 || !displacement.code.startsWith("fn round32(")) throw new Error("Reviewed shared guarded arithmetic layout changed");
var math = displacement.code.slice(0, end2);
var modes = { "weighted-mean": 0, add: 0, blend: 0, maximum: 1, minimum: 2, screen: 3, "in-front": 4, "in-back": 5 };
var reduceKernel = { abiVersion: 1, id: "frameweave/pro-animation/time/reduce", version: "1.0.0", parameterWords: 9, workgroupSize: [8, 8, 1], bindings: [{ type: "f32", access: "read" }, { type: "f32", access: "read_write" }, { type: "f32", access: "read_write" }], code: math + `
fn compute(g:vec3u,l:vec3u,w:vec3u){
 let at=(g.y*paramU32(0u)+g.x)*4u;var raw=vec4f(0.);
 if(paramU32(7u)==0u){raw=vec4f(load0(at),load0(at+1u),load0(at+2u),load0(at+3u));}
 var value=pair(raw);if(paramU32(1u)==1u){let a=multiply(value,pair(vec4f(raw.a)));value=Pair(vec4f(a.hi.rgb,raw.a),vec4f(a.lo.rgb,0.));}
 let q=multiply(value,constant(paramF32(4u),paramF32(5u)));var a=pair(vec4f(0.));
 if(paramU32(3u)==0u){a=Pair(vec4f(load1(at),load1(at+1u),load1(at+2u),load1(at+3u)),vec4f(load2(at),load2(at+1u),load2(at+2u),load2(at+3u)));}
 let mode=paramU32(2u);var result=add(a,q);
 if(mode==1u||mode==2u){result=q;if(paramU32(3u)==0u){for(var c=0u;c<4u;c++){let larger=a.hi[c]>q.hi[c]||(a.hi[c]==q.hi[c]&&a.lo[c]>q.lo[c]);let takeA=select(!larger,larger,mode==1u);if(takeA){result.hi[c]=a.hi[c];result.lo[c]=a.lo[c];}}}}
 else if(mode==3u){result=subtract(add(a,q),multiply(a,q));}
 else if(mode==4u){let alpha=Pair(vec4f(a.hi.a),vec4f(a.lo.a));result=add(a,multiply(q,subtract(pair(vec4f(1.)),alpha)));}
 else if(mode==5u){let alpha=Pair(vec4f(q.hi.a),vec4f(q.lo.a));result=add(q,multiply(a,subtract(pair(vec4f(1.)),alpha)));}
 for(var c=0u;c<4u;c++){store1(at+c,result.hi[c]);store2(at+c,result.lo[c]);}
}` };
var publish = { abiVersion: 2, id: "frameweave/pro-animation/time/publish", version: "1.0.0", inputCount: 0, parameterWords: 9, dataInputs: [{ type: "f32" }, { type: "f32" }], code: math + `
fn pixel(p:vec2u)->vec4f{let at=(p.y*outputSize().x+p.x)*4u;let value=Pair(vec4f(data0(at),data0(at+1u),data0(at+2u),data0(at+3u)),vec4f(data1(at),data1(at+1u),data1(at+2u),data1(at+3u)));var out=vec4f(0.);if(paramU32(2u)==0u){out=rounded(divide(value,constant(paramF32(0u),paramF32(1u))));}return vec4f(out.rgb,clamp(out.a,0.,1.));}` };
var fail5 = (message) => {
  throw new EngineError12("E_PA_TIME_REDUCTION", message);
};
var split = (x) => {
  const hi = Math.fround(x), lo = Math.fround(x - hi);
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || x !== 0 && hi === 0 || hi !== 0 && Math.abs(hi) < 2 ** -126 || lo !== 0 && Math.abs(lo) < 2 ** -126) fail5("Temporal coefficient exceeds qualified normal F32-pair domain");
  return [hi, lo];
};
var check = (signal) => {
  if (signal?.aborted) throw new EngineError12("E_RENDER_CANCELLED", "Native temporal reduction cancelled");
};
var nativeTemporalPixels = { profile: "native-temporal-compensated-v1", async reduce(gpu, samples, options) {
  const { mode, output, signal, sampleCount, weights } = options;
  check(signal);
  if (gpu.capabilities().backend !== "native-wgpu" || !gpu.capabilities().hardwareVerified || !gpu.imageToBuffer) fail5("Native read-only resident image views are required");
  if (!Object.hasOwn(modes, mode) || !Number.isSafeInteger(sampleCount) || sampleCount < 1) fail5("Known operator and finite sample count required");
  const remaining = gpu.capabilities().maxPendingPasses - gpu.stats().pendingPasses;
  if (sampleCount + 1 > remaining) throw new EngineError12("E_PA_TIME_ADMISSION", "Finite temporal window exceeds the current owner command budget", { details: { minimumPasses: sampleCount + 1, remaining, sourcePassesAdditional: true } });
  let maximum = 0, n = 0;
  for (const weight of weights) {
    check(signal);
    if (!Number.isFinite(weight) || weight < 0) fail5("Weights must be finite and nonnegative");
    maximum = Math.max(maximum, weight);
    n++;
  }
  if (n !== sampleCount) fail5("Weight-plan count mismatch");
  const normalized = mode === "weighted-mean", power = normalized && maximum > 0 ? 2 ** Math.min(1023, Math.floor(Math.log2(maximum))) : 1;
  let denominator = 0, correction = 0, secondCount = 0;
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) fail5("Reusable weight plan changed");
    const v = normalized ? weight / power : 0, next = denominator + v;
    correction += Math.abs(denominator) >= Math.abs(v) ? denominator - next + v : v - next + denominator;
    denominator = next;
    secondCount++;
  }
  denominator += correction;
  if (secondCount !== sampleCount) fail5("Weight plan must be repeatable, not a consumed one-shot iterator");
  const secondScale = normalized && denominator > 0 ? 2 ** Math.ceil(Math.log2(denominator)) : 1;
  const divisor = normalized ? denominator / secondScale : mode === "blend" ? sampleCount : 1;
  const divisorPair = divisor === 0 ? [1, 0] : split(divisor);
  return withGpuResources(gpu, async (arena) => {
    const descriptor = { type: "f32", dimensions: [output.width, output.height, 1], components: 4, semantic: "generic" };
    const hi = arena.buffer(await gpu.createField({ ...descriptor, channels: ["r-hi", "g-hi", "b-hi", "a-hi"] })), lo = arena.buffer(await gpu.createField({ ...descriptor, channels: ["r-lo", "g-lo", "b-lo", "a-lo"] })), zero = arena.buffer(await gpu.createBuffer({ type: "f32", length: 4 }));
    const kernel2 = await gpu.compileCompute(reduceKernel);
    let index = 0;
    for await (const { image, weight } of samples) {
      check(signal);
      if (index >= sampleCount) fail5("More source samples than declared");
      if (!Number.isFinite(weight) || weight < 0) fail5("Nonnegative finite weight required");
      if ((mode === "in-front" || mode === "in-back") && weight > 1) fail5("Source-over weights must preserve coverage <= 1");
      if (image && (image.info.width !== output.width || image.info.height !== output.height || !samePixelColor(image.info.color, output.color) || !["rgba16float", "rgba32float"].includes(image.info.format))) fail5("Temporal image metadata mismatch");
      const coefficient = normalized ? weight / power / secondScale : weight, pair = split(coefficient);
      if (weight > 0 && coefficient === 0) fail5("Weight ratio underflow");
      const p2 = new Uint32Array(9), f = new Float32Array(p2.buffer);
      p2[0] = output.width;
      p2[1] = image?.info.alpha === "straight" ? 1 : 0;
      p2[2] = modes[mode];
      p2[3] = Number(index === 0);
      f.set(pair, 4);
      p2[7] = Number(image === null);
      const view = image ? await gpu.imageToBuffer(image, { version: 1, signal }) : zero;
      try {
        await gpu.dispatch(kernel2, [view, hi, lo], { workItems: [output.width, output.height, 1], parameters: p2, signal });
      } finally {
        if (image) await gpu.releaseBuffer(view);
      }
      index++;
    }
    if (index !== sampleCount) fail5("Source ended before declared sample count");
    check(signal);
    const p = new Float32Array(9);
    p.set(divisorPair);
    new Uint32Array(p.buffer)[2] = Number(divisor === 0);
    return gpu.run(await gpu.compile(publish), [], { data: [hi, lo], parameters: p, output: { ...output, alpha: "premultiplied" }, signal });
  });
} };

// frozen-temporal:C:\Users\ASUS\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\frameweave-worktrees\agent-1\modules\pro-animation\src\native-time\index.ts
var common = ["format", "signal", "range"];
var one = (context, time, weight = 1) => ({ count: 1, at(index) {
  if (index !== 0) timeFail("One sample only");
  return Object.freeze({ index: 0, time, weight, context: sourceTimeContext(context, time) });
}, *[Symbol.iterator]() {
  yield this.at(0);
} });
var cancelled = (signal) => {
  if (signal?.aborted) throw new EngineError13("E_RENDER_CANCELLED", "Native time sampling cancelled");
};
function createNativeTimeEffects(environment, pixels = nativeTemporalPixels) {
  const { gpu: g, width, height } = environment, cap = g?.capabilities();
  if (cap?.backend !== "native-wgpu" || cap.hardwareVerified !== true) throw new EngineError13("E_PA_TIME_DEVICE", "Native time effects require the admitted native GPU owner; no CPU/Web fallback");
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) timeFail("Positive Stage dimensions required");
  const color = environment.color ?? linear709, format = environment.format ?? "rgba32float";
  assertColor(color);
  if (color.transfer !== "linear" || color.reference !== "scene" || !["rgba16float", "rgba32float"].includes(format)) timeFail("Scene-linear F16/F32 output required");
  if (!pixels || pixels.profile !== "native-temporal-compensated-v1" || typeof pixels.reduce !== "function") throw new EngineError13("E_PA_TIME_KERNEL_REQUIRED", "Supply the reviewed shared native temporal pixel adapter; ordinary repeated F32 blends are not a sum fallback");
  const frozenColor = Object.freeze({ ...color });
  let busy = false, recordings = 0, sampledImages = 0, transparentSamples = 0, failed = 0;
  function validate(o, extra) {
    fields2(o, [...common, ...extra]);
    if (o.signal !== void 0 && !(o.signal instanceof AbortSignal)) timeFail("Expected AbortSignal");
    cancelled(o.signal);
    if (o.format !== void 0 && !["rgba16float", "rgba32float"].includes(o.format)) timeFail("Output remains F16/F32");
    if (o.range) {
      resolveTimeRange(o.range.start, o.range);
      resolveTimeRange(o.range.end, o.range);
    }
    return { width, height, color: frozenColor, format: o.format ?? format };
  }
  function validateImage(image) {
    const i = image?.info;
    if (!i || !["rgba16float", "rgba32float"].includes(i.format) || i.width !== width || i.height !== height || !samePixelColor(i.color, frozenColor)) timeFail("Source must transfer a same-size, same-encoding professional image; convert explicitly inside sourceAt");
  }
  async function run(action) {
    if (busy) throw new EngineError13("E_PA_TIME_BUSY", "Await the current Stage-local time operation");
    busy = true;
    try {
      const value = await action();
      recordings++;
      return value;
    } catch (error) {
      failed++;
      throw error;
    } finally {
      busy = false;
    }
  }
  async function reduce(source, plan2, o, output, mode = "weighted-mean") {
    if (typeof source !== "function") timeFail("Explicit sourceAt callback required");
    const seen = /* @__PURE__ */ new WeakSet();
    let consumed = 0;
    async function* samples() {
      for (const sample of plan2) {
        cancelled(o.signal);
        const time = resolveTimeRange(sample.time, o.range);
        if (time === null || sample.weight === 0) {
          transparentSamples++;
          consumed++;
          yield { image: null, weight: sample.weight };
          continue;
        }
        if (sample.weight < 0 || !Number.isFinite(sample.weight)) timeFail("Nonnegative finite temporal weight required");
        const request = Object.freeze({ ...sample, time, context: time === sample.time ? sample.context : sourceTimeContext(sample.context, time) });
        const image = await source(request);
        if (!image || seen.has(image)) timeFail("sourceAt must transfer a fresh image for every invocation");
        seen.add(image);
        try {
          validateImage(image);
          cancelled(o.signal);
          sampledImages++;
          consumed++;
          yield { image, weight: sample.weight };
        } finally {
          await g.release(image);
        }
      }
    }
    const stream = samples();
    let result;
    const weights = { *[Symbol.iterator]() {
      for (const sample of plan2) yield sample.weight;
    } };
    try {
      result = await pixels.reduce(g, stream, { mode, output, signal: o.signal, sampleCount: plan2.count, weights });
      cancelled(o.signal);
      if (consumed !== plan2.count) throw new EngineError13("E_PA_TIME_KERNEL_PROTOCOL", "Temporal adapter returned before consuming the complete finite sample plan");
      validateImage(result);
      if (result.info.alpha !== "premultiplied" || result.info.format !== output.format) timeFail("Temporal adapter must publish the requested PM output precision");
      return result;
    } catch (error) {
      if (result) await g.release(result);
      throw error;
    } finally {
      await stream.return(void 0);
    }
  }
  async function retime(source, o, context) {
    const out = validate(o, ["time", "fps", "origin", "method"]), method = o.method ?? "exact", time = scalar2(o.time ?? context.time, context, "time");
    if (!["exact", "hold", "nearest", "linear"].includes(method)) timeFail("Known retiming method required");
    const samples = method === "exact" ? one(context, time) : frameBlendSamples({ time, fps: o.fps, origin: o.origin, method }, context);
    if (method === "exact" && (o.fps !== void 0 || o.origin !== void 0)) timeFail("Source fps/origin belongs to discrete frame sampling");
    return reduce(source, samples, o, out);
  }
  const api = {
    retime: (source, o = {}, context) => run(() => retime(source, o, context)),
    frameBlend: (source, o, context) => run(() => {
      const out = validate(o, ["time", "fps", "origin", "method"]);
      const { format: _format, signal: _signal, range: _range, ...plan2 } = o;
      return reduce(source, frameBlendSamples(plan2, context), o, out);
    }),
    echo: (source, o, context) => run(() => {
      const out = validate(o, ["time", "echoes", "interval", "intensity", "decay", "mode"]), { format: _format, signal: _signal, range: _range, mode = "add", ...plan2 } = o;
      if (!["add", "blend", "maximum", "minimum", "screen", "in-front", "in-back"].includes(mode)) timeFail("Unknown echo operator");
      return reduce(source, echoSamples(plan2, context), o, out, mode);
    }),
    trails: (source, o, context) => run(() => {
      const out = validate(o, ["time", "duration", "count", "direction", "falloff", "decay", "mode"]), { format: _format, signal: _signal, range: _range, mode = "in-front", ...plan2 } = o;
      if (!["weighted-mean", "add", "blend", "maximum", "minimum", "screen", "in-front", "in-back"].includes(mode)) timeFail("Unknown trail operator");
      return reduce(source, trailSamples(plan2, context), o, out, mode);
    }),
    shutterBlur: (source, o, context) => run(() => {
      const out = validate(o, ["count", "angleDegrees", "phaseDegrees", "time", "sourceTime"]), { format: _format, signal: _signal, range: _range, sourceTime, ...shutter } = o, plan2 = shutterTimeSamples(shutter, context);
      const mapped = { count: plan2.count, at(i) {
        const s = plan2.at(i);
        if (sourceTime === void 0) return s;
        const time = scalar2(sourceTime, s.context, "shutter source time");
        return { ...s, time, context: sourceTimeContext(s.context, time) };
      }, *[Symbol.iterator]() {
        for (let i = 0; i < this.count; i++) yield this.at(i);
      } };
      return reduce(source, mapped, o, out);
    }),
    wideTime: (source, o, context) => run(() => {
      const out = validate(o, ["time", "before", "after", "count", "weight"]), { format: _format, signal: _signal, range: _range, ...plan2 } = o;
      return reduce(source, wideTimeSamples(plan2, context), o, out);
    }),
    posterize: (source, o, context) => run(() => {
      const out = validate(o, ["time", "rate", "origin"]), { format: _format, signal: _signal, range: _range, ...plan2 } = o;
      return reduce(source, one(context, posterizeTime(plan2, context)), o, out);
    }),
    strobe: (source, o, context) => run(() => {
      const out = validate(o, ["period", "onDuration", "origin", "off", "time"]), { format: _format, signal: _signal, range: _range, time, ...plan2 } = o, t = scalar2(time ?? context.time, context, "time"), held = strobeTime(t, plan2);
      return reduce(source, one(context, held ?? t, held === null ? 0 : 1), o, out);
    }),
    timeCrossfade: (from, to, o, context) => run(() => {
      const out = validate(o, ["progress", "fromTime", "toTime"]), p = scalar2(o.progress ?? context.progress, context, "progress");
      if (p < 0 || p > 1 || typeof from !== "function" || typeof to !== "function") timeFail("Two sources and progress in [0,1] required");
      const a = scalar2(o.fromTime ?? context.time, context, "from time"), b = scalar2(o.toTime ?? context.time, context, "to time");
      const plan2 = { count: 2, at(i) {
        if (i !== 0 && i !== 1) timeFail("Crossfade index out of range");
        return { ...one(context, i === 0 ? a : b, i === 0 ? 1 - p : p).at(0), index: i };
      }, *[Symbol.iterator]() {
        yield this.at(0);
        yield this.at(1);
      } };
      return reduce((s) => s.index === 0 ? from(s) : to(s), plan2, o, out);
    }),
    /** Existing PM blend difference/subtract, NOT AE's nine Alpha/SDR-clamped comparison modes. */
    timeDifference: (source, target, o, context) => run(async () => {
      const out = validate(o, ["offset", "targetTime", "opacity", "mode"]), mode = o.mode ?? "absolute";
      if (!["absolute", "subtract"].includes(mode) || o.offset !== void 0 && o.targetTime !== void 0) timeFail("Choose targetTime OR offset, and known difference mode");
      const opacity = scalar2(o.opacity ?? 1, context, "opacity");
      if (opacity < 0 || opacity > 1) timeFail("Opacity must be in [0,1]");
      const time = scalar2(o.targetTime ?? context.time + scalar2(o.offset ?? -context.dt, context, "offset"), context, "target time");
      return withGpuResources(g, async (arena) => {
        const base = arena.image(await reduce(source, one(context, context.time), { ...o, format: "rgba32float" }, { ...out, format: "rgba32float" })), other = arena.image(await reduce(target, one(context, time), { ...o, format: "rgba32float" }, { ...out, format: "rgba32float" }));
        cancelled(o.signal);
        const f = createBlendFilters(g, context, (image) => image, o.signal), result = mode === "absolute" ? await f.difference(other, base, { opacity, format: out.format, signal: o.signal }) : await f.subtractBlend(other, base, { opacity, format: out.format, signal: o.signal });
        if (o.signal?.aborted) {
          await g.release(result);
          cancelled(o.signal);
        }
        return result;
      });
    }),
    stats: () => ({ version: 1, backend: "native-wgpu", completion: "recorded-only", busy, recordings, failed, sampledImages, transparentSamples, historyImages: 0 })
  };
  return api;
}
export {
  createNativeTimeEffects,
  sourceTimeContext
};
