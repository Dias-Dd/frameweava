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
function seededRandom(seed2, frame = 0, salt = 0) {
  let x = hashString(`${seed2}|${frame}|${salt}`);
  x ^= x >>> 16;
  x = Math.imul(x, 2146121005);
  x ^= x >>> 15;
  x = Math.imul(x, 2221713035);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// modules/spatial-effects/src/checks.ts
function spatialError(code, message) {
  throw Object.assign(new Error(message), { code });
}
function finite(value, name, min = -Infinity, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max) spatialError("E_SPATIAL_PARAMETER", `${name} must be finite in [${min},${max}]`);
  return value;
}
function integer(value, name, min = 1) {
  finite(value, name, min);
  if (!Number.isSafeInteger(value)) spatialError("E_SPATIAL_PARAMETER", `${name} must be a safe integer`);
  return value;
}
function vector(value, name, min = -Infinity) {
  if (!Array.isArray(value) || value.length !== 3) spatialError("E_SPATIAL_PARAMETER", `${name} requires three coordinates`);
  return value.map((v) => finite(v, name, min));
}

// modules/spatial-effects/vendor/fastnoise-lite/FastNoiseLite.js
var FastNoiseLite = class _FastNoiseLite {
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{Cellular: string, OpenSimplex2: string, Value: string, ValueCubic: string, Perlin: string, OpenSimplex2S: string}>}
   */
  static NoiseType = Object.freeze({
    OpenSimplex2: "OpenSimplex2",
    OpenSimplex2S: "OpenSimplex2S",
    Cellular: "Cellular",
    Perlin: "Perlin",
    ValueCubic: "ValueCubic",
    Value: "Value"
  });
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{ImproveXYPlanes: string, ImproveXZPlanes: string, None: string}>}
   */
  static RotationType3D = Object.freeze({
    None: "None",
    ImproveXYPlanes: "ImproveXYPlanes",
    ImproveXZPlanes: "ImproveXZPlanes"
  });
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{FBm: string, DomainWarpIndependent: string, PingPong: string, None: string, Ridged: string, DomainWarpProgressive: string}>}
   */
  static FractalType = Object.freeze({
    None: "None",
    FBm: "FBm",
    Ridged: "Ridged",
    PingPong: "PingPong",
    DomainWarpProgressive: "DomainWarpProgressive",
    DomainWarpIndependent: "DomainWarpIndependent"
  });
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{EuclideanSq: string, Euclidean: string, Hybrid: string, Manhattan: string}>}
   */
  static CellularDistanceFunction = Object.freeze({
    Euclidean: "Euclidean",
    EuclideanSq: "EuclideanSq",
    Manhattan: "Manhattan",
    Hybrid: "Hybrid"
  });
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{Distance2Sub: string, Distance2Mul: string, Distance2Add: string, Distance2Div: string, CellValue: string, Distance: string, Distance2: string}>}
   */
  static CellularReturnType = Object.freeze({
    CellValue: "CellValue",
    Distance: "Distance",
    Distance2: "Distance2",
    Distance2Add: "Distance2Add",
    Distance2Sub: "Distance2Sub",
    Distance2Mul: "Distance2Mul",
    Distance2Div: "Distance2Div"
  });
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{BasicGrid: string, OpenSimplex2Reduced: string, OpenSimplex2: string}>}
   */
  static DomainWarpType = Object.freeze({
    OpenSimplex2: "OpenSimplex2",
    OpenSimplex2Reduced: "OpenSimplex2Reduced",
    BasicGrid: "BasicGrid"
  });
  /**
   * @static
   * @enum {string}
   * @type {Readonly<{ImproveXYPlanes: string, ImproveXZPlanes: string, None: string, DefaultOpenSimplex2: string}>}
   */
  static TransformType3D = Object.freeze({
    None: "None",
    ImproveXYPlanes: "ImproveXYPlanes",
    ImproveXZPlanes: "ImproveXZPlanes",
    DefaultOpenSimplex2: "DefaultOpenSimplex2"
  });
  /* Private */
  _Seed = 1337;
  _Frequency = 0.01;
  _NoiseType = _FastNoiseLite.NoiseType.OpenSimplex2;
  _RotationType3D = _FastNoiseLite.RotationType3D.None;
  _TransformType3D = _FastNoiseLite.TransformType3D.DefaultOpenSimplex2;
  _DomainWarpAmp = 1;
  _FractalType = _FastNoiseLite.FractalType.None;
  _Octaves = 3;
  _Lacunarity = 2;
  _Gain = 0.5;
  _WeightedStrength = 0;
  _PingPongStrength = 2;
  _FractalBounding = 1 / 1.75;
  _CellularDistanceFunction = _FastNoiseLite.CellularDistanceFunction.EuclideanSq;
  _CellularReturnType = _FastNoiseLite.CellularReturnType.Distance;
  _CellularJitterModifier = 1;
  _DomainWarpType = _FastNoiseLite.DomainWarpType.OpenSimplex2;
  _WarpTransformType3D = _FastNoiseLite.TransformType3D.DefaultOpenSimplex2;
  /**
   * @description Create new FastNoiseLite object with optional seed
   * @param {number} [seed]
   * @constructor
   */
  constructor(seed2) {
    if (seed2 !== void 0) {
      this._Seed = seed2;
    }
  }
  /**
   * @description Sets seed used for all noise types
   * @remarks Default: 1337
   * @default 1337
   * @param {number} seed
   */
  SetSeed(seed2) {
    this._Seed = seed2;
  }
  /**
   * @description Sets frequency for all noise types
   * @remarks Default: 0.01
   * @default 0.01
   * @param {number} frequency
   */
  SetFrequency(frequency) {
    this._Frequency = frequency;
  }
  /**
   * @description Sets noise algorithm used for GetNoise(...)
   * @remarks Default: OpenSimplex2
   * @default FastNoiseLite.NoiseType.OpenSimplex2
   * @param {FastNoiseLite.NoiseType} noiseType
   */
  SetNoiseType(noiseType) {
    this._NoiseType = noiseType;
    this._UpdateTransformType3D();
  }
  /**
   * @description Sets domain rotation type for 3D Noise and 3D DomainWarp.
   * @description Can aid in reducing directional artifacts when sampling a 2D plane in 3D
   * @remarks Default: None
   * @default FastNoiseLite.RotationType3D.None
   * @param {FastNoiseLite.RotationType3D} rotationType3D
   */
  SetRotationType3D(rotationType3D) {
    this._RotationType3D = rotationType3D;
    this._UpdateTransformType3D();
    this._UpdateWarpTransformType3D();
  }
  /**
   * @description Sets method for combining octaves in all fractal noise types
   * @remarks Default: None
   * @default FastNoiseLite.FractalType.None
   * @param {FastNoiseLite.FractalType} fractalType
   */
  SetFractalType(fractalType) {
    this._FractalType = fractalType;
  }
  /**
   * @description Sets octave count for all fractal noise types
   * @remarks Default: 3
   * @default 3
   * @param {number} octaves
   */
  SetFractalOctaves(octaves) {
    this._Octaves = octaves;
    this._CalculateFractalBounding();
  }
  /**
   * @description Sets octave lacunarity for all fractal noise types
   * @remarks Default: 2.0
   * @default 2.0
   * @param {number} lacunarity
   */
  SetFractalLacunarity(lacunarity) {
    this._Lacunarity = lacunarity;
  }
  /**
   * @description Sets octave gain for all fractal noise types
   * @remarks Default: 0.5
   * @default 0.5
   * @param {number} gain
   */
  SetFractalGain(gain) {
    this._Gain = gain;
    this._CalculateFractalBounding();
  }
  /**
   * @description Sets octave weighting for all none DomainWarp fratal types
   * @remarks Default: 0.0 | Keep between 0...1 to maintain -1...1 output bounding
   * @default 0.5
   * @param {number} weightedStrength
   */
  SetFractalWeightedStrength(weightedStrength) {
    this._WeightedStrength = weightedStrength;
  }
  /**
   * @description Sets strength of the fractal ping pong effect
   * @remarks Default: 2.0
   * @default 2.0
   * @param {number} pingPongStrength
   */
  SetFractalPingPongStrength(pingPongStrength) {
    this._PingPongStrength = pingPongStrength;
  }
  /**
   * @description Sets distance function used in cellular noise calculations
   * @remarks Default: EuclideanSq
   * @default FastNoiseLite.CellularDistanceFunction.EuclideanSq
   * @param {FastNoiseLite.CellularDistanceFunction} cellularDistanceFunction
   */
  SetCellularDistanceFunction(cellularDistanceFunction) {
    this._CellularDistanceFunction = cellularDistanceFunction;
  }
  /**
   * @description Sets return type from cellular noise calculations
   * @remarks Default: Distance
   * @default FastNoiseLite.CellularReturnType.Distance
   * @param {FastNoiseLite.CellularReturnType} cellularReturnType
   */
  SetCellularReturnType(cellularReturnType) {
    this._CellularReturnType = cellularReturnType;
  }
  /**
   * @description Sets the maximum distance a cellular point can move from it's grid position
   * @remarks Default: 1.0
   * @default 1.0
   * @param {number} cellularJitter
   */
  SetCellularJitter(cellularJitter) {
    this._CellularJitterModifier = cellularJitter;
  }
  /**
   * @description Sets the warp algorithm when using DomainWarp(...)
   * @remarks Default: OpenSimplex2
   * @default FastNoiseLite.DomainWarpType.OpenSimplex2
   * @param {FastNoiseLite.DomainWarpType} domainWarpType
   */
  SetDomainWarpType(domainWarpType) {
    this._DomainWarpType = domainWarpType;
    this._UpdateWarpTransformType3D();
  }
  /**
   * @description Sets the maximum warp distance from original position when using DomainWarp(...)
   * @remarks Default: 1.0
   * @default 1.0
   * @param {number} domainWarpAmp
   */
  SetDomainWarpAmp(domainWarpAmp) {
    this._DomainWarpAmp = domainWarpAmp;
  }
  /**
   * @description 2D/3D noise at given position using current settings
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @param {number} [z] Z coordinate
   * @return {number} Noise output bounded between -1...1
   */
  GetNoise(x, y, z) {
    let R2 = (x2, y2) => {
      x2 *= this._Frequency;
      y2 *= this._Frequency;
      switch (this._NoiseType) {
        case _FastNoiseLite.NoiseType.OpenSimplex2:
        case _FastNoiseLite.NoiseType.OpenSimplex2S:
          const SQRT3 = 1.7320508075688772;
          const F2 = 0.5 * (SQRT3 - 1);
          let t = (x2 + y2) * F2;
          x2 += t;
          y2 += t;
          break;
        default:
          break;
      }
      switch (this._FractalType) {
        default:
          return this._GenNoiseSingleR2(this._Seed, x2, y2);
        case _FastNoiseLite.FractalType.FBm:
          return this._GenFractalFBmR2(x2, y2);
        case _FastNoiseLite.FractalType.Ridged:
          return this._GenFractalRidgedR2(x2, y2);
        case _FastNoiseLite.FractalType.PingPong:
          return this._GenFractalPingPongR2(x2, y2);
      }
    };
    let R3 = (x2, y2, z2) => {
      x2 *= this._Frequency;
      y2 *= this._Frequency;
      z2 *= this._Frequency;
      switch (this._TransformType3D) {
        case _FastNoiseLite.TransformType3D.ImproveXYPlanes: {
          let xy = x2 + y2;
          let s2 = xy * -0.211324865405187;
          z2 *= 0.577350269189626;
          x2 += s2 - z2;
          y2 += s2 - z2;
          z2 += xy * 0.577350269189626;
          break;
        }
        case _FastNoiseLite.TransformType3D.ImproveXZPlanes: {
          let xz = x2 + z2;
          let s2 = xz * -0.211324865405187;
          y2 *= 0.577350269189626;
          x2 += s2 - y2;
          z2 += s2 - y2;
          y2 += xz * 0.577350269189626;
          break;
        }
        case _FastNoiseLite.TransformType3D.DefaultOpenSimplex2:
          const R32 = 2 / 3;
          let r = (x2 + y2 + z2) * R32;
          x2 = r - x2;
          y2 = r - y2;
          z2 = r - z2;
          break;
        default:
          break;
      }
      switch (this._FractalType) {
        default:
          return this._GenNoiseSingleR3(this._Seed, x2, y2, z2);
        case _FastNoiseLite.FractalType.FBm:
          return this._GenFractalFBmR3(x2, y2, z2);
        case _FastNoiseLite.FractalType.Ridged:
          return this._GenFractalRidgedR3(x2, y2, z2);
        case _FastNoiseLite.FractalType.PingPong:
          return this._GenFractalPingPongR3(x2, y2, z2);
      }
    };
    if (arguments.length === 2) {
      return R2(x, y);
    }
    if (arguments.length === 3) {
      return R3(x, y, z);
    }
  }
  /**
   * @description 2D/3D warps the input position using current domain warp settings
   * @param {Vector2|Vector3} coord
   */
  DomainWrap(coord) {
    switch (this._FractalType) {
      default:
        this._DomainWarpSingle(coord);
        break;
      case _FastNoiseLite.FractalType.DomainWarpProgressive:
        this._DomainWarpFractalProgressive(coord);
        break;
      case _FastNoiseLite.FractalType.DomainWarpIndependent:
        this._DomainWarpFractalIndependent(coord);
        break;
    }
  }
  // prettier-ignore
  _Gradients2D = [
    0.130526192220052,
    0.99144486137381,
    0.38268343236509,
    0.923879532511287,
    0.608761429008721,
    0.793353340291235,
    0.793353340291235,
    0.608761429008721,
    0.923879532511287,
    0.38268343236509,
    0.99144486137381,
    0.130526192220051,
    0.99144486137381,
    -0.130526192220051,
    0.923879532511287,
    -0.38268343236509,
    0.793353340291235,
    -0.60876142900872,
    0.608761429008721,
    -0.793353340291235,
    0.38268343236509,
    -0.923879532511287,
    0.130526192220052,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    -0.38268343236509,
    -0.923879532511287,
    -0.608761429008721,
    -0.793353340291235,
    -0.793353340291235,
    -0.608761429008721,
    -0.923879532511287,
    -0.38268343236509,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    0.130526192220051,
    -0.923879532511287,
    0.38268343236509,
    -0.793353340291235,
    0.608761429008721,
    -0.608761429008721,
    0.793353340291235,
    -0.38268343236509,
    0.923879532511287,
    -0.130526192220052,
    0.99144486137381,
    0.130526192220052,
    0.99144486137381,
    0.38268343236509,
    0.923879532511287,
    0.608761429008721,
    0.793353340291235,
    0.793353340291235,
    0.608761429008721,
    0.923879532511287,
    0.38268343236509,
    0.99144486137381,
    0.130526192220051,
    0.99144486137381,
    -0.130526192220051,
    0.923879532511287,
    -0.38268343236509,
    0.793353340291235,
    -0.60876142900872,
    0.608761429008721,
    -0.793353340291235,
    0.38268343236509,
    -0.923879532511287,
    0.130526192220052,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    -0.38268343236509,
    -0.923879532511287,
    -0.608761429008721,
    -0.793353340291235,
    -0.793353340291235,
    -0.608761429008721,
    -0.923879532511287,
    -0.38268343236509,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    0.130526192220051,
    -0.923879532511287,
    0.38268343236509,
    -0.793353340291235,
    0.608761429008721,
    -0.608761429008721,
    0.793353340291235,
    -0.38268343236509,
    0.923879532511287,
    -0.130526192220052,
    0.99144486137381,
    0.130526192220052,
    0.99144486137381,
    0.38268343236509,
    0.923879532511287,
    0.608761429008721,
    0.793353340291235,
    0.793353340291235,
    0.608761429008721,
    0.923879532511287,
    0.38268343236509,
    0.99144486137381,
    0.130526192220051,
    0.99144486137381,
    -0.130526192220051,
    0.923879532511287,
    -0.38268343236509,
    0.793353340291235,
    -0.60876142900872,
    0.608761429008721,
    -0.793353340291235,
    0.38268343236509,
    -0.923879532511287,
    0.130526192220052,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    -0.38268343236509,
    -0.923879532511287,
    -0.608761429008721,
    -0.793353340291235,
    -0.793353340291235,
    -0.608761429008721,
    -0.923879532511287,
    -0.38268343236509,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    0.130526192220051,
    -0.923879532511287,
    0.38268343236509,
    -0.793353340291235,
    0.608761429008721,
    -0.608761429008721,
    0.793353340291235,
    -0.38268343236509,
    0.923879532511287,
    -0.130526192220052,
    0.99144486137381,
    0.130526192220052,
    0.99144486137381,
    0.38268343236509,
    0.923879532511287,
    0.608761429008721,
    0.793353340291235,
    0.793353340291235,
    0.608761429008721,
    0.923879532511287,
    0.38268343236509,
    0.99144486137381,
    0.130526192220051,
    0.99144486137381,
    -0.130526192220051,
    0.923879532511287,
    -0.38268343236509,
    0.793353340291235,
    -0.60876142900872,
    0.608761429008721,
    -0.793353340291235,
    0.38268343236509,
    -0.923879532511287,
    0.130526192220052,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    -0.38268343236509,
    -0.923879532511287,
    -0.608761429008721,
    -0.793353340291235,
    -0.793353340291235,
    -0.608761429008721,
    -0.923879532511287,
    -0.38268343236509,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    0.130526192220051,
    -0.923879532511287,
    0.38268343236509,
    -0.793353340291235,
    0.608761429008721,
    -0.608761429008721,
    0.793353340291235,
    -0.38268343236509,
    0.923879532511287,
    -0.130526192220052,
    0.99144486137381,
    0.130526192220052,
    0.99144486137381,
    0.38268343236509,
    0.923879532511287,
    0.608761429008721,
    0.793353340291235,
    0.793353340291235,
    0.608761429008721,
    0.923879532511287,
    0.38268343236509,
    0.99144486137381,
    0.130526192220051,
    0.99144486137381,
    -0.130526192220051,
    0.923879532511287,
    -0.38268343236509,
    0.793353340291235,
    -0.60876142900872,
    0.608761429008721,
    -0.793353340291235,
    0.38268343236509,
    -0.923879532511287,
    0.130526192220052,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    -0.38268343236509,
    -0.923879532511287,
    -0.608761429008721,
    -0.793353340291235,
    -0.793353340291235,
    -0.608761429008721,
    -0.923879532511287,
    -0.38268343236509,
    -0.99144486137381,
    -0.130526192220052,
    -0.99144486137381,
    0.130526192220051,
    -0.923879532511287,
    0.38268343236509,
    -0.793353340291235,
    0.608761429008721,
    -0.608761429008721,
    0.793353340291235,
    -0.38268343236509,
    0.923879532511287,
    -0.130526192220052,
    0.99144486137381,
    0.38268343236509,
    0.923879532511287,
    0.923879532511287,
    0.38268343236509,
    0.923879532511287,
    -0.38268343236509,
    0.38268343236509,
    -0.923879532511287,
    -0.38268343236509,
    -0.923879532511287,
    -0.923879532511287,
    -0.38268343236509,
    -0.923879532511287,
    0.38268343236509,
    -0.38268343236509,
    0.923879532511287
  ];
  // prettier-ignore
  _RandVecs2D = [
    -0.2700222198,
    -0.9628540911,
    0.3863092627,
    -0.9223693152,
    0.04444859006,
    -0.999011673,
    -0.5992523158,
    -0.8005602176,
    -0.7819280288,
    0.6233687174,
    0.9464672271,
    0.3227999196,
    -0.6514146797,
    -0.7587218957,
    0.9378472289,
    0.347048376,
    -0.8497875957,
    -0.5271252623,
    -0.879042592,
    0.4767432447,
    -0.892300288,
    -0.4514423508,
    -0.379844434,
    -0.9250503802,
    -0.9951650832,
    0.0982163789,
    0.7724397808,
    -0.6350880136,
    0.7573283322,
    -0.6530343002,
    -0.9928004525,
    -0.119780055,
    -0.0532665713,
    0.9985803285,
    0.9754253726,
    -0.2203300762,
    -0.7665018163,
    0.6422421394,
    0.991636706,
    0.1290606184,
    -0.994696838,
    0.1028503788,
    -0.5379205513,
    -0.84299554,
    0.5022815471,
    -0.8647041387,
    0.4559821461,
    -0.8899889226,
    -0.8659131224,
    -0.5001944266,
    0.0879458407,
    -0.9961252577,
    -0.5051684983,
    0.8630207346,
    0.7753185226,
    -0.6315704146,
    -0.6921944612,
    0.7217110418,
    -0.5191659449,
    -0.8546734591,
    0.8978622882,
    -0.4402764035,
    -0.1706774107,
    0.9853269617,
    -0.9353430106,
    -0.3537420705,
    -0.9992404798,
    0.03896746794,
    -0.2882064021,
    -0.9575683108,
    -0.9663811329,
    0.2571137995,
    -0.8759714238,
    -0.4823630009,
    -0.8303123018,
    -0.5572983775,
    0.05110133755,
    -0.9986934731,
    -0.8558373281,
    -0.5172450752,
    0.09887025282,
    0.9951003332,
    0.9189016087,
    0.3944867976,
    -0.2439375892,
    -0.9697909324,
    -0.8121409387,
    -0.5834613061,
    -0.9910431363,
    0.1335421355,
    0.8492423985,
    -0.5280031709,
    -0.9717838994,
    -0.2358729591,
    0.9949457207,
    0.1004142068,
    0.6241065508,
    -0.7813392434,
    0.662910307,
    0.7486988212,
    -0.7197418176,
    0.6942418282,
    -0.8143370775,
    -0.5803922158,
    0.104521054,
    -0.9945226741,
    -0.1065926113,
    -0.9943027784,
    0.445799684,
    -0.8951327509,
    0.105547406,
    0.9944142724,
    -0.992790267,
    0.1198644477,
    -0.8334366408,
    0.552615025,
    0.9115561563,
    -0.4111755999,
    0.8285544909,
    -0.5599084351,
    0.7217097654,
    -0.6921957921,
    0.4940492677,
    -0.8694339084,
    -0.3652321272,
    -0.9309164803,
    -0.9696606758,
    0.2444548501,
    0.08925509731,
    -0.996008799,
    0.5354071276,
    -0.8445941083,
    -0.1053576186,
    0.9944343981,
    -0.9890284586,
    0.1477251101,
    0.004856104961,
    0.9999882091,
    0.9885598478,
    0.1508291331,
    0.9286129562,
    -0.3710498316,
    -0.5832393863,
    -0.8123003252,
    0.3015207509,
    0.9534596146,
    -0.9575110528,
    0.2883965738,
    0.9715802154,
    -0.2367105511,
    0.229981792,
    0.9731949318,
    0.955763816,
    -0.2941352207,
    0.740956116,
    0.6715534485,
    -0.9971513787,
    -0.07542630764,
    0.6905710663,
    -0.7232645452,
    -0.290713703,
    -0.9568100872,
    0.5912777791,
    -0.8064679708,
    -0.9454592212,
    -0.325740481,
    0.6664455681,
    0.74555369,
    0.6236134912,
    0.7817328275,
    0.9126993851,
    -0.4086316587,
    -0.8191762011,
    0.5735419353,
    -0.8812745759,
    -0.4726046147,
    0.9953313627,
    0.09651672651,
    0.9855650846,
    -0.1692969699,
    -0.8495980887,
    0.5274306472,
    0.6174853946,
    -0.7865823463,
    0.8508156371,
    0.52546432,
    0.9985032451,
    -0.05469249926,
    0.1971371563,
    -0.9803759185,
    0.6607855748,
    -0.7505747292,
    -0.03097494063,
    0.9995201614,
    -0.6731660801,
    0.739491331,
    -0.7195018362,
    -0.6944905383,
    0.9727511689,
    0.2318515979,
    0.9997059088,
    -0.0242506907,
    0.4421787429,
    -0.8969269532,
    0.9981350961,
    -0.061043673,
    -0.9173660799,
    -0.3980445648,
    -0.8150056635,
    -0.5794529907,
    -0.8789331304,
    0.4769450202,
    0.0158605829,
    0.999874213,
    -0.8095464474,
    0.5870558317,
    -0.9165898907,
    -0.3998286786,
    -0.8023542565,
    0.5968480938,
    -0.5176737917,
    0.8555780767,
    -0.8154407307,
    -0.5788405779,
    0.4022010347,
    -0.9155513791,
    -0.9052556868,
    -0.4248672045,
    0.7317445619,
    0.6815789728,
    -0.5647632201,
    -0.8252529947,
    -0.8403276335,
    -0.5420788397,
    -0.9314281527,
    0.363925262,
    0.5238198472,
    0.8518290719,
    0.7432803869,
    -0.6689800195,
    -0.985371561,
    -0.1704197369,
    0.4601468731,
    0.88784281,
    0.825855404,
    0.5638819483,
    0.6182366099,
    0.7859920446,
    0.8331502863,
    -0.553046653,
    0.1500307506,
    0.9886813308,
    -0.662330369,
    -0.7492119075,
    -0.668598664,
    0.743623444,
    0.7025606278,
    0.7116238924,
    -0.5419389763,
    -0.8404178401,
    -0.3388616456,
    0.9408362159,
    0.8331530315,
    0.5530425174,
    -0.2989720662,
    -0.9542618632,
    0.2638522993,
    0.9645630949,
    0.124108739,
    -0.9922686234,
    -0.7282649308,
    -0.6852956957,
    0.6962500149,
    0.7177993569,
    -0.9183535368,
    0.3957610156,
    -0.6326102274,
    -0.7744703352,
    -0.9331891859,
    -0.359385508,
    -0.1153779357,
    -0.9933216659,
    0.9514974788,
    -0.3076565421,
    -0.08987977445,
    -0.9959526224,
    0.6678496916,
    0.7442961705,
    0.7952400393,
    -0.6062947138,
    -0.6462007402,
    -0.7631674805,
    -0.2733598753,
    0.9619118351,
    0.9669590226,
    -0.254931851,
    -0.9792894595,
    0.2024651934,
    -0.5369502995,
    -0.8436138784,
    -0.270036471,
    -0.9628500944,
    -0.6400277131,
    0.7683518247,
    -0.7854537493,
    -0.6189203566,
    0.06005905383,
    -0.9981948257,
    -0.02455770378,
    0.9996984141,
    -0.65983623,
    0.751409442,
    -0.6253894466,
    -0.7803127835,
    -0.6210408851,
    -0.7837781695,
    0.8348888491,
    0.5504185768,
    -0.1592275245,
    0.9872419133,
    0.8367622488,
    0.5475663786,
    -0.8675753916,
    -0.4973056806,
    -0.2022662628,
    -0.9793305667,
    0.9399189937,
    0.3413975472,
    0.9877404807,
    -0.1561049093,
    -0.9034455656,
    0.4287028224,
    0.1269804218,
    -0.9919052235,
    -0.3819600854,
    0.924178821,
    0.9754625894,
    0.2201652486,
    -0.3204015856,
    -0.9472818081,
    -0.9874760884,
    0.1577687387,
    0.02535348474,
    -0.9996785487,
    0.4835130794,
    -0.8753371362,
    -0.2850799925,
    -0.9585037287,
    -0.06805516006,
    -0.99768156,
    -0.7885244045,
    -0.6150034663,
    0.3185392127,
    -0.9479096845,
    0.8880043089,
    0.4598351306,
    0.6476921488,
    -0.7619021462,
    0.9820241299,
    0.1887554194,
    0.9357275128,
    -0.3527237187,
    -0.8894895414,
    0.4569555293,
    0.7922791302,
    0.6101588153,
    0.7483818261,
    0.6632681526,
    -0.7288929755,
    -0.6846276581,
    0.8729032783,
    -0.4878932944,
    0.8288345784,
    0.5594937369,
    0.08074567077,
    0.9967347374,
    0.9799148216,
    -0.1994165048,
    -0.580730673,
    -0.8140957471,
    -0.4700049791,
    -0.8826637636,
    0.2409492979,
    0.9705377045,
    0.9437816757,
    -0.3305694308,
    -0.8927998638,
    -0.4504535528,
    -0.8069622304,
    0.5906030467,
    0.06258973166,
    0.9980393407,
    -0.9312597469,
    0.3643559849,
    0.5777449785,
    0.8162173362,
    -0.3360095855,
    -0.941858566,
    0.697932075,
    -0.7161639607,
    -0.002008157227,
    -0.9999979837,
    -0.1827294312,
    -0.9831632392,
    -0.6523911722,
    0.7578824173,
    -0.4302626911,
    -0.9027037258,
    -0.9985126289,
    -0.05452091251,
    -0.01028102172,
    -0.9999471489,
    -0.4946071129,
    0.8691166802,
    -0.2999350194,
    0.9539596344,
    0.8165471961,
    0.5772786819,
    0.2697460475,
    0.962931498,
    -0.7306287391,
    -0.6827749597,
    -0.7590952064,
    -0.6509796216,
    -0.907053853,
    0.4210146171,
    -0.5104861064,
    -0.8598860013,
    0.8613350597,
    0.5080373165,
    0.5007881595,
    -0.8655698812,
    -0.654158152,
    0.7563577938,
    -0.8382755311,
    -0.545246856,
    0.6940070834,
    0.7199681717,
    0.06950936031,
    0.9975812994,
    0.1702942185,
    -0.9853932612,
    0.2695973274,
    0.9629731466,
    0.5519612192,
    -0.8338697815,
    0.225657487,
    -0.9742067022,
    0.4215262855,
    -0.9068161835,
    0.4881873305,
    -0.8727388672,
    -0.3683854996,
    -0.9296731273,
    -0.9825390578,
    0.1860564427,
    0.81256471,
    0.5828709909,
    0.3196460933,
    -0.9475370046,
    0.9570913859,
    0.2897862643,
    -0.6876655497,
    -0.7260276109,
    -0.9988770922,
    -0.047376731,
    -0.1250179027,
    0.992154486,
    -0.8280133617,
    0.560708367,
    0.9324863769,
    -0.3612051451,
    0.6394653183,
    0.7688199442,
    -0.01623847064,
    -0.9998681473,
    -0.9955014666,
    -0.09474613458,
    -0.81453315,
    0.580117012,
    0.4037327978,
    -0.9148769469,
    0.9944263371,
    0.1054336766,
    -0.1624711654,
    0.9867132919,
    -0.9949487814,
    -0.100383875,
    -0.6995302564,
    0.7146029809,
    0.5263414922,
    -0.85027327,
    -0.5395221479,
    0.841971408,
    0.6579370318,
    0.7530729462,
    0.01426758847,
    -0.9998982128,
    -0.6734383991,
    0.7392433447,
    0.639412098,
    -0.7688642071,
    0.9211571421,
    0.3891908523,
    -0.146637214,
    -0.9891903394,
    -0.782318098,
    0.6228791163,
    -0.5039610839,
    -0.8637263605,
    -0.7743120191,
    -0.6328039957
  ];
  // prettier-ignore
  _Gradients3D = [
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    -1,
    0,
    -1,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    -1,
    0,
    -1,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    -1,
    0,
    -1,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    -1,
    0,
    -1,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    1,
    0,
    1,
    0,
    -1,
    0,
    -1,
    0,
    -1,
    0,
    1,
    1,
    0,
    0,
    -1,
    1,
    0,
    0,
    1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    -1,
    1,
    0,
    -1,
    1,
    0,
    0,
    0,
    -1,
    -1,
    0
  ];
  // prettier-ignore
  _RandVecs3D = [
    -0.7292736885,
    -0.6618439697,
    0.1735581948,
    0,
    0.790292081,
    -0.5480887466,
    -0.2739291014,
    0,
    0.7217578935,
    0.6226212466,
    -0.3023380997,
    0,
    0.565683137,
    -0.8208298145,
    -0.0790000257,
    0,
    0.760049034,
    -0.5555979497,
    -0.3370999617,
    0,
    0.3713945616,
    0.5011264475,
    0.7816254623,
    0,
    -0.1277062463,
    -0.4254438999,
    -0.8959289049,
    0,
    -0.2881560924,
    -0.5815838982,
    0.7607405838,
    0,
    0.5849561111,
    -0.662820239,
    -0.4674352136,
    0,
    0.3307171178,
    0.0391653737,
    0.94291689,
    0,
    0.8712121778,
    -0.4113374369,
    -0.2679381538,
    0,
    0.580981015,
    0.7021915846,
    0.4115677815,
    0,
    0.503756873,
    0.6330056931,
    -0.5878203852,
    0,
    0.4493712205,
    0.601390195,
    0.6606022552,
    0,
    -0.6878403724,
    0.09018890807,
    -0.7202371714,
    0,
    -0.5958956522,
    -0.6469350577,
    0.475797649,
    0,
    -0.5127052122,
    0.1946921978,
    -0.8361987284,
    0,
    -0.9911507142,
    -0.05410276466,
    -0.1212153153,
    0,
    -0.2149721042,
    0.9720882117,
    -0.09397607749,
    0,
    -0.7518650936,
    -0.5428057603,
    0.3742469607,
    0,
    0.5237068895,
    0.8516377189,
    -0.02107817834,
    0,
    0.6333504779,
    0.1926167129,
    -0.7495104896,
    0,
    -0.06788241606,
    0.3998305789,
    0.9140719259,
    0,
    -0.5538628599,
    -0.4729896695,
    -0.6852128902,
    0,
    -0.7261455366,
    -0.5911990757,
    0.3509933228,
    0,
    -0.9229274737,
    -0.1782808786,
    0.3412049336,
    0,
    -0.6968815002,
    0.6511274338,
    0.3006480328,
    0,
    0.9608044783,
    -0.2098363234,
    -0.1811724921,
    0,
    0.06817146062,
    -0.9743405129,
    0.2145069156,
    0,
    -0.3577285196,
    -0.6697087264,
    -0.6507845481,
    0,
    -0.1868621131,
    0.7648617052,
    -0.6164974636,
    0,
    -0.6541697588,
    0.3967914832,
    0.6439087246,
    0,
    0.6993340405,
    -0.6164538506,
    0.3618239211,
    0,
    -0.1546665739,
    0.6291283928,
    0.7617583057,
    0,
    -0.6841612949,
    -0.2580482182,
    -0.6821542638,
    0,
    0.5383980957,
    0.4258654885,
    0.7271630328,
    0,
    -0.5026987823,
    -0.7939832935,
    -0.3418836993,
    0,
    0.3202971715,
    0.2834415347,
    0.9039195862,
    0,
    0.8683227101,
    -3762656404e-13,
    -0.4959995258,
    0,
    0.791120031,
    -0.08511045745,
    0.6057105799,
    0,
    -0.04011016052,
    -0.4397248749,
    0.8972364289,
    0,
    0.9145119872,
    0.3579346169,
    -0.1885487608,
    0,
    -0.9612039066,
    -0.2756484276,
    0.01024666929,
    0,
    0.6510361721,
    -0.2877799159,
    -0.7023778346,
    0,
    -0.2041786351,
    0.7365237271,
    0.644859585,
    0,
    -0.7718263711,
    0.3790626912,
    0.5104855816,
    0,
    -0.3060082741,
    -0.7692987727,
    0.5608371729,
    0,
    0.454007341,
    -0.5024843065,
    0.7357899537,
    0,
    0.4816795475,
    0.6021208291,
    -0.6367380315,
    0,
    0.6961980369,
    -0.3222197429,
    0.641469197,
    0,
    -0.6532160499,
    -0.6781148932,
    0.3368515753,
    0,
    0.5089301236,
    -0.6154662304,
    -0.6018234363,
    0,
    -0.1635919754,
    -0.9133604627,
    -0.372840892,
    0,
    0.52408019,
    -0.8437664109,
    0.1157505864,
    0,
    0.5902587356,
    0.4983817807,
    -0.6349883666,
    0,
    0.5863227872,
    0.494764745,
    0.6414307729,
    0,
    0.6779335087,
    0.2341345225,
    0.6968408593,
    0,
    0.7177054546,
    -0.6858979348,
    0.120178631,
    0,
    -0.5328819713,
    -0.5205125012,
    0.6671608058,
    0,
    -0.8654874251,
    -0.0700727088,
    -0.4960053754,
    0,
    -0.2861810166,
    0.7952089234,
    0.5345495242,
    0,
    -0.04849529634,
    0.9810836427,
    -0.1874115585,
    0,
    -0.6358521667,
    0.6058348682,
    0.4781800233,
    0,
    0.6254794696,
    -0.2861619734,
    0.7258696564,
    0,
    -0.2585259868,
    0.5061949264,
    -0.8227581726,
    0,
    0.02136306781,
    0.5064016808,
    -0.8620330371,
    0,
    0.200111773,
    0.8599263484,
    0.4695550591,
    0,
    0.4743561372,
    0.6014985084,
    -0.6427953014,
    0,
    0.6622993731,
    -0.5202474575,
    -0.5391679918,
    0,
    0.08084972818,
    -0.6532720452,
    0.7527940996,
    0,
    -0.6893687501,
    0.0592860349,
    0.7219805347,
    0,
    -0.1121887082,
    -0.9673185067,
    0.2273952515,
    0,
    0.7344116094,
    0.5979668656,
    -0.3210532909,
    0,
    0.5789393465,
    -0.2488849713,
    0.7764570201,
    0,
    0.6988182827,
    0.3557169806,
    -0.6205791146,
    0,
    -0.8636845529,
    -0.2748771249,
    -0.4224826141,
    0,
    -0.4247027957,
    -0.4640880967,
    0.777335046,
    0,
    0.5257722489,
    -0.8427017621,
    0.1158329937,
    0,
    0.9343830603,
    0.316302472,
    -0.1639543925,
    0,
    -0.1016836419,
    -0.8057303073,
    -0.5834887393,
    0,
    -0.6529238969,
    0.50602126,
    -0.5635892736,
    0,
    -0.2465286165,
    -0.9668205684,
    -0.06694497494,
    0,
    -0.9776897119,
    -0.2099250524,
    -0.007368825344,
    0,
    0.7736893337,
    0.5734244712,
    0.2694238123,
    0,
    -0.6095087895,
    0.4995678998,
    0.6155736747,
    0,
    0.5794535482,
    0.7434546771,
    0.3339292269,
    0,
    -0.8226211154,
    0.08142581855,
    0.5627293636,
    0,
    -0.510385483,
    0.4703667658,
    0.7199039967,
    0,
    -0.5764971849,
    -0.07231656274,
    -0.8138926898,
    0,
    0.7250628871,
    0.3949971505,
    -0.5641463116,
    0,
    -0.1525424005,
    0.4860840828,
    -0.8604958341,
    0,
    -0.5550976208,
    -0.4957820792,
    0.667882296,
    0,
    -0.1883614327,
    0.9145869398,
    0.357841725,
    0,
    0.7625556724,
    -0.5414408243,
    -0.3540489801,
    0,
    -0.5870231946,
    -0.3226498013,
    -0.7424963803,
    0,
    0.3051124198,
    0.2262544068,
    -0.9250488391,
    0,
    0.6379576059,
    0.577242424,
    -0.5097070502,
    0,
    -0.5966775796,
    0.1454852398,
    -0.7891830656,
    0,
    -0.658330573,
    0.6555487542,
    -0.3699414651,
    0,
    0.7434892426,
    0.2351084581,
    0.6260573129,
    0,
    0.5562114096,
    0.8264360377,
    -0.0873632843,
    0,
    -0.3028940016,
    -0.8251527185,
    0.4768419182,
    0,
    0.1129343818,
    -0.985888439,
    -0.1235710781,
    0,
    0.5937652891,
    -0.5896813806,
    0.5474656618,
    0,
    0.6757964092,
    -0.5835758614,
    -0.4502648413,
    0,
    0.7242302609,
    -0.1152719764,
    0.6798550586,
    0,
    -0.9511914166,
    0.0753623979,
    -0.2992580792,
    0,
    0.2539470961,
    -0.1886339355,
    0.9486454084,
    0,
    0.571433621,
    -0.1679450851,
    -0.8032795685,
    0,
    -0.06778234979,
    0.3978269256,
    0.9149531629,
    0,
    0.6074972649,
    0.733060024,
    -0.3058922593,
    0,
    -0.5435478392,
    0.1675822484,
    0.8224791405,
    0,
    -0.5876678086,
    -0.3380045064,
    -0.7351186982,
    0,
    -0.7967562402,
    0.04097822706,
    -0.6029098428,
    0,
    -0.1996350917,
    0.8706294745,
    0.4496111079,
    0,
    -0.02787660336,
    -0.9106232682,
    -0.4122962022,
    0,
    -0.7797625996,
    -0.6257634692,
    0.01975775581,
    0,
    -0.5211232846,
    0.7401644346,
    -0.4249554471,
    0,
    0.8575424857,
    0.4053272873,
    -0.3167501783,
    0,
    0.1045223322,
    0.8390195772,
    -0.5339674439,
    0,
    0.3501822831,
    0.9242524096,
    -0.1520850155,
    0,
    0.1987849858,
    0.07647613266,
    0.9770547224,
    0,
    0.7845996363,
    0.6066256811,
    -0.1280964233,
    0,
    0.09006737436,
    -0.9750989929,
    -0.2026569073,
    0,
    -0.8274343547,
    -0.542299559,
    0.1458203587,
    0,
    -0.3485797732,
    -0.415802277,
    0.840000362,
    0,
    -0.2471778936,
    -0.7304819962,
    -0.6366310879,
    0,
    -0.3700154943,
    0.8577948156,
    0.3567584454,
    0,
    0.5913394901,
    -0.548311967,
    -0.5913303597,
    0,
    0.1204873514,
    -0.7626472379,
    -0.6354935001,
    0,
    0.616959265,
    0.03079647928,
    0.7863922953,
    0,
    0.1258156836,
    -0.6640829889,
    -0.7369967419,
    0,
    -0.6477565124,
    -0.1740147258,
    -0.7417077429,
    0,
    0.6217889313,
    -0.7804430448,
    -0.06547655076,
    0,
    0.6589943422,
    -0.6096987708,
    0.4404473475,
    0,
    -0.2689837504,
    -0.6732403169,
    -0.6887635427,
    0,
    -0.3849775103,
    0.5676542638,
    0.7277093879,
    0,
    0.5754444408,
    0.8110471154,
    -0.1051963504,
    0,
    0.9141593684,
    0.3832947817,
    0.131900567,
    0,
    -0.107925319,
    0.9245493968,
    0.3654593525,
    0,
    0.377977089,
    0.3043148782,
    0.8743716458,
    0,
    -0.2142885215,
    -0.8259286236,
    0.5214617324,
    0,
    0.5802544474,
    0.4148098596,
    -0.7008834116,
    0,
    -0.1982660881,
    0.8567161266,
    -0.4761596756,
    0,
    -0.03381553704,
    0.3773180787,
    -0.9254661404,
    0,
    -0.6867922841,
    -0.6656597827,
    0.2919133642,
    0,
    0.7731742607,
    -0.2875793547,
    -0.5652430251,
    0,
    -0.09655941928,
    0.9193708367,
    -0.3813575004,
    0,
    0.2715702457,
    -0.9577909544,
    -0.09426605581,
    0,
    0.2451015704,
    -0.6917998565,
    -0.6792188003,
    0,
    0.977700782,
    -0.1753855374,
    0.1155036542,
    0,
    -0.5224739938,
    0.8521606816,
    0.02903615945,
    0,
    -0.7734880599,
    -0.5261292347,
    0.3534179531,
    0,
    -0.7134492443,
    -0.269547243,
    0.6467878011,
    0,
    0.1644037271,
    0.5105846203,
    -0.8439637196,
    0,
    0.6494635788,
    0.05585611296,
    0.7583384168,
    0,
    -0.4711970882,
    0.5017280509,
    -0.7254255765,
    0,
    -0.6335764307,
    -0.2381686273,
    -0.7361091029,
    0,
    -0.9021533097,
    -0.270947803,
    -0.3357181763,
    0,
    -0.3793711033,
    0.872258117,
    0.3086152025,
    0,
    -0.6855598966,
    -0.3250143309,
    0.6514394162,
    0,
    0.2900942212,
    -0.7799057743,
    -0.5546100667,
    0,
    -0.2098319339,
    0.85037073,
    0.4825351604,
    0,
    -0.4592603758,
    0.6598504336,
    -0.5947077538,
    0,
    0.8715945488,
    0.09616365406,
    -0.4807031248,
    0,
    -0.6776666319,
    0.7118504878,
    -0.1844907016,
    0,
    0.7044377633,
    0.312427597,
    0.637304036,
    0,
    -0.7052318886,
    -0.2401093292,
    -0.6670798253,
    0,
    0.081921007,
    -0.7207336136,
    -0.6883545647,
    0,
    -0.6993680906,
    -0.5875763221,
    -0.4069869034,
    0,
    -0.1281454481,
    0.6419895885,
    0.7559286424,
    0,
    -0.6337388239,
    -0.6785471501,
    -0.3714146849,
    0,
    0.5565051903,
    -0.2168887573,
    -0.8020356851,
    0,
    -0.5791554484,
    0.7244372011,
    -0.3738578718,
    0,
    0.1175779076,
    -0.7096451073,
    0.6946792478,
    0,
    -0.6134619607,
    0.1323631078,
    0.7785527795,
    0,
    0.6984635305,
    -0.02980516237,
    -0.715024719,
    0,
    0.8318082963,
    -0.3930171956,
    0.3919597455,
    0,
    0.1469576422,
    0.05541651717,
    -0.9875892167,
    0,
    0.708868575,
    -0.2690503865,
    0.6520101478,
    0,
    0.2726053183,
    0.67369766,
    -0.68688995,
    0,
    -0.6591295371,
    0.3035458599,
    -0.6880466294,
    0,
    0.4815131379,
    -0.7528270071,
    0.4487723203,
    0,
    0.9430009463,
    0.1675647412,
    -0.2875261255,
    0,
    0.434802957,
    0.7695304522,
    -0.4677277752,
    0,
    0.3931996188,
    0.594473625,
    0.7014236729,
    0,
    0.7254336655,
    -0.603925654,
    0.3301814672,
    0,
    0.7590235227,
    -0.6506083235,
    0.02433313207,
    0,
    -0.8552768592,
    -0.3430042733,
    0.3883935666,
    0,
    -0.6139746835,
    0.6981725247,
    0.3682257648,
    0,
    -0.7465905486,
    -0.5752009504,
    0.3342849376,
    0,
    0.5730065677,
    0.810555537,
    -0.1210916791,
    0,
    -0.9225877367,
    -0.3475211012,
    -0.167514036,
    0,
    -0.7105816789,
    -0.4719692027,
    -0.5218416899,
    0,
    -0.08564609717,
    0.3583001386,
    0.929669703,
    0,
    -0.8279697606,
    -0.2043157126,
    0.5222271202,
    0,
    0.427944023,
    0.278165994,
    0.8599346446,
    0,
    0.5399079671,
    -0.7857120652,
    -0.3019204161,
    0,
    0.5678404253,
    -0.5495413974,
    -0.6128307303,
    0,
    -0.9896071041,
    0.1365639107,
    -0.04503418428,
    0,
    -0.6154342638,
    -0.6440875597,
    0.4543037336,
    0,
    0.1074204368,
    -0.7946340692,
    0.5975094525,
    0,
    -0.3595449969,
    -0.8885529948,
    0.28495784,
    0,
    -0.2180405296,
    0.1529888965,
    0.9638738118,
    0,
    -0.7277432317,
    -0.6164050508,
    -0.3007234646,
    0,
    0.7249729114,
    -0.00669719484,
    0.6887448187,
    0,
    -0.5553659455,
    -0.5336586252,
    0.6377908264,
    0,
    0.5137558015,
    0.7976208196,
    -0.3160000073,
    0,
    -0.3794024848,
    0.9245608561,
    -0.03522751494,
    0,
    0.8229248658,
    0.2745365933,
    -0.4974176556,
    0,
    -0.5404114394,
    0.6091141441,
    0.5804613989,
    0,
    0.8036581901,
    -0.2703029469,
    0.5301601931,
    0,
    0.6044318879,
    0.6832968393,
    0.4095943388,
    0,
    0.06389988817,
    0.9658208605,
    -0.2512108074,
    0,
    0.1087113286,
    0.7402471173,
    -0.6634877936,
    0,
    -0.713427712,
    -0.6926784018,
    0.1059128479,
    0,
    0.6458897819,
    -0.5724548511,
    -0.5050958653,
    0,
    -0.6553931414,
    0.7381471625,
    0.159995615,
    0,
    0.3910961323,
    0.9188871375,
    -0.05186755998,
    0,
    -0.4879022471,
    -0.5904376907,
    0.6429111375,
    0,
    0.6014790094,
    0.7707441366,
    -0.2101820095,
    0,
    -0.5677173047,
    0.7511360995,
    0.3368851762,
    0,
    0.7858573506,
    0.226674665,
    0.5753666838,
    0,
    -0.4520345543,
    -0.604222686,
    -0.6561857263,
    0,
    0.002272116345,
    0.4132844051,
    -0.9105991643,
    0,
    -0.5815751419,
    -0.5162925989,
    0.6286591339,
    0,
    -0.03703704785,
    0.8273785755,
    0.5604221175,
    0,
    -0.5119692504,
    0.7953543429,
    -0.3244980058,
    0,
    -0.2682417366,
    -0.9572290247,
    -0.1084387619,
    0,
    -0.2322482736,
    -0.9679131102,
    -0.09594243324,
    0,
    0.3554328906,
    -0.8881505545,
    0.2913006227,
    0,
    0.7346520519,
    -0.4371373164,
    0.5188422971,
    0,
    0.9985120116,
    0.04659011161,
    -0.02833944577,
    0,
    -0.3727687496,
    -0.9082481361,
    0.1900757285,
    0,
    0.91737377,
    -0.3483642108,
    0.1925298489,
    0,
    0.2714911074,
    0.4147529736,
    -0.8684886582,
    0,
    0.5131763485,
    -0.7116334161,
    0.4798207128,
    0,
    -0.8737353606,
    0.18886992,
    -0.4482350644,
    0,
    0.8460043821,
    -0.3725217914,
    0.3814499973,
    0,
    0.8978727456,
    -0.1780209141,
    -0.4026575304,
    0,
    0.2178065647,
    -0.9698322841,
    -0.1094789531,
    0,
    -0.1518031304,
    -0.7788918132,
    -0.6085091231,
    0,
    -0.2600384876,
    -0.4755398075,
    -0.8403819825,
    0,
    0.572313509,
    -0.7474340931,
    -0.3373418503,
    0,
    -0.7174141009,
    0.1699017182,
    -0.6756111411,
    0,
    -0.684180784,
    0.02145707593,
    -0.7289967412,
    0,
    -0.2007447902,
    0.06555605789,
    -0.9774476623,
    0,
    -0.1148803697,
    -0.8044887315,
    0.5827524187,
    0,
    -0.7870349638,
    0.03447489231,
    0.6159443543,
    0,
    -0.2015596421,
    0.6859872284,
    0.6991389226,
    0,
    -0.08581082512,
    -0.10920836,
    -0.9903080513,
    0,
    0.5532693395,
    0.7325250401,
    -0.396610771,
    0,
    -0.1842489331,
    -0.9777375055,
    -0.1004076743,
    0,
    0.0775473789,
    -0.9111505856,
    0.4047110257,
    0,
    0.1399838409,
    0.7601631212,
    -0.6344734459,
    0,
    0.4484419361,
    -0.845289248,
    0.2904925424,
    0
  ];
  _PrimeX = 501125321;
  _PrimeY = 1136930381;
  _PrimeZ = 1720413743;
  /**
   * @private
   * @param {number} a
   * @param {number} b
   * @param {number} t
   * @returns {number}
   */
  static _Lerp(a, b, t) {
    return a + t * (b - a);
  }
  /**
   * @private
   * @param {number} t
   * @returns {number}
   */
  static _InterpHermite(t) {
    return t * t * (3 - 2 * t);
  }
  /**
   * @private
   * @param t
   * @returns {number}
   */
  static _InterpQuintic(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  /**
   * @private
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @param {number} t
   * @returns {number}
   */
  static _CubicLerp(a, b, c, d, t) {
    let p = d - c - (a - b);
    return t * t * t * p + t * t * (a - b - p) + t * (c - a) + b;
  }
  /**
   * @private
   * @param {number} t
   * @returns {number}
   */
  static _PingPong(t) {
    t -= Math.trunc(t * 0.5) * 2;
    return t < 1 ? t : 2 - t;
  }
  /**
   * @private
   */
  _CalculateFractalBounding() {
    let gain = Math.abs(this._Gain);
    let amp = gain;
    let ampFractal = 1;
    for (let i = 1; i < this._Octaves; i++) {
      ampFractal += amp;
      amp *= gain;
    }
    this._FractalBounding = 1 / ampFractal;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} xPrimed
   * @param {number} yPrimed
   * @returns {number}
   */
  _HashR2(seed2, xPrimed, yPrimed) {
    let hash = seed2 ^ xPrimed ^ yPrimed;
    hash = Math.imul(hash, 668265261);
    return hash;
  }
  /**
   *
   * @param {number} seed
   * @param {number} xPrimed
   * @param {number} yPrimed
   * @param {number} zPrimed
   * @returns {number}
   */
  _HashR3(seed2, xPrimed, yPrimed, zPrimed) {
    let hash = seed2 ^ xPrimed ^ yPrimed ^ zPrimed;
    hash = Math.imul(hash, 668265261);
    return hash;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} xPrimed
   * @param {number} yPrimed
   * @returns {number}
   */
  _ValCoordR2(seed2, xPrimed, yPrimed) {
    let hash = this._HashR2(seed2, xPrimed, yPrimed);
    hash = Math.imul(hash, hash);
    hash ^= hash << 19;
    return hash * (1 / 2147483648);
  }
  /**
   *
   * @param {number} seed
   * @param {number} xPrimed
   * @param {number} yPrimed
   * @param {number} zPrimed
   * @returns {number}
   */
  _ValCoordR3(seed2, xPrimed, yPrimed, zPrimed) {
    let hash = this._HashR3(seed2, xPrimed, yPrimed, zPrimed);
    hash = Math.imul(hash, hash);
    hash ^= hash << 19;
    return hash * (1 / 2147483648);
  }
  /**
   *
   * @param {number} seed
   * @param {number} xPrimed
   * @param {number} yPrimed
   * @param {number} xd
   * @param {number} yd
   * @returns {number}
   */
  _GradCoordR2(seed2, xPrimed, yPrimed, xd, yd) {
    let hash = this._HashR2(seed2, xPrimed, yPrimed);
    hash ^= hash >> 15;
    hash &= 127 << 1;
    let xg = this._Gradients2D[hash];
    let yg = this._Gradients2D[hash | 1];
    return xd * xg + yd * yg;
  }
  /**
   *
   * @param {number} seed
   * @param {number} xPrimed
   * @param {number} yPrimed
   * @param {number} zPrimed
   * @param {number} xd
   * @param {number} yd
   * @param {number} zd
   * @returns {number}
   */
  _GradCoordR3(seed2, xPrimed, yPrimed, zPrimed, xd, yd, zd) {
    let hash = this._HashR3(seed2, xPrimed, yPrimed, zPrimed);
    hash ^= hash >> 15;
    hash &= 63 << 2;
    let xg = this._Gradients3D[hash];
    let yg = this._Gradients3D[hash | 1];
    let zg = this._Gradients3D[hash | 2];
    return xd * xg + yd * yg + zd * zg;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _GenNoiseSingleR2(seed2, x, y) {
    switch (this._NoiseType) {
      case _FastNoiseLite.NoiseType.OpenSimplex2:
        return this._SingleOpenSimplex2R2(seed2, x, y);
      case _FastNoiseLite.NoiseType.OpenSimplex2S:
        return this._SingleOpenSimplex2SR2(seed2, x, y);
      case _FastNoiseLite.NoiseType.Cellular:
        return this._SingleCellularR2(seed2, x, y);
      case _FastNoiseLite.NoiseType.Perlin:
        return this._SinglePerlinR2(seed2, x, y);
      case _FastNoiseLite.NoiseType.ValueCubic:
        return this._SingleValueCubicR2(seed2, x, y);
      case _FastNoiseLite.NoiseType.Value:
        return this._SingleValueR2(seed2, x, y);
      default:
        return 0;
    }
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _GenNoiseSingleR3(seed2, x, y, z) {
    switch (this._NoiseType) {
      case _FastNoiseLite.NoiseType.OpenSimplex2:
        return this._SingleOpenSimplex2R3(seed2, x, y, z);
      case _FastNoiseLite.NoiseType.OpenSimplex2S:
        return this._SingleOpenSimplex2SR3(seed2, x, y, z);
      case _FastNoiseLite.NoiseType.Cellular:
        return this._SingleCellularR3(seed2, x, y, z);
      case _FastNoiseLite.NoiseType.Perlin:
        return this._SinglePerlinR3(seed2, x, y, z);
      case _FastNoiseLite.NoiseType.ValueCubic:
        return this._SingleValueCubicR3(seed2, x, y, z);
      case _FastNoiseLite.NoiseType.Value:
        return this._SingleValueR3(seed2, x, y, z);
      default:
        return 0;
    }
  }
  /**
   * @private
   */
  _UpdateTransformType3D() {
    switch (this._RotationType3D) {
      case _FastNoiseLite.RotationType3D.ImproveXYPlanes:
        this._TransformType3D = _FastNoiseLite.TransformType3D.ImproveXYPlanes;
        break;
      case _FastNoiseLite.RotationType3D.ImproveXZPlanes:
        this._TransformType3D = _FastNoiseLite.TransformType3D.ImproveXZPlanes;
        break;
      default:
        switch (this._NoiseType) {
          case _FastNoiseLite.NoiseType.OpenSimplex2:
          case _FastNoiseLite.NoiseType.OpenSimplex2S:
            this._TransformType3D = _FastNoiseLite.TransformType3D.DefaultOpenSimplex2;
            break;
          default:
            this._TransformType3D = _FastNoiseLite.TransformType3D.None;
            break;
        }
        break;
    }
  }
  /**
   * @private
   */
  _UpdateWarpTransformType3D() {
    switch (this._RotationType3D) {
      case _FastNoiseLite.RotationType3D.ImproveXYPlanes:
        this._WarpTransformType3D = _FastNoiseLite.TransformType3D.ImproveXYPlanes;
        break;
      case _FastNoiseLite.RotationType3D.ImproveXZPlanes:
        this._WarpTransformType3D = _FastNoiseLite.TransformType3D.ImproveXZPlanes;
        break;
      default:
        switch (this._DomainWarpType) {
          case _FastNoiseLite.DomainWarpType.OpenSimplex2:
          case _FastNoiseLite.DomainWarpType.OpenSimplex2Reduced:
            this._WarpTransformType3D = _FastNoiseLite.TransformType3D.DefaultOpenSimplex2;
            break;
          default:
            this._WarpTransformType3D = _FastNoiseLite.TransformType3D.None;
            break;
        }
        break;
    }
  }
  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _GenFractalFBmR2(x, y) {
    let seed2 = this._Seed;
    let sum = 0;
    let amp = this._FractalBounding;
    for (let i = 0; i < this._Octaves; i++) {
      let noise = this._GenNoiseSingleR2(seed2++, x, y);
      sum += noise * amp;
      amp *= _FastNoiseLite._Lerp(1, Math.min(noise + 1, 2) * 0.5, this._WeightedStrength);
      x *= this._Lacunarity;
      y *= this._Lacunarity;
      amp *= this._Gain;
    }
    return sum;
  }
  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _GenFractalFBmR3(x, y, z) {
    let seed2 = this._Seed;
    let sum = 0;
    let amp = this._FractalBounding;
    for (let i = 0; i < this._Octaves; i++) {
      let noise = this._GenNoiseSingleR3(seed2++, x, y, z);
      sum += noise * amp;
      amp *= _FastNoiseLite._Lerp(1, (noise + 1) * 0.5, this._WeightedStrength);
      x *= this._Lacunarity;
      y *= this._Lacunarity;
      z *= this._Lacunarity;
      amp *= this._Gain;
    }
    return sum;
  }
  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _GenFractalRidgedR2(x, y) {
    let seed2 = this._Seed;
    let sum = 0;
    let amp = this._FractalBounding;
    for (let i = 0; i < this._Octaves; i++) {
      let noise = Math.abs(this._GenNoiseSingleR2(seed2++, x, y));
      sum += (noise * -2 + 1) * amp;
      amp *= _FastNoiseLite._Lerp(1, 1 - noise, this._WeightedStrength);
      x *= this._Lacunarity;
      y *= this._Lacunarity;
      amp *= this._Gain;
    }
    return sum;
  }
  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _GenFractalRidgedR3(x, y, z) {
    let seed2 = this._Seed;
    let sum = 0;
    let amp = this._FractalBounding;
    for (let i = 0; i < this._Octaves; i++) {
      let noise = Math.abs(this._GenNoiseSingleR3(seed2++, x, y, z));
      sum += (noise * -2 + 1) * amp;
      amp *= _FastNoiseLite._Lerp(1, 1 - noise, this._WeightedStrength);
      x *= this._Lacunarity;
      y *= this._Lacunarity;
      z *= this._Lacunarity;
      amp *= this._Gain;
    }
    return sum;
  }
  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _GenFractalPingPongR2(x, y) {
    let seed2 = this._Seed;
    let sum = 0;
    let amp = this._FractalBounding;
    for (let i = 0; i < this._Octaves; i++) {
      let noise = _FastNoiseLite._PingPong(
        (this._GenNoiseSingleR2(seed2++, x, y) + 1) * this._PingPongStrength
      );
      sum += (noise - 0.5) * 2 * amp;
      amp *= _FastNoiseLite._Lerp(1, noise, this._WeightedStrength);
      x *= this._Lacunarity;
      y *= this._Lacunarity;
      amp *= this._Gain;
    }
    return sum;
  }
  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _GenFractalPingPongR3(x, y, z) {
    let seed2 = this._Seed;
    let sum = 0;
    let amp = this._FractalBounding;
    for (let i = 0; i < this._Octaves; i++) {
      let noise = _FastNoiseLite._PingPong(
        (this._GenNoiseSingleR3(seed2++, x, y, z) + 1) * this._PingPongStrength
      );
      sum += (noise - 0.5) * 2 * amp;
      amp *= _FastNoiseLite._Lerp(1, noise, this._WeightedStrength);
      x *= this._Lacunarity;
      y *= this._Lacunarity;
      z *= this._Lacunarity;
      amp *= this._Gain;
    }
    return sum;
  }
  /**
   *
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _SingleOpenSimplex2R2(seed2, x, y) {
    const SQRT3 = 1.7320508075688772;
    const G2 = (3 - SQRT3) / 6;
    let i = Math.floor(x);
    let j = Math.floor(y);
    let xi = x - i;
    let yi = y - j;
    let t = (xi + yi) * G2;
    let x0 = xi - t;
    let y0 = yi - t;
    i = Math.imul(i, this._PrimeX);
    j = Math.imul(j, this._PrimeY);
    let n0, n1, n2;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a <= 0) {
      n0 = 0;
    } else {
      n0 = a * a * (a * a) * this._GradCoordR2(seed2, i, j, x0, y0);
    }
    let c = 2 * (1 - 2 * G2) * (1 / G2 - 2) * t + (-2 * (1 - 2 * G2) * (1 - 2 * G2) + a);
    if (c <= 0) {
      n2 = 0;
    } else {
      let x2 = x0 + (2 * G2 - 1);
      let y2 = y0 + (2 * G2 - 1);
      n2 = c * c * (c * c) * this._GradCoordR2(seed2, i + this._PrimeX, j + this._PrimeY, x2, y2);
    }
    if (y0 > x0) {
      let x1 = x0 + G2;
      let y1 = y0 + (G2 - 1);
      let b = 0.5 - x1 * x1 - y1 * y1;
      if (b <= 0) {
        n1 = 0;
      } else {
        n1 = b * b * (b * b) * this._GradCoordR2(seed2, i, j + this._PrimeY, x1, y1);
      }
    } else {
      let x1 = x0 + (G2 - 1);
      let y1 = y0 + G2;
      let b = 0.5 - x1 * x1 - y1 * y1;
      if (b <= 0) {
        n1 = 0;
      } else {
        n1 = b * b * (b * b) * this._GradCoordR2(seed2, i + this._PrimeX, j, x1, y1);
      }
    }
    return (n0 + n1 + n2) * 99.83685446303647;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _SingleOpenSimplex2R3(seed2, x, y, z) {
    let i = Math.round(x);
    let j = Math.round(y);
    let k = Math.round(z);
    let x0 = x - i;
    let y0 = y - j;
    let z0 = z - k;
    let yNSign = Math.trunc(-1 - y0 | 1);
    let xNSign = Math.trunc(-1 - x0 | 1);
    let zNSign = Math.trunc(-1 - z0 | 1);
    let ax0 = xNSign * -x0;
    let ay0 = yNSign * -y0;
    let az0 = zNSign * -z0;
    i = Math.imul(i, this._PrimeX);
    j = Math.imul(j, this._PrimeY);
    k = Math.imul(k, this._PrimeZ);
    let value = 0;
    let a = 0.6 - x0 * x0 - (y0 * y0 + z0 * z0);
    for (let l = 0; ; l++) {
      if (a > 0) {
        value += a * a * (a * a) * this._GradCoordR3(seed2, i, j, k, x0, y0, z0);
      }
      if (ax0 >= ay0 && ax0 >= az0) {
        let b = a + ax0 + ax0;
        if (b > 1) {
          b -= 1;
          value += b * b * (b * b) * this._GradCoordR3(
            seed2,
            i - xNSign * this._PrimeX,
            j,
            k,
            x0 + xNSign,
            y0,
            z0
          );
        }
      } else if (ay0 > ax0 && ay0 >= az0) {
        let b = a + ay0 + ay0;
        if (b > 1) {
          b -= 1;
          value += b * b * (b * b) * this._GradCoordR3(
            seed2,
            i,
            j - yNSign * this._PrimeY,
            k,
            x0,
            y0 + yNSign,
            z0
          );
        }
      } else {
        let b = a + az0 + az0;
        if (b > 1) {
          b -= 1;
          value += b * b * (b * b) * this._GradCoordR3(
            seed2,
            i,
            j,
            k - zNSign * this._PrimeZ,
            x0,
            y0,
            z0 + zNSign
          );
        }
      }
      if (l === 1) {
        break;
      }
      ax0 = 0.5 - ax0;
      ay0 = 0.5 - ay0;
      az0 = 0.5 - az0;
      x0 = xNSign * ax0;
      y0 = yNSign * ay0;
      z0 = zNSign * az0;
      a += 0.75 - ax0 - (ay0 + az0);
      i += xNSign >> 1 & this._PrimeX;
      j += yNSign >> 1 & this._PrimeY;
      k += zNSign >> 1 & this._PrimeZ;
      xNSign = -xNSign;
      yNSign = -yNSign;
      zNSign = -zNSign;
      seed2 = ~seed2;
    }
    return value * 32.69428253173828;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _SingleOpenSimplex2SR2(seed2, x, y) {
    const SQRT3 = 1.7320508075688772;
    const G2 = (3 - SQRT3) / 6;
    let i = Math.floor(x);
    let j = Math.floor(y);
    let xi = x - i;
    let yi = y - j;
    i = Math.imul(i, this._PrimeX);
    j = Math.imul(j, this._PrimeY);
    let i1 = i + this._PrimeX;
    let j1 = j + this._PrimeY;
    let t = (xi + yi) * G2;
    let x0 = xi - t;
    let y0 = yi - t;
    let a0 = 2 / 3 - x0 * x0 - y0 * y0;
    let value = a0 * a0 * (a0 * a0) * this._GradCoordR2(seed2, i, j, x0, y0);
    let a1 = 2 * (1 - 2 * G2) * (1 / G2 - 2) * t + (-2 * (1 - 2 * G2) * (1 - 2 * G2) + a0);
    let x1 = x0 - (1 - 2 * G2);
    let y1 = y0 - (1 - 2 * G2);
    value += a1 * a1 * (a1 * a1) * this._GradCoordR2(seed2, i1, j1, x1, y1);
    let xmyi = xi - yi;
    if (t > G2) {
      if (xi + xmyi > 1) {
        let x2 = x0 + (3 * G2 - 2);
        let y2 = y0 + (3 * G2 - 1);
        let a2 = 2 / 3 - x2 * x2 - y2 * y2;
        if (a2 > 0) {
          value += a2 * a2 * (a2 * a2) * this._GradCoordR2(seed2, i + (this._PrimeX << 1), j + this._PrimeY, x2, y2);
        }
      } else {
        let x2 = x0 + G2;
        let y2 = y0 + (G2 - 1);
        let a2 = 2 / 3 - x2 * x2 - y2 * y2;
        if (a2 > 0) {
          value += a2 * a2 * (a2 * a2) * this._GradCoordR2(seed2, i, j + this._PrimeY, x2, y2);
        }
      }
      if (yi - xmyi > 1) {
        let x3 = x0 + (3 * G2 - 1);
        let y3 = y0 + (3 * G2 - 2);
        let a3 = 2 / 3 - x3 * x3 - y3 * y3;
        if (a3 > 0) {
          value += a3 * a3 * (a3 * a3) * this._GradCoordR2(seed2, i + this._PrimeX, j + (this._PrimeY << 1), x3, y3);
        }
      } else {
        let x3 = x0 + (G2 - 1);
        let y3 = y0 + G2;
        let a3 = 2 / 3 - x3 * x3 - y3 * y3;
        if (a3 > 0) {
          value += a3 * a3 * (a3 * a3) * this._GradCoordR2(seed2, i + this._PrimeX, j, x3, y3);
        }
      }
    } else {
      if (xi + xmyi < 0) {
        let x2 = x0 + (1 - G2);
        let y2 = y0 - G2;
        let a2 = 2 / 3 - x2 * x2 - y2 * y2;
        if (a2 > 0) {
          value += a2 * a2 * (a2 * a2) * this._GradCoordR2(seed2, i - this._PrimeX, j, x2, y2);
        }
      } else {
        let x2 = x0 + (G2 - 1);
        let y2 = y0 + G2;
        let a2 = 2 / 3 - x2 * x2 - y2 * y2;
        if (a2 > 0) {
          value += a2 * a2 * (a2 * a2) * this._GradCoordR2(seed2, i + this._PrimeX, j, x2, y2);
        }
      }
      if (yi < xmyi) {
        let x2 = x0 - G2;
        let y2 = y0 - (G2 - 1);
        let a2 = 2 / 3 - x2 * x2 - y2 * y2;
        if (a2 > 0) {
          value += a2 * a2 * (a2 * a2) * this._GradCoordR2(seed2, i, j - this._PrimeY, x2, y2);
        }
      } else {
        let x2 = x0 + G2;
        let y2 = y0 + (G2 - 1);
        let a2 = 2 / 3 - x2 * x2 - y2 * y2;
        if (a2 > 0) {
          value += a2 * a2 * (a2 * a2) * this._GradCoordR2(seed2, i, j + this._PrimeY, x2, y2);
        }
      }
    }
    return value * 18.24196194486065;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _SingleOpenSimplex2SR3(seed2, x, y, z) {
    let i = Math.floor(x);
    let j = Math.floor(y);
    let k = Math.floor(z);
    let xi = x - i;
    let yi = y - j;
    let zi = z - k;
    i = Math.imul(i, this._PrimeX);
    j = Math.imul(j, this._PrimeY);
    k = Math.imul(k, this._PrimeZ);
    let seed22 = seed2 + 1293373;
    let xNMask = Math.trunc(-0.5 - xi);
    let yNMask = Math.trunc(-0.5 - yi);
    let zNMask = Math.trunc(-0.5 - zi);
    let x0 = xi + xNMask;
    let y0 = yi + yNMask;
    let z0 = zi + zNMask;
    let a0 = 0.75 - x0 * x0 - y0 * y0 - z0 * z0;
    let value = a0 * a0 * (a0 * a0) * this._GradCoordR3(
      seed2,
      i + (xNMask & this._PrimeX),
      j + (yNMask & this._PrimeY),
      k + (zNMask & this._PrimeZ),
      x0,
      y0,
      z0
    );
    let x1 = xi - 0.5;
    let y1 = yi - 0.5;
    let z1 = zi - 0.5;
    let a1 = 0.75 - x1 * x1 - y1 * y1 - z1 * z1;
    value += a1 * a1 * (a1 * a1) * this._GradCoordR3(seed22, i + this._PrimeX, j + this._PrimeY, k + this._PrimeZ, x1, y1, z1);
    let xAFlipMask0 = ((xNMask | 1) << 1) * x1;
    let yAFlipMask0 = ((yNMask | 1) << 1) * y1;
    let zAFlipMask0 = ((zNMask | 1) << 1) * z1;
    let xAFlipMask1 = (-2 - (xNMask << 2)) * x1 - 1;
    let yAFlipMask1 = (-2 - (yNMask << 2)) * y1 - 1;
    let zAFlipMask1 = (-2 - (zNMask << 2)) * z1 - 1;
    let skip5 = false;
    let a2 = xAFlipMask0 + a0;
    if (a2 > 0) {
      let x2 = x0 - (xNMask | 1);
      value += a2 * a2 * (a2 * a2) * this._GradCoordR3(
        seed2,
        i + (~xNMask & this._PrimeX),
        j + (yNMask & this._PrimeY),
        k + (zNMask & this._PrimeZ),
        x2,
        y0,
        z0
      );
    } else {
      let a3 = yAFlipMask0 + zAFlipMask0 + a0;
      if (a3 > 0) {
        let x3 = x0;
        let y3 = y0 - (yNMask | 1);
        let z3 = z0 - (zNMask | 1);
        value += a3 * a3 * (a3 * a3) * this._GradCoordR3(
          seed2,
          i + (xNMask & this._PrimeX),
          j + (~yNMask & this._PrimeY),
          k + (~zNMask & this._PrimeZ),
          x3,
          y3,
          z3
        );
      }
      let a4 = xAFlipMask1 + a1;
      if (a4 > 0) {
        let x4 = (xNMask | 1) + x1;
        value += a4 * a4 * (a4 * a4) * this._GradCoordR3(
          seed22,
          i + (xNMask & this._PrimeX * 2),
          j + this._PrimeY,
          k + this._PrimeZ,
          x4,
          y1,
          z1
        );
        skip5 = true;
      }
    }
    let skip9 = false;
    let a6 = yAFlipMask0 + a0;
    if (a6 > 0) {
      let x6 = x0;
      let y6 = y0 - (yNMask | 1);
      value += a6 * a6 * (a6 * a6) * this._GradCoordR3(
        seed2,
        i + (xNMask & this._PrimeX),
        j + (~yNMask & this._PrimeY),
        k + (zNMask & this._PrimeZ),
        x6,
        y6,
        z0
      );
    } else {
      let a7 = xAFlipMask0 + zAFlipMask0 + a0;
      if (a7 > 0) {
        let x7 = x0 - (xNMask | 1);
        let y7 = y0;
        let z7 = z0 - (zNMask | 1);
        value += a7 * a7 * (a7 * a7) * this._GradCoordR3(
          seed2,
          i + (~xNMask & this._PrimeX),
          j + (yNMask & this._PrimeY),
          k + (~zNMask & this._PrimeZ),
          x7,
          y7,
          z7
        );
      }
      let a8 = yAFlipMask1 + a1;
      if (a8 > 0) {
        let x8 = x1;
        let y8 = (yNMask | 1) + y1;
        value += a8 * a8 * (a8 * a8) * this._GradCoordR3(
          seed22,
          i + this._PrimeX,
          j + (yNMask & this._PrimeY << 1),
          k + this._PrimeZ,
          x8,
          y8,
          z1
        );
        skip9 = true;
      }
    }
    let skipD = false;
    let aA = zAFlipMask0 + a0;
    if (aA > 0) {
      let xA = x0;
      let yA = y0;
      let zA = z0 - (zNMask | 1);
      value += aA * aA * (aA * aA) * this._GradCoordR3(
        seed2,
        i + (xNMask & this._PrimeX),
        j + (yNMask & this._PrimeY),
        k + (~zNMask & this._PrimeZ),
        xA,
        yA,
        zA
      );
    } else {
      let aB = xAFlipMask0 + yAFlipMask0 + a0;
      if (aB > 0) {
        let xB = x0 - (xNMask | 1);
        let yB = y0 - (yNMask | 1);
        value += aB * aB * (aB * aB) * this._GradCoordR3(
          seed2,
          i + (~xNMask & this._PrimeX),
          j + (~yNMask & this._PrimeY),
          k + (zNMask & this._PrimeZ),
          xB,
          yB,
          z0
        );
      }
      let aC = zAFlipMask1 + a1;
      if (aC > 0) {
        let xC = x1;
        let yC = y1;
        let zC = (zNMask | 1) + z1;
        value += aC * aC * (aC * aC) * this._GradCoordR3(
          seed22,
          i + this._PrimeX,
          j + this._PrimeY,
          k + (zNMask & this._PrimeZ << 1),
          xC,
          yC,
          zC
        );
        skipD = true;
      }
    }
    if (!skip5) {
      let a5 = yAFlipMask1 + zAFlipMask1 + a1;
      if (a5 > 0) {
        let x5 = x1;
        let y5 = (yNMask | 1) + y1;
        let z5 = (zNMask | 1) + z1;
        value += a5 * a5 * (a5 * a5) * this._GradCoordR3(
          seed22,
          i + this._PrimeX,
          j + (yNMask & this._PrimeY << 1),
          k + (zNMask & this._PrimeZ << 1),
          x5,
          y5,
          z5
        );
      }
    }
    if (!skip9) {
      let a9 = xAFlipMask1 + zAFlipMask1 + a1;
      if (a9 > 0) {
        let x9 = (xNMask | 1) + x1;
        let y9 = y1;
        let z9 = (zNMask | 1) + z1;
        value += a9 * a9 * (a9 * a9) * this._GradCoordR3(
          seed22,
          i + (xNMask & this._PrimeX * 2),
          j + this._PrimeY,
          k + (zNMask & this._PrimeZ << 1),
          x9,
          y9,
          z9
        );
      }
    }
    if (!skipD) {
      let aD = xAFlipMask1 + yAFlipMask1 + a1;
      if (aD > 0) {
        let xD = (xNMask | 1) + x1;
        let yD = (yNMask | 1) + y1;
        value += aD * aD * (aD * aD) * this._GradCoordR3(
          seed22,
          i + (xNMask & this._PrimeX << 1),
          j + (yNMask & this._PrimeY << 1),
          k + this._PrimeZ,
          xD,
          yD,
          z1
        );
      }
    }
    return value * 9.046026385208288;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _SingleCellularR2(seed2, x, y) {
    let xr = Math.round(x);
    let yr = Math.round(y);
    let distance0 = Number.MAX_VALUE;
    let distance1 = Number.MAX_VALUE;
    let closestHash = 0;
    let cellularJitter = 0.43701595 * this._CellularJitterModifier;
    let xPrimed = (xr - 1) * this._PrimeX;
    let yPrimedBase = (yr - 1) * this._PrimeY;
    switch (this._CellularDistanceFunction) {
      default:
      case _FastNoiseLite.CellularDistanceFunction.Euclidean:
      case _FastNoiseLite.CellularDistanceFunction.EuclideanSq:
        for (let xi = xr - 1; xi <= xr + 1; xi++) {
          let yPrimed = yPrimedBase;
          for (let yi = yr - 1; yi <= yr + 1; yi++) {
            let hash = this._HashR2(seed2, xPrimed, yPrimed);
            let idx = hash & 255 << 1;
            let vecX = xi - x + this._RandVecs2D[idx] * cellularJitter;
            let vecY = yi - y + this._RandVecs2D[idx | 1] * cellularJitter;
            let newDistance = vecX * vecX + vecY * vecY;
            distance1 = Math.max(Math.min(distance1, newDistance), distance0);
            if (newDistance < distance0) {
              distance0 = newDistance;
              closestHash = hash;
            }
            yPrimed += this._PrimeY;
          }
          xPrimed += this._PrimeX;
        }
        break;
      case _FastNoiseLite.CellularDistanceFunction.Manhattan:
        for (let xi = xr - 1; xi <= xr + 1; xi++) {
          let yPrimed = yPrimedBase;
          for (let yi = yr - 1; yi <= yr + 1; yi++) {
            let hash = this._HashR2(seed2, xPrimed, yPrimed);
            let idx = hash & 255 << 1;
            let vecX = xi - x + this._RandVecs2D[idx] * cellularJitter;
            let vecY = yi - y + this._RandVecs2D[idx | 1] * cellularJitter;
            let newDistance = Math.abs(vecX) + Math.abs(vecY);
            distance1 = Math.max(Math.min(distance1, newDistance), distance0);
            if (newDistance < distance0) {
              distance0 = newDistance;
              closestHash = hash;
            }
            yPrimed += this._PrimeY;
          }
          xPrimed += this._PrimeX;
        }
        break;
      case _FastNoiseLite.CellularDistanceFunction.Hybrid:
        for (let xi = xr - 1; xi <= xr + 1; xi++) {
          let yPrimed = yPrimedBase;
          for (let yi = yr - 1; yi <= yr + 1; yi++) {
            let hash = this._HashR2(seed2, xPrimed, yPrimed);
            let idx = hash & 255 << 1;
            let vecX = xi - x + this._RandVecs2D[idx] * cellularJitter;
            let vecY = yi - y + this._RandVecs2D[idx | 1] * cellularJitter;
            let newDistance = Math.abs(vecX) + Math.abs(vecY) + (vecX * vecX + vecY * vecY);
            distance1 = Math.max(Math.min(distance1, newDistance), distance0);
            if (newDistance < distance0) {
              distance0 = newDistance;
              closestHash = hash;
            }
            yPrimed += this._PrimeY;
          }
          xPrimed += this._PrimeX;
        }
        break;
    }
    if (this._CellularDistanceFunction === _FastNoiseLite.CellularDistanceFunction.Euclidean && this._CellularReturnType !== _FastNoiseLite.CellularReturnType.CellValue) {
      distance0 = Math.sqrt(distance0);
      if (this._CellularReturnType !== _FastNoiseLite.CellularReturnType.CellValue) {
        distance1 = Math.sqrt(distance1);
      }
    }
    switch (this._CellularReturnType) {
      case _FastNoiseLite.CellularReturnType.CellValue:
        return closestHash * (1 / 2147483648);
      case _FastNoiseLite.CellularReturnType.Distance:
        return distance0 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2:
        return distance1 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Add:
        return (distance1 + distance0) * 0.5 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Sub:
        return distance1 - distance0 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Mul:
        return distance1 * distance0 * 0.5 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Div:
        return distance0 / distance1 - 1;
      default:
        return 0;
    }
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _SingleCellularR3(seed2, x, y, z) {
    let xr = Math.round(x);
    let yr = Math.round(y);
    let zr = Math.round(z);
    let distance0 = Number.MAX_VALUE;
    let distance1 = Number.MAX_VALUE;
    let closestHash = 0;
    let cellularJitter = 0.39614353 * this._CellularJitterModifier;
    let xPrimed = (xr - 1) * this._PrimeX;
    let yPrimedBase = (yr - 1) * this._PrimeY;
    let zPrimedBase = (zr - 1) * this._PrimeZ;
    switch (this._CellularDistanceFunction) {
      case _FastNoiseLite.CellularDistanceFunction.Euclidean:
      case _FastNoiseLite.CellularDistanceFunction.EuclideanSq:
        for (let xi = xr - 1; xi <= xr + 1; xi++) {
          let yPrimed = yPrimedBase;
          for (let yi = yr - 1; yi <= yr + 1; yi++) {
            let zPrimed = zPrimedBase;
            for (let zi = zr - 1; zi <= zr + 1; zi++) {
              let hash = this._HashR3(seed2, xPrimed, yPrimed, zPrimed);
              let idx = hash & 255 << 2;
              let vecX = xi - x + this._RandVecs3D[idx] * cellularJitter;
              let vecY = yi - y + this._RandVecs3D[idx | 1] * cellularJitter;
              let vecZ = zi - z + this._RandVecs3D[idx | 2] * cellularJitter;
              let newDistance = vecX * vecX + vecY * vecY + vecZ * vecZ;
              distance1 = Math.max(Math.min(distance1, newDistance), distance0);
              if (newDistance < distance0) {
                distance0 = newDistance;
                closestHash = hash;
              }
              zPrimed += this._PrimeZ;
            }
            yPrimed += this._PrimeY;
          }
          xPrimed += this._PrimeX;
        }
        break;
      case _FastNoiseLite.CellularDistanceFunction.Manhattan:
        for (let xi = xr - 1; xi <= xr + 1; xi++) {
          let yPrimed = yPrimedBase;
          for (let yi = yr - 1; yi <= yr + 1; yi++) {
            let zPrimed = zPrimedBase;
            for (let zi = zr - 1; zi <= zr + 1; zi++) {
              let hash = this._HashR3(seed2, xPrimed, yPrimed, zPrimed);
              let idx = hash & 255 << 2;
              let vecX = xi - x + this._RandVecs3D[idx] * cellularJitter;
              let vecY = yi - y + this._RandVecs3D[idx | 1] * cellularJitter;
              let vecZ = zi - z + this._RandVecs3D[idx | 2] * cellularJitter;
              let newDistance = Math.abs(vecX) + Math.abs(vecY) + Math.abs(vecZ);
              distance1 = Math.max(Math.min(distance1, newDistance), distance0);
              if (newDistance < distance0) {
                distance0 = newDistance;
                closestHash = hash;
              }
              zPrimed += this._PrimeZ;
            }
            yPrimed += this._PrimeY;
          }
          xPrimed += this._PrimeX;
        }
        break;
      case _FastNoiseLite.CellularDistanceFunction.Hybrid:
        for (let xi = xr - 1; xi <= xr + 1; xi++) {
          let yPrimed = yPrimedBase;
          for (let yi = yr - 1; yi <= yr + 1; yi++) {
            let zPrimed = zPrimedBase;
            for (let zi = zr - 1; zi <= zr + 1; zi++) {
              let hash = this._HashR3(seed2, xPrimed, yPrimed, zPrimed);
              let idx = hash & 255 << 2;
              let vecX = xi - x + this._RandVecs3D[idx] * cellularJitter;
              let vecY = yi - y + this._RandVecs3D[idx | 1] * cellularJitter;
              let vecZ = zi - z + this._RandVecs3D[idx | 2] * cellularJitter;
              let newDistance = Math.abs(vecX) + Math.abs(vecY) + Math.abs(vecZ) + (vecX * vecX + vecY * vecY + vecZ * vecZ);
              distance1 = Math.max(Math.min(distance1, newDistance), distance0);
              if (newDistance < distance0) {
                distance0 = newDistance;
                closestHash = hash;
              }
              zPrimed += this._PrimeZ;
            }
            yPrimed += this._PrimeY;
          }
          xPrimed += this._PrimeX;
        }
        break;
      default:
        break;
    }
    if (this._CellularDistanceFunction === _FastNoiseLite.CellularDistanceFunction.Euclidean && this._CellularReturnType !== _FastNoiseLite.CellularReturnType.CellValue) {
      distance0 = Math.sqrt(distance0);
      if (this._CellularReturnType !== _FastNoiseLite.CellularReturnType.CellValue) {
        distance1 = Math.sqrt(distance1);
      }
    }
    switch (this._CellularReturnType) {
      case _FastNoiseLite.CellularReturnType.CellValue:
        return closestHash * (1 / 2147483648);
      case _FastNoiseLite.CellularReturnType.Distance:
        return distance0 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2:
        return distance1 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Add:
        return (distance1 + distance0) * 0.5 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Sub:
        return distance1 - distance0 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Mul:
        return distance1 * distance0 * 0.5 - 1;
      case _FastNoiseLite.CellularReturnType.Distance2Div:
        return distance0 / distance1 - 1;
      default:
        return 0;
    }
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _SinglePerlinR2(seed2, x, y) {
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let xd0 = x - x0;
    let yd0 = y - y0;
    let xd1 = xd0 - 1;
    let yd1 = yd0 - 1;
    let xs = _FastNoiseLite._InterpQuintic(xd0);
    let ys = _FastNoiseLite._InterpQuintic(yd0);
    x0 = Math.imul(x0, this._PrimeX);
    y0 = Math.imul(y0, this._PrimeY);
    let x1 = x0 + this._PrimeX;
    let y1 = y0 + this._PrimeY;
    let xf0 = _FastNoiseLite._Lerp(
      this._GradCoordR2(seed2, x0, y0, xd0, yd0),
      this._GradCoordR2(seed2, x1, y0, xd1, yd0),
      xs
    );
    let xf1 = _FastNoiseLite._Lerp(
      this._GradCoordR2(seed2, x0, y1, xd0, yd1),
      this._GradCoordR2(seed2, x1, y1, xd1, yd1),
      xs
    );
    return _FastNoiseLite._Lerp(xf0, xf1, ys) * 1.4247691104677813;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _SinglePerlinR3(seed2, x, y, z) {
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let z0 = Math.floor(z);
    let xd0 = x - x0;
    let yd0 = y - y0;
    let zd0 = z - z0;
    let xd1 = xd0 - 1;
    let yd1 = yd0 - 1;
    let zd1 = zd0 - 1;
    let xs = _FastNoiseLite._InterpQuintic(xd0);
    let ys = _FastNoiseLite._InterpQuintic(yd0);
    let zs = _FastNoiseLite._InterpQuintic(zd0);
    x0 = Math.imul(x0, this._PrimeX);
    y0 = Math.imul(y0, this._PrimeY);
    z0 = Math.imul(z0, this._PrimeZ);
    let x1 = x0 + this._PrimeX;
    let y1 = y0 + this._PrimeY;
    let z1 = z0 + this._PrimeZ;
    let xf00 = _FastNoiseLite._Lerp(
      this._GradCoordR3(seed2, x0, y0, z0, xd0, yd0, zd0),
      this._GradCoordR3(seed2, x1, y0, z0, xd1, yd0, zd0),
      xs
    );
    let xf10 = _FastNoiseLite._Lerp(
      this._GradCoordR3(seed2, x0, y1, z0, xd0, yd1, zd0),
      this._GradCoordR3(seed2, x1, y1, z0, xd1, yd1, zd0),
      xs
    );
    let xf01 = _FastNoiseLite._Lerp(
      this._GradCoordR3(seed2, x0, y0, z1, xd0, yd0, zd1),
      this._GradCoordR3(seed2, x1, y0, z1, xd1, yd0, zd1),
      xs
    );
    let xf11 = _FastNoiseLite._Lerp(
      this._GradCoordR3(seed2, x0, y1, z1, xd0, yd1, zd1),
      this._GradCoordR3(seed2, x1, y1, z1, xd1, yd1, zd1),
      xs
    );
    let yf0 = _FastNoiseLite._Lerp(xf00, xf10, ys);
    let yf1 = _FastNoiseLite._Lerp(xf01, xf11, ys);
    return _FastNoiseLite._Lerp(yf0, yf1, zs) * 0.9649214148521423;
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _SingleValueCubicR2(seed2, x, y) {
    let x1 = Math.floor(x);
    let y1 = Math.floor(y);
    let xs = x - x1;
    let ys = y - y1;
    x1 = Math.imul(x1, this._PrimeX);
    y1 = Math.imul(y1, this._PrimeY);
    let x0 = x1 - this._PrimeX;
    let y0 = y1 - this._PrimeY;
    let x2 = x1 + this._PrimeX;
    let y2 = y1 + this._PrimeY;
    let x3 = x1 + (this._PrimeX << 1);
    let y3 = y1 + (this._PrimeY << 1);
    return _FastNoiseLite._CubicLerp(
      _FastNoiseLite._CubicLerp(
        this._ValCoordR2(seed2, x0, y0),
        this._ValCoordR2(seed2, x1, y0),
        this._ValCoordR2(seed2, x2, y0),
        this._ValCoordR2(seed2, x3, y0),
        xs
      ),
      _FastNoiseLite._CubicLerp(
        this._ValCoordR2(seed2, x0, y1),
        this._ValCoordR2(seed2, x1, y1),
        this._ValCoordR2(seed2, x2, y1),
        this._ValCoordR2(seed2, x3, y1),
        xs
      ),
      _FastNoiseLite._CubicLerp(
        this._ValCoordR2(seed2, x0, y2),
        this._ValCoordR2(seed2, x1, y2),
        this._ValCoordR2(seed2, x2, y2),
        this._ValCoordR2(seed2, x3, y2),
        xs
      ),
      _FastNoiseLite._CubicLerp(
        this._ValCoordR2(seed2, x0, y3),
        this._ValCoordR2(seed2, x1, y3),
        this._ValCoordR2(seed2, x2, y3),
        this._ValCoordR2(seed2, x3, y3),
        xs
      ),
      ys
    ) * (1 / (1.5 * 1.5));
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _SingleValueCubicR3(seed2, x, y, z) {
    let x1 = Math.floor(x);
    let y1 = Math.floor(y);
    let z1 = Math.floor(z);
    let xs = x - x1;
    let ys = y - y1;
    let zs = z - z1;
    x1 = Math.imul(x1, this._PrimeX);
    y1 = Math.imul(y1, this._PrimeY);
    z1 = Math.imul(z1, this._PrimeZ);
    let x0 = x1 - this._PrimeX;
    let y0 = y1 - this._PrimeY;
    let z0 = z1 - this._PrimeZ;
    let x2 = x1 + this._PrimeX;
    let y2 = y1 + this._PrimeY;
    let z2 = z1 + this._PrimeZ;
    let x3 = x1 + (this._PrimeX << 1);
    let y3 = y1 + (this._PrimeY << 1);
    let z3 = z1 + (this._PrimeZ << 1);
    return _FastNoiseLite._CubicLerp(
      _FastNoiseLite._CubicLerp(
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y0, z0),
          this._ValCoordR3(seed2, x1, y0, z0),
          this._ValCoordR3(seed2, x2, y0, z0),
          this._ValCoordR3(seed2, x3, y0, z0),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y1, z0),
          this._ValCoordR3(seed2, x1, y1, z0),
          this._ValCoordR3(seed2, x2, y1, z0),
          this._ValCoordR3(seed2, x3, y1, z0),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y2, z0),
          this._ValCoordR3(seed2, x1, y2, z0),
          this._ValCoordR3(seed2, x2, y2, z0),
          this._ValCoordR3(seed2, x3, y2, z0),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y3, z0),
          this._ValCoordR3(seed2, x1, y3, z0),
          this._ValCoordR3(seed2, x2, y3, z0),
          this._ValCoordR3(seed2, x3, y3, z0),
          xs
        ),
        ys
      ),
      _FastNoiseLite._CubicLerp(
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y0, z1),
          this._ValCoordR3(seed2, x1, y0, z1),
          this._ValCoordR3(seed2, x2, y0, z1),
          this._ValCoordR3(seed2, x3, y0, z1),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y1, z1),
          this._ValCoordR3(seed2, x1, y1, z1),
          this._ValCoordR3(seed2, x2, y1, z1),
          this._ValCoordR3(seed2, x3, y1, z1),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y2, z1),
          this._ValCoordR3(seed2, x1, y2, z1),
          this._ValCoordR3(seed2, x2, y2, z1),
          this._ValCoordR3(seed2, x3, y2, z1),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y3, z1),
          this._ValCoordR3(seed2, x1, y3, z1),
          this._ValCoordR3(seed2, x2, y3, z1),
          this._ValCoordR3(seed2, x3, y3, z1),
          xs
        ),
        ys
      ),
      _FastNoiseLite._CubicLerp(
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y0, z2),
          this._ValCoordR3(seed2, x1, y0, z2),
          this._ValCoordR3(seed2, x2, y0, z2),
          this._ValCoordR3(seed2, x3, y0, z2),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y1, z2),
          this._ValCoordR3(seed2, x1, y1, z2),
          this._ValCoordR3(seed2, x2, y1, z2),
          this._ValCoordR3(seed2, x3, y1, z2),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y2, z2),
          this._ValCoordR3(seed2, x1, y2, z2),
          this._ValCoordR3(seed2, x2, y2, z2),
          this._ValCoordR3(seed2, x3, y2, z2),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y3, z2),
          this._ValCoordR3(seed2, x1, y3, z2),
          this._ValCoordR3(seed2, x2, y3, z2),
          this._ValCoordR3(seed2, x3, y3, z2),
          xs
        ),
        ys
      ),
      _FastNoiseLite._CubicLerp(
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y0, z3),
          this._ValCoordR3(seed2, x1, y0, z3),
          this._ValCoordR3(seed2, x2, y0, z3),
          this._ValCoordR3(seed2, x3, y0, z3),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y1, z3),
          this._ValCoordR3(seed2, x1, y1, z3),
          this._ValCoordR3(seed2, x2, y1, z3),
          this._ValCoordR3(seed2, x3, y1, z3),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y2, z3),
          this._ValCoordR3(seed2, x1, y2, z3),
          this._ValCoordR3(seed2, x2, y2, z3),
          this._ValCoordR3(seed2, x3, y2, z3),
          xs
        ),
        _FastNoiseLite._CubicLerp(
          this._ValCoordR3(seed2, x0, y3, z3),
          this._ValCoordR3(seed2, x1, y3, z3),
          this._ValCoordR3(seed2, x2, y3, z3),
          this._ValCoordR3(seed2, x3, y3, z3),
          xs
        ),
        ys
      ),
      zs
    ) * (1 / (1.5 * 1.5 * 1.5));
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _SingleValueR2(seed2, x, y) {
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let xs = _FastNoiseLite._InterpHermite(x - x0);
    let ys = _FastNoiseLite._InterpHermite(y - y0);
    x0 = Math.imul(x0, this._PrimeX);
    y0 = Math.imul(y0, this._PrimeY);
    let x1 = x0 + this._PrimeX;
    let y1 = y0 + this._PrimeY;
    let xf0 = _FastNoiseLite._Lerp(this._ValCoordR2(seed2, x0, y0), this._ValCoordR2(seed2, x1, y0), xs);
    let xf1 = _FastNoiseLite._Lerp(this._ValCoordR2(seed2, x0, y1), this._ValCoordR2(seed2, x1, y1), xs);
    return _FastNoiseLite._Lerp(xf0, xf1, ys);
  }
  /**
   * @private
   * @param {number} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _SingleValueR3(seed2, x, y, z) {
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let z0 = Math.floor(z);
    let xs = _FastNoiseLite._InterpHermite(x - x0);
    let ys = _FastNoiseLite._InterpHermite(y - y0);
    let zs = _FastNoiseLite._InterpHermite(z - z0);
    x0 = Math.imul(x0, this._PrimeX);
    y0 = Math.imul(y0, this._PrimeY);
    z0 = Math.imul(z0, this._PrimeZ);
    let x1 = x0 + this._PrimeX;
    let y1 = y0 + this._PrimeY;
    let z1 = z0 + this._PrimeZ;
    let xf00 = _FastNoiseLite._Lerp(
      this._ValCoordR3(seed2, x0, y0, z0),
      this._ValCoordR3(seed2, x1, y0, z0),
      xs
    );
    let xf10 = _FastNoiseLite._Lerp(
      this._ValCoordR3(seed2, x0, y1, z0),
      this._ValCoordR3(seed2, x1, y1, z0),
      xs
    );
    let xf01 = _FastNoiseLite._Lerp(
      this._ValCoordR3(seed2, x0, y0, z1),
      this._ValCoordR3(seed2, x1, y0, z1),
      xs
    );
    let xf11 = _FastNoiseLite._Lerp(
      this._ValCoordR3(seed2, x0, y1, z1),
      this._ValCoordR3(seed2, x1, y1, z1),
      xs
    );
    let yf0 = _FastNoiseLite._Lerp(xf00, xf10, ys);
    let yf1 = _FastNoiseLite._Lerp(xf01, xf11, ys);
    return _FastNoiseLite._Lerp(yf0, yf1, zs);
  }
  /**
   * @private
   */
  _DoSingleDomainWarp() {
    let R2 = (seed2, amp, freq, coord, x, y) => {
      switch (this._DomainWarpType) {
        case _FastNoiseLite.DomainWarpType.OpenSimplex2:
          this._SingleDomainWarpOpenSimplex2Gradient(
            seed2,
            amp * 38.283687591552734,
            freq,
            coord,
            false,
            x,
            y
          );
          break;
        case _FastNoiseLite.DomainWarpType.OpenSimplex2Reduced:
          this._SingleDomainWarpOpenSimplex2Gradient(
            seed2,
            amp * 16,
            freq,
            coord,
            true,
            x,
            y
          );
          break;
        case _FastNoiseLite.DomainWarpType.BasicGrid:
          this._SingleDomainWarpBasicGrid(seed2, amp, freq, coord, x, y);
          break;
      }
    };
    let R3 = (seed2, amp, freq, coord, x, y, z) => {
      switch (this._DomainWarpType) {
        case _FastNoiseLite.DomainWarpType.OpenSimplex2:
          this._SingleDomainWarpOpenSimplex2Gradient(
            seed2,
            amp * 32.69428253173828,
            freq,
            coord,
            false,
            x,
            y,
            z
          );
          break;
        case _FastNoiseLite.DomainWarpType.OpenSimplex2Reduced:
          this._SingleDomainWarpOpenSimplex2Gradient(
            seed2,
            amp * 7.71604938271605,
            freq,
            coord,
            true,
            x,
            y,
            z
          );
          break;
        case _FastNoiseLite.DomainWarpType.BasicGrid:
          this._SingleDomainWarpBasicGrid(seed2, amp, freq, coord, x, y, z);
          break;
      }
    };
    if (arguments.length === 6 && arguments[3] instanceof Vector2) {
      return R2(arguments[0], arguments[1], arguments[2], arguments[3], arguments[4], arguments[5]);
    }
    if (arguments.length === 7 && arguments[3] instanceof Vector3) {
      return R3(
        arguments[0],
        arguments[1],
        arguments[2],
        arguments[3],
        arguments[4],
        arguments[5],
        arguments[6]
      );
    }
  }
  /**
   * @private
   */
  _DomainWarpSingle() {
    let R2 = (coord) => {
      let seed2 = this._Seed;
      let amp = this._DomainWarpAmp * this._FractalBounding;
      let freq = this._Frequency;
      let xs = coord.x;
      let ys = coord.y;
      switch (this._DomainWarpType) {
        case _FastNoiseLite.DomainWarpType.OpenSimplex2:
        case _FastNoiseLite.DomainWarpType.OpenSimplex2Reduced:
          const SQRT3 = 1.7320508075688772;
          const F2 = 0.5 * (SQRT3 - 1);
          let t = (xs + ys) * F2;
          xs += t;
          ys += t;
          break;
        default:
          break;
      }
      this._DoSingleDomainWarp(seed2, amp, freq, coord, xs, ys);
    };
    let R3 = (coord) => {
      let seed2 = this._Seed;
      let amp = this._DomainWarpAmp * this._FractalBounding;
      let freq = this._Frequency;
      let xs = coord.x;
      let ys = coord.y;
      let zs = coord.z;
      switch (this._WarpTransformType3D) {
        case _FastNoiseLite.TransformType3D.ImproveXYPlanes:
          {
            let xy = xs + ys;
            let s2 = xy * -0.211324865405187;
            zs *= 0.577350269189626;
            xs += s2 - zs;
            ys = ys + s2 - zs;
            zs += xy * 0.577350269189626;
          }
          break;
        case _FastNoiseLite.TransformType3D.ImproveXZPlanes:
          {
            let xz = xs + zs;
            let s2 = xz * -0.211324865405187;
            ys *= 0.577350269189626;
            xs += s2 - ys;
            zs += s2 - ys;
            ys += xz * 0.577350269189626;
          }
          break;
        case _FastNoiseLite.TransformType3D.DefaultOpenSimplex2:
          const R32 = 2 / 3;
          let r = (xs + ys + zs) * R32;
          xs = r - xs;
          ys = r - ys;
          zs = r - zs;
          break;
        default:
          break;
      }
      this._DoSingleDomainWarp(seed2, amp, freq, coord, xs, ys, zs);
    };
    if (arguments.length === 1 && arguments[0] instanceof Vector2) {
      return R2(arguments[0]);
    }
    if (arguments.length === 1 && arguments[0] instanceof Vector3) {
      return R3(arguments[0]);
    }
  }
  _DomainWarpFractalProgressive() {
    let R2 = (coord) => {
      let seed2 = this._Seed;
      let amp = this._DomainWarpAmp * this._FractalBounding;
      let freq = this._Frequency;
      for (let i = 0; i < this._Octaves; i++) {
        let xs = coord.x;
        let ys = coord.y;
        switch (this._DomainWarpType) {
          case _FastNoiseLite.DomainWarpType.OpenSimplex2:
          case _FastNoiseLite.DomainWarpType.OpenSimplex2Reduced:
            const SQRT3 = 1.7320508075688772;
            const F2 = 0.5 * (SQRT3 - 1);
            let t = (xs + ys) * F2;
            xs += t;
            ys += t;
            break;
          default:
            break;
        }
        this._DoSingleDomainWarp(seed2, amp, freq, coord, xs, ys);
        seed2++;
        amp *= this._Gain;
        freq *= this._Lacunarity;
      }
    };
    let R3 = (coord) => {
      let seed2 = this._Seed;
      let amp = this._DomainWarpAmp * this._FractalBounding;
      let freq = this._Frequency;
      for (let i = 0; i < this._Octaves; i++) {
        let xs = coord.x;
        let ys = coord.y;
        let zs = coord.z;
        switch (this._WarpTransformType3D) {
          case _FastNoiseLite.TransformType3D.ImproveXYPlanes:
            {
              let xy = xs + ys;
              let s2 = xy * -0.211324865405187;
              zs *= 0.577350269189626;
              xs += s2 - zs;
              ys = ys + s2 - zs;
              zs += xy * 0.577350269189626;
            }
            break;
          case _FastNoiseLite.TransformType3D.ImproveXZPlanes:
            {
              let xz = xs + zs;
              let s2 = xz * -0.211324865405187;
              ys *= 0.577350269189626;
              xs += s2 - ys;
              zs += s2 - ys;
              ys += xz * 0.577350269189626;
            }
            break;
          case _FastNoiseLite.TransformType3D.DefaultOpenSimplex2:
            {
              const R32 = 2 / 3;
              let r = (xs + ys + zs) * R32;
              xs = r - xs;
              ys = r - ys;
              zs = r - zs;
            }
            break;
          default:
            break;
        }
        this._DoSingleDomainWarp(seed2, amp, freq, coord, xs, ys, zs);
        seed2++;
        amp *= this._Gain;
        freq *= this._Lacunarity;
      }
    };
    if (arguments.length === 1 && arguments[0] instanceof Vector2) {
      return R2(arguments[0]);
    }
    if (arguments.length === 1 && arguments[0] instanceof Vector3) {
      return R3(arguments[0]);
    }
  }
  /**
   * @private
   */
  _DomainWarpFractalIndependent() {
    let R2 = (coord) => {
      let xs = coord.x;
      let ys = coord.y;
      switch (this._DomainWarpType) {
        case _FastNoiseLite.DomainWarpType.OpenSimplex2:
        case _FastNoiseLite.DomainWarpType.OpenSimplex2Reduced:
          const SQRT3 = 1.7320508075688772;
          const F2 = 0.5 * (SQRT3 - 1);
          let t = (xs + ys) * F2;
          xs += t;
          ys += t;
          break;
        default:
          break;
      }
      let seed2 = this._Seed;
      let amp = this._DomainWarpAmp * this._FractalBounding;
      let freq = this._Frequency;
      for (let i = 0; i < this._Octaves; i++) {
        this._DoSingleDomainWarp(seed2, amp, freq, coord, xs, ys);
        seed2++;
        amp *= this._Gain;
        freq *= this._Lacunarity;
      }
    };
    let R3 = (coord) => {
      let xs = coord.x;
      let ys = coord.y;
      let zs = coord.z;
      switch (this._WarpTransformType3D) {
        case _FastNoiseLite.TransformType3D.ImproveXYPlanes:
          {
            let xy = xs + ys;
            let s2 = xy * -0.211324865405187;
            zs *= 0.577350269189626;
            xs += s2 - zs;
            ys = ys + s2 - zs;
            zs += xy * 0.577350269189626;
          }
          break;
        case _FastNoiseLite.TransformType3D.ImproveXZPlanes:
          {
            let xz = xs + zs;
            let s2 = xz * -0.211324865405187;
            ys *= 0.577350269189626;
            xs += s2 - ys;
            zs += s2 - ys;
            ys += xz * 0.577350269189626;
          }
          break;
        case _FastNoiseLite.TransformType3D.DefaultOpenSimplex2:
          {
            const R32 = 2 / 3;
            let r = (xs + ys + zs) * R32;
            xs = r - xs;
            ys = r - ys;
            zs = r - zs;
          }
          break;
        default:
          break;
      }
      let seed2 = this._Seed;
      let amp = this._DomainWarpAmp * this._FractalBounding;
      let freq = this._Frequency;
      for (let i = 0; i < this._Octaves; i++) {
        this._DoSingleDomainWarp(seed2, amp, freq, coord, xs, ys, zs);
        seed2++;
        amp *= this._Gain;
        freq *= this._Lacunarity;
      }
    };
    if (arguments.length === 1 && arguments[0] instanceof Vector2) {
      return R2(arguments[0]);
    }
    if (arguments.length === 1 && arguments[0] instanceof Vector3) {
      return R3(arguments[0]);
    }
  }
  /**
   * @private
   */
  _SingleDomainWarpBasicGrid() {
    let R2 = (seed2, warpAmp, frequency, coord, x, y) => {
      let xf = x * frequency;
      let yf = y * frequency;
      let x0 = Math.floor(xf);
      let y0 = Math.floor(yf);
      let xs = _FastNoiseLite._InterpHermite(xf - x0);
      let ys = _FastNoiseLite._InterpHermite(yf - y0);
      x0 = Math.imul(x0, this._PrimeX);
      y0 = Math.imul(y0, this._PrimeY);
      let x1 = x0 + this._PrimeX;
      let y1 = y0 + this._PrimeY;
      let hash0 = this._HashR2(seed2, x0, y0) & 255 << 1;
      let hash1 = this._HashR2(seed2, x1, y0) & 255 << 1;
      let lx0x = _FastNoiseLite._Lerp(this._RandVecs2D[hash0], this._RandVecs2D[hash1], xs);
      let ly0x = _FastNoiseLite._Lerp(this._RandVecs2D[hash0 | 1], this._RandVecs2D[hash1 | 1], xs);
      hash0 = this._HashR2(seed2, x0, y1) & 255 << 1;
      hash1 = this._HashR2(seed2, x1, y1) & 255 << 1;
      let lx1x = _FastNoiseLite._Lerp(this._RandVecs2D[hash0], this._RandVecs2D[hash1], xs);
      let ly1x = _FastNoiseLite._Lerp(this._RandVecs2D[hash0 | 1], this._RandVecs2D[hash1 | 1], xs);
      coord.x += _FastNoiseLite._Lerp(lx0x, lx1x, ys) * warpAmp;
      coord.y += _FastNoiseLite._Lerp(ly0x, ly1x, ys) * warpAmp;
    };
    let R3 = (seed2, warpAmp, frequency, coord, x, y, z) => {
      let xf = x * frequency;
      let yf = y * frequency;
      let zf = z * frequency;
      let x0 = Math.floor(xf);
      let y0 = Math.floor(yf);
      let z0 = Math.floor(zf);
      let xs = _FastNoiseLite._InterpHermite(xf - x0);
      let ys = _FastNoiseLite._InterpHermite(yf - y0);
      let zs = _FastNoiseLite._InterpHermite(zf - z0);
      x0 = Math.imul(x0, this._PrimeX);
      y0 = Math.imul(y0, this._PrimeY);
      z0 = Math.imul(z0, this._PrimeZ);
      let x1 = x0 + this._PrimeX;
      let y1 = y0 + this._PrimeY;
      let z1 = z0 + this._PrimeZ;
      let hash0 = this._HashR3(seed2, x0, y0, z0) & 255 << 2;
      let hash1 = this._HashR3(seed2, x1, y0, z0) & 255 << 2;
      let lx0x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0], this._RandVecs3D[hash1], xs);
      let ly0x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 1], this._RandVecs3D[hash1 | 1], xs);
      let lz0x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 2], this._RandVecs3D[hash1 | 2], xs);
      hash0 = this._HashR3(seed2, x0, y1, z0) & 255 << 2;
      hash1 = this._HashR3(seed2, x1, y1, z0) & 255 << 2;
      let lx1x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0], this._RandVecs3D[hash1], xs);
      let ly1x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 1], this._RandVecs3D[hash1 | 1], xs);
      let lz1x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 2], this._RandVecs3D[hash1 | 2], xs);
      let lx0y = _FastNoiseLite._Lerp(lx0x, lx1x, ys);
      let ly0y = _FastNoiseLite._Lerp(ly0x, ly1x, ys);
      let lz0y = _FastNoiseLite._Lerp(lz0x, lz1x, ys);
      hash0 = this._HashR3(seed2, x0, y0, z1) & 255 << 2;
      hash1 = this._HashR3(seed2, x1, y0, z1) & 255 << 2;
      lx0x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0], this._RandVecs3D[hash1], xs);
      ly0x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 1], this._RandVecs3D[hash1 | 1], xs);
      lz0x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 2], this._RandVecs3D[hash1 | 2], xs);
      hash0 = this._HashR3(seed2, x0, y1, z1) & 255 << 2;
      hash1 = this._HashR3(seed2, x1, y1, z1) & 255 << 2;
      lx1x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0], this._RandVecs3D[hash1], xs);
      ly1x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 1], this._RandVecs3D[hash1 | 1], xs);
      lz1x = _FastNoiseLite._Lerp(this._RandVecs3D[hash0 | 2], this._RandVecs3D[hash1 | 2], xs);
      coord.x += _FastNoiseLite._Lerp(lx0y, _FastNoiseLite._Lerp(lx0x, lx1x, ys), zs) * warpAmp;
      coord.y += _FastNoiseLite._Lerp(ly0y, _FastNoiseLite._Lerp(ly0x, ly1x, ys), zs) * warpAmp;
      coord.z += _FastNoiseLite._Lerp(lz0y, _FastNoiseLite._Lerp(lz0x, lz1x, ys), zs) * warpAmp;
    };
    if (arguments.length === 6 && arguments[3] instanceof Vector2) {
      R2(arguments[0], arguments[1], arguments[2], arguments[3], arguments[4], arguments[5]);
    }
    if (arguments.length === 7 && arguments[3] instanceof Vector3) {
      R3(
        arguments[0],
        arguments[1],
        arguments[2],
        arguments[3],
        arguments[4],
        arguments[5],
        arguments[6]
      );
    }
  }
  /**
   * @private
   */
  _SingleDomainWarpOpenSimplex2Gradient() {
    let R2 = (seed2, warpAmp, frequency, coord, outGradOnly, x, y) => {
      const SQRT3 = 1.7320508075688772;
      const G2 = (3 - SQRT3) / 6;
      x *= frequency;
      y *= frequency;
      let i = Math.floor(x);
      let j = Math.floor(y);
      let xi = x - i;
      let yi = y - j;
      let t = (xi + yi) * G2;
      let x0 = xi - t;
      let y0 = yi - t;
      i = Math.imul(i, this._PrimeX);
      j = Math.imul(j, this._PrimeY);
      let vx, vy;
      vx = vy = 0;
      let a = 0.5 - x0 * x0 - y0 * y0;
      if (a > 0) {
        let aaaa = a * a * (a * a);
        let xo, yo;
        if (outGradOnly) {
          let hash = this._HashR2(seed2, i, j) & 255 << 1;
          xo = this._RandVecs2D[hash];
          yo = this._RandVecs2D[hash | 1];
        } else {
          let hash = this._HashR2(seed2, i, j);
          let index1 = hash & 127 << 1;
          let index2 = hash >> 7 & 255 << 1;
          let xg = this._Gradients2D[index1];
          let yg = this._Gradients2D[index1 | 1];
          let value = x0 * xg + y0 * yg;
          let xgo = this._RandVecs2D[index2];
          let ygo = this._RandVecs2D[index2 | 1];
          xo = value * xgo;
          yo = value * ygo;
        }
        vx += aaaa * xo;
        vy += aaaa * yo;
      }
      let c = 2 * (1 - 2 * G2) * (1 / G2 - 2) * t + (-2 * (1 - 2 * G2) * (1 - 2 * G2) + a);
      if (c > 0) {
        let x2 = x0 + (2 * G2 - 1);
        let y2 = y0 + (2 * G2 - 1);
        let cccc = c * c * (c * c);
        let xo, yo;
        if (outGradOnly) {
          let hash = this._HashR2(seed2, i + this._PrimeX, j + this._PrimeY) & 255 << 1;
          xo = this._RandVecs2D[hash];
          yo = this._RandVecs2D[hash | 1];
        } else {
          let hash = this._HashR2(seed2, i + this._PrimeX, j + this._PrimeY);
          let index1 = hash & 127 << 1;
          let index2 = hash >> 7 & 255 << 1;
          let xg = this._Gradients2D[index1];
          let yg = this._Gradients2D[index1 | 1];
          let value = x2 * xg + y2 * yg;
          let xgo = this._RandVecs2D[index2];
          let ygo = this._RandVecs2D[index2 | 1];
          xo = value * xgo;
          yo = value * ygo;
        }
        vx += cccc * xo;
        vy += cccc * yo;
      }
      if (y0 > x0) {
        let x1 = x0 + G2;
        let y1 = y0 + (G2 - 1);
        let b = 0.5 - x1 * x1 - y1 * y1;
        if (b > 0) {
          let bbbb = b * b * (b * b);
          let xo, yo;
          if (outGradOnly) {
            let hash = this._HashR2(seed2, i, j + this._PrimeY) & 255 << 1;
            xo = this._RandVecs2D[hash];
            yo = this._RandVecs2D[hash | 1];
          } else {
            let hash = this._HashR2(seed2, i, j + this._PrimeY);
            let index1 = hash & 127 << 1;
            let index2 = hash >> 7 & 255 << 1;
            let xg = this._Gradients2D[index1];
            let yg = this._Gradients2D[index1 | 1];
            let value = x1 * xg + y1 * yg;
            let xgo = this._RandVecs2D[index2];
            let ygo = this._RandVecs2D[index2 | 1];
            xo = value * xgo;
            yo = value * ygo;
          }
          vx += bbbb * xo;
          vy += bbbb * yo;
        }
      } else {
        let x1 = x0 + (G2 - 1);
        let y1 = y0 + G2;
        let b = 0.5 - x1 * x1 - y1 * y1;
        if (b > 0) {
          let bbbb = b * b * (b * b);
          let xo, yo;
          if (outGradOnly) {
            let hash = this._HashR2(seed2, i + this._PrimeX, j) & 255 << 1;
            xo = this._RandVecs2D[hash];
            yo = this._RandVecs2D[hash | 1];
          } else {
            let hash = this._HashR2(seed2, i + this._PrimeX, j);
            let index1 = hash & 127 << 1;
            let index2 = hash >> 7 & 255 << 1;
            let xg = this._Gradients2D[index1];
            let yg = this._Gradients2D[index1 | 1];
            let value = x1 * xg + y1 * yg;
            let xgo = this._RandVecs2D[index2];
            let ygo = this._RandVecs2D[index2 | 1];
            xo = value * xgo;
            yo = value * ygo;
          }
          vx += bbbb * xo;
          vy += bbbb * yo;
        }
      }
      coord.x += vx * warpAmp;
      coord.y += vy * warpAmp;
    };
    let R3 = (seed2, warpAmp, frequency, coord, outGradOnly, x, y, z) => {
      x *= frequency;
      y *= frequency;
      z *= frequency;
      let i = Math.round(x);
      let j = Math.round(y);
      let k = Math.round(z);
      let x0 = x - i;
      let y0 = y - j;
      let z0 = z - k;
      let xNSign = -x0 - 1 | 1;
      let yNSign = -y0 - 1 | 1;
      let zNSign = -z0 - 1 | 1;
      let ax0 = xNSign * -x0;
      let ay0 = yNSign * -y0;
      let az0 = zNSign * -z0;
      i = Math.imul(i, this._PrimeX);
      j = Math.imul(j, this._PrimeY);
      k = Math.imul(k, this._PrimeZ);
      let vx, vy, vz;
      vx = vy = vz = 0;
      let a = 0.6 - x0 * x0 - (y0 * y0 + z0 * z0);
      for (let l = 0; ; l++) {
        if (a > 0) {
          let aaaa = a * a * (a * a);
          let xo, yo, zo;
          if (outGradOnly) {
            let hash = this._HashR3(seed2, i, j, k) & 255 << 2;
            xo = this._RandVecs3D[hash];
            yo = this._RandVecs3D[hash | 1];
            zo = this._RandVecs3D[hash | 2];
          } else {
            let hash = this._HashR3(seed2, i, j, k);
            let index1 = hash & 63 << 2;
            let index2 = hash >> 6 & 255 << 2;
            let xg = this._Gradients3D[index1];
            let yg = this._Gradients3D[index1 | 1];
            let zg = this._Gradients3D[index1 | 2];
            let value = x0 * xg + y0 * yg + z0 * zg;
            let xgo = this._RandVecs3D[index2];
            let ygo = this._RandVecs3D[index2 | 1];
            let zgo = this._RandVecs3D[index2 | 2];
            xo = value * xgo;
            yo = value * ygo;
            zo = value * zgo;
          }
          vx += aaaa * xo;
          vy += aaaa * yo;
          vz += aaaa * zo;
        }
        let b = a;
        let i1 = i;
        let j1 = j;
        let k1 = k;
        let x1 = x0;
        let y1 = y0;
        let z1 = z0;
        if (ax0 >= ay0 && ax0 >= az0) {
          x1 += xNSign;
          b = b + ax0 + ax0;
          i1 -= xNSign * this._PrimeX;
        } else if (ay0 > ax0 && ay0 >= az0) {
          y1 += yNSign;
          b = b + ay0 + ay0;
          j1 -= yNSign * this._PrimeY;
        } else {
          z1 += zNSign;
          b = b + az0 + az0;
          k1 -= zNSign * this._PrimeZ;
        }
        if (b > 1) {
          b -= 1;
          let bbbb = b * b * (b * b);
          let xo, yo, zo;
          if (outGradOnly) {
            let hash = this._HashR3(seed2, i1, j1, k1) & 255 << 2;
            xo = this._RandVecs3D[hash];
            yo = this._RandVecs3D[hash | 1];
            zo = this._RandVecs3D[hash | 2];
          } else {
            let hash = this._HashR3(seed2, i1, j1, k1);
            let index1 = hash & 63 << 2;
            let index2 = hash >> 6 & 255 << 2;
            let xg = this._Gradients3D[index1];
            let yg = this._Gradients3D[index1 | 1];
            let zg = this._Gradients3D[index1 | 2];
            let value = x1 * xg + y1 * yg + z1 * zg;
            let xgo = this._RandVecs3D[index2];
            let ygo = this._RandVecs3D[index2 | 1];
            let zgo = this._RandVecs3D[index2 | 2];
            xo = value * xgo;
            yo = value * ygo;
            zo = value * zgo;
          }
          vx += bbbb * xo;
          vy += bbbb * yo;
          vz += bbbb * zo;
        }
        if (l === 1) break;
        ax0 = 0.5 - ax0;
        ay0 = 0.5 - ay0;
        az0 = 0.5 - az0;
        x0 = xNSign * ax0;
        y0 = yNSign * ay0;
        z0 = zNSign * az0;
        a += 0.75 - ax0 - (ay0 + az0);
        i += xNSign >> 1 & this._PrimeX;
        j += yNSign >> 1 & this._PrimeY;
        k += zNSign >> 1 & this._PrimeZ;
        xNSign = -xNSign;
        yNSign = -yNSign;
        zNSign = -zNSign;
        seed2 += 1293373;
      }
      coord.x += vx * warpAmp;
      coord.y += vy * warpAmp;
      coord.z += vz * warpAmp;
    };
    if (arguments.length === 7) {
      R2(
        arguments[0],
        arguments[1],
        arguments[2],
        arguments[3],
        arguments[4],
        arguments[5],
        arguments[6]
      );
    }
    if (arguments.length === 8) {
      R3(
        arguments[0],
        arguments[1],
        arguments[2],
        arguments[3],
        arguments[4],
        arguments[5],
        arguments[6],
        arguments[7]
      );
    }
  }
};
var Vector2 = class {
  /**
   * 2d Vector
   * @param {number} x
   * @param {number} y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
};
var Vector3 = class {
  /**
   * 3d Vector
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
};

// modules/spatial-effects/src/noise.ts
var noiseAlgorithms = Object.freeze({ openSimplex2: "OpenSimplex2", openSimplex2S: "OpenSimplex2S", cellular: "Cellular", perlin: "Perlin", valueCubic: "ValueCubic", value: "Value" });
var fractals = { none: "None", fbm: "FBm", ridged: "Ridged", pingPong: "PingPong" };
var rotations = { none: "None", improveXY: "ImproveXYPlanes", improveXZ: "ImproveXZPlanes" };
var warps = { openSimplex2: "OpenSimplex2", openSimplex2Reduced: "OpenSimplex2Reduced", basicGrid: "BasicGrid" };
var modes = { single: "None", progressive: "DomainWarpProgressive", independent: "DomainWarpIndependent" };
var distances = { euclidean: "Euclidean", euclideanSq: "EuclideanSq", manhattan: "Manhattan", hybrid: "Hybrid" };
var returns = { cellValue: "CellValue", distance: "Distance", distance2: "Distance2", distance2Add: "Distance2Add", distance2Sub: "Distance2Sub", distance2Mul: "Distance2Mul", distance2Div: "Distance2Div" };
function choice(value, map, name) {
  if (!Object.hasOwn(map, value)) spatialError("E_SPATIAL_PARAMETER", `Unknown ${name}`);
  return value;
}
function seed(value) {
  integer(value, "seed", -2147483648);
  if (value > 4294967295) spatialError("E_SPATIAL_PARAMETER", "Seed must fit signed/unsigned 32 bits");
  return value | 0;
}
function resolveNoise(source = {}) {
  let o;
  try {
    o = structuredClone(source);
  } catch {
    spatialError("E_SPATIAL_PARAMETER", "Noise options must be cloneable data");
  }
  const closed = (value, keys) => {
    if (!value || typeof value !== "object" || Object.keys(value).some((key) => !keys.includes(key))) spatialError("E_SPATIAL_PARAMETER", "Unknown noise option");
  };
  closed(o, ["seed", "frequency", "algorithm", "fractal", "rotation3D", "warp", "cellular", "maxOctaves"]);
  if (o.fractal) closed(o.fractal, ["kind", "octaves", "lacunarity", "gain", "weightedStrength", "pingPongStrength"]);
  if (o.warp) closed(o.warp, ["kind", "seed", "frequency", "amplitude", "mode", "octaves", "lacunarity", "gain"]);
  if (o.cellular) closed(o.cellular, ["distance", "returnType", "jitter"]);
  const max = integer(o.maxOctaves ?? 32, "maxOctaves"), f = o.fractal ?? {}, w = o.warp, c = o.cellular ?? {};
  function octaves(n = 3) {
    integer(n, "octaves");
    if (n > max) spatialError("E_SPATIAL_NOISE_BUDGET", "Octaves exceed maxOctaves");
    return n;
  }
  const result = {
    seed: seed(o.seed ?? 1337),
    frequency: finite(o.frequency ?? 0.01, "frequency", 0),
    algorithm: choice(o.algorithm ?? "openSimplex2", noiseAlgorithms, "noise algorithm"),
    rotation3D: choice(o.rotation3D ?? "none", rotations, "rotation"),
    maxOctaves: max,
    fractal: { kind: choice(f.kind ?? "none", fractals, "fractal"), octaves: octaves(f.octaves), lacunarity: finite(f.lacunarity ?? 2, "lacunarity", Number.MIN_VALUE), gain: finite(f.gain ?? 0.5, "gain", 0, 1), weightedStrength: finite(f.weightedStrength ?? 0, "weightedStrength", 0, 1), pingPongStrength: finite(f.pingPongStrength ?? 2, "pingPongStrength", 0) },
    cellular: { distance: choice(c.distance ?? "euclideanSq", distances, "cellular distance"), returnType: choice(c.returnType ?? "distance", returns, "cellular return"), jitter: finite(c.jitter ?? 1, "cellular jitter", 0, 1) },
    warp: w ? { kind: choice(w.kind ?? "openSimplex2", warps, "warp"), seed: seed(w.seed ?? o.seed ?? 1337), frequency: finite(w.frequency ?? o.frequency ?? 0.01, "warp frequency", 0), amplitude: finite(w.amplitude ?? 1, "warp amplitude", 0), mode: choice(w.mode ?? "single", modes, "warp mode"), octaves: octaves(w.octaves), lacunarity: finite(w.lacunarity ?? 2, "warp lacunarity", Number.MIN_VALUE), gain: finite(w.gain ?? 0.5, "warp gain", 0, 1) } : null
  };
  for (const [frequency, lacunarity, count] of [[result.frequency, result.fractal.lacunarity, result.fractal.kind === "none" ? 1 : result.fractal.octaves], [result.warp?.frequency ?? 0, result.warp?.lacunarity ?? 1, result.warp?.mode === "single" ? 1 : result.warp?.octaves ?? 1]]) if (!Number.isFinite(frequency * Math.max(1, lacunarity) ** (count - 1))) spatialError("E_SPATIAL_NOISE_RANGE", "Frequency/octave lattice scale overflows");
  return result;
}
function assertNoisePosition(position, o) {
  for (const n of position) finite(n, "noise coordinate");
  const noiseScale = o.frequency * Math.max(1, o.fractal.lacunarity) ** (o.fractal.kind === "none" ? 0 : o.fractal.octaves - 1), w = o.warp, warpScale = w ? w.frequency * Math.max(1, w.lacunarity) ** (w.mode === "single" ? 0 : w.octaves - 1) : 0;
  const extent = Math.max(...position.map(Math.abs)) + (w?.amplitude ?? 0) + 2;
  if (!Number.isFinite(extent) || extent * Math.max(noiseScale, warpScale) * 4 >= 2 ** 29) spatialError("E_SPATIAL_NOISE_RANGE", "Coordinates/frequency/octaves exceed the qualified signed lattice domain");
}
function kernel(o, overrideSeed = o.seed) {
  const n = new FastNoiseLite(overrideSeed), f = o.fractal, c = o.cellular;
  n.SetFrequency(o.frequency);
  n.SetNoiseType(noiseAlgorithms[o.algorithm]);
  n.SetRotationType3D(rotations[o.rotation3D]);
  n.SetFractalType(fractals[f.kind]);
  n.SetFractalOctaves(f.octaves);
  n.SetFractalLacunarity(f.lacunarity);
  n.SetFractalGain(f.gain);
  n.SetFractalWeightedStrength(f.weightedStrength);
  n.SetFractalPingPongStrength(f.pingPongStrength);
  n.SetCellularDistanceFunction(distances[c.distance]);
  n.SetCellularReturnType(returns[c.returnType]);
  n.SetCellularJitter(c.jitter);
  return n;
}
function createNoise(options = {}) {
  const o = resolveNoise(options), n = kernel(o);
  let warp;
  if (o.warp) {
    const w = o.warp;
    warp = new FastNoiseLite(w.seed);
    warp.SetFrequency(w.frequency);
    warp.SetRotationType3D(rotations[o.rotation3D]);
    warp.SetDomainWarpType(warps[w.kind]);
    warp.SetDomainWarpAmp(w.amplitude);
    warp.SetFractalType(modes[w.mode]);
    warp.SetFractalOctaves(w.octaves);
    warp.SetFractalLacunarity(w.lacunarity);
    warp.SetFractalGain(w.gain);
  }
  const warp2 = (p) => {
    if (p.length !== 2) spatialError("E_SPATIAL_PARAMETER", "2D point required");
    assertNoisePosition(p, o);
    const v = new Vector2(...p);
    warp?.DomainWrap(v);
    return [finite(v.x, "warped x"), finite(v.y, "warped y")];
  };
  const warp3 = (p) => {
    if (p.length !== 3) spatialError("E_SPATIAL_PARAMETER", "3D point required");
    assertNoisePosition(p, o);
    const v = new Vector3(...p);
    warp?.DomainWrap(v);
    return [finite(v.x, "warped x"), finite(v.y, "warped y"), finite(v.z, "warped z")];
  };
  const sample2 = (p) => finite(n.GetNoise(...warp2(p)), "noise result");
  const sample3 = (p) => finite(n.GetNoise(...warp3(p)), "noise result");
  let potentials;
  function delta(p, epsilon) {
    const h = finite(epsilon ?? 1e-3 / (o.frequency || 1), "curl epsilon", Number.MIN_VALUE);
    if (p.some((v) => v + h === v || v - h === v)) spatialError("E_SPATIAL_NOISE_RANGE", "Curl epsilon is below coordinate precision");
    return h;
  }
  return {
    sample2,
    sample3,
    warp2,
    warp3,
    get settings() {
      return structuredClone(o);
    },
    curl2(p, epsilon) {
      const h = delta(p, epsilon), [x, y] = p;
      return [finite((sample2([x, y + h]) - sample2([x, y - h])) / (2 * h), "curl x"), finite(-(sample2([x + h, y]) - sample2([x - h, y])) / (2 * h), "curl y")];
    },
    curl3(p, epsilon) {
      const h = delta(p, epsilon);
      potentials ??= [n, kernel(o, o.seed ^ 2654435769), kernel(o, o.seed ^ 608135816)];
      const derivative = (component, axis) => {
        const plus = [...p], minus = [...p];
        plus[axis] += h;
        minus[axis] -= h;
        return (potentials[component].GetNoise(...warp3(plus)) - potentials[component].GetNoise(...warp3(minus))) / (2 * h);
      };
      return [finite(derivative(2, 1) - derivative(1, 2), "curl x"), finite(derivative(0, 2) - derivative(2, 0), "curl y"), finite(derivative(1, 0) - derivative(0, 1), "curl z")];
    }
  };
}

// modules/spatial-effects/src/simulation.ts
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var add = (a, b, scale = 1) => a.map((v, i) => v + b[i] * scale);
var norm = (v) => Math.hypot(...v);
function unit(v) {
  const n = norm(v);
  if (!n || !Number.isFinite(n)) spatialError("E_SPATIAL_PARAMETER", "A nonzero finite axis is required");
  return v.map((x) => x / n);
}
function computeAcceleration(position, velocity, forces, time) {
  let a = [0, 0, 0];
  for (const f of forces) {
    if (f.kind === "acceleration") a = add(a, f.value);
    else if (f.kind === "drag") a = add(a, velocity, -f.coefficient);
    else if (f.kind === "curl") a = add(a, f.field.curl3(add(position, f.motion, time), f.epsilon), f.strength);
    else {
      const r = add(position, f.center, -1), soft = f.softening ?? 0.1;
      if (f.kind === "attractor") a = add(a, r, -f.strength / (dot(r, r) + soft * soft) ** 1.5);
      else {
        const axis = f.axis, cross = [axis[1] * r[2] - axis[2] * r[1], axis[2] * r[0] - axis[0] * r[2], axis[0] * r[1] - axis[1] * r[0]];
        a = add(a, cross, f.strength / Math.sqrt(dot(r, r) + soft * soft));
      }
    }
  }
  return vector(a, "acceleration");
}
function prepareForce(f) {
  if (!f || typeof f !== "object") spatialError("E_SPATIAL_PARAMETER", "Invalid force");
  if (f.kind === "acceleration") return { kind: f.kind, value: vector(f.value, "acceleration") };
  if (f.kind === "drag") return { kind: f.kind, coefficient: finite(f.coefficient, "drag", 0) };
  if (f.kind === "curl") return { kind: f.kind, field: createNoise(f.noise), strength: finite(f.strength, "curl strength"), epsilon: f.epsilon === void 0 ? void 0 : finite(f.epsilon, "curl epsilon", Number.MIN_VALUE), motion: vector(f.motion ?? [0, 0, 0], "curl motion") };
  if (f.kind === "attractor" || f.kind === "vortex") return { ...f, center: vector(f.center, "force center"), strength: finite(f.strength, "strength"), softening: finite(f.softening ?? 0.1, "softening", Number.MIN_VALUE), ...f.kind === "vortex" ? { axis: unit(vector(f.axis, "vortex axis")) } : {} };
  return spatialError("E_SPATIAL_PARAMETER", "Unknown force");
}
function particleAcceleration(position, velocity, forces, time = 0) {
  return computeAcceleration(vector(position, "position"), vector(velocity, "velocity"), forces.map(prepareForce), finite(time, "force time"));
}
function prepareCollider(c) {
  if (!c || typeof c.id !== "string" || !c.id.length) spatialError("E_SPATIAL_PARAMETER", "Collider id required");
  const material = { id: c.id, restitution: finite(c.restitution ?? 0.7, "restitution", 0, 1), friction: finite(c.friction ?? 0, "friction", 0, 1) };
  if (c.kind === "plane") return { ...material, kind: c.kind, normal: unit(vector(c.normal, "plane normal")), offset: finite(c.offset, "plane offset") };
  if (c.kind === "sphere") return { ...material, kind: c.kind, center: vector(c.center, "sphere center"), radius: finite(c.radius, "sphere radius", Number.MIN_VALUE) };
  return spatialError("E_SPATIAL_PARAMETER", "Unknown collider");
}
function drift(p, dt, time, colliders, maxImpacts) {
  let remaining = dt, elapsed = 0, impacts = 0;
  const contacts = [];
  while (remaining > 0) {
    let hit;
    for (const c of colliders) {
      let t = Infinity, n = [1, 0, 0], push = 0;
      if (c.kind === "plane") {
        n = c.normal;
        const d = dot(p.position, n) - c.offset - p.radius, v = dot(p.velocity, n);
        if (d < 0) {
          t = 0;
          push = -d;
        } else if (v < 0) t = -d / v;
      } else {
        const r = add(p.position, c.center, -1), distance = norm(r), R = c.radius + p.radius;
        if (distance < R) {
          t = 0;
          push = R - distance;
          n = distance ? r.map((x) => x / distance) : [1, 0, 0];
        } else {
          const A = dot(p.velocity, p.velocity), B = dot(r, p.velocity), C = dot(r, r) - R * R, D = B * B - A * C;
          if (A > 0 && B < 0 && D >= 0) {
            t = (-B - Math.sqrt(D)) / A;
            if (t >= 0 && t <= remaining) n = unit(add(r, p.velocity, t));
          }
        }
      }
      if (t >= 0 && t <= remaining && (!hit || t < hit.t)) hit = { t, n, c, push };
    }
    if (!hit) {
      p.position = add(p.position, p.velocity, remaining);
      break;
    }
    if (++impacts > maxImpacts) spatialError("E_SPATIAL_COLLISION_BUDGET", "Collision iteration budget exhausted; reduce timestep or raise maxImpactsPerStep");
    p.position = add(p.position, p.velocity, hit.t);
    elapsed += hit.t;
    remaining -= hit.t;
    const epsilon = 1e-9 * Math.max(1, norm(p.position), p.radius);
    p.position = add(p.position, hit.n, hit.push + epsilon);
    const inward = dot(p.velocity, hit.n);
    if (inward < 0) {
      const tangent = add(p.velocity, hit.n, -inward), friction = hit.c.friction;
      p.velocity = add(tangent.map((v) => v * (1 - friction)), hit.n, -inward * hit.c.restitution);
    }
    contacts.push({ particleId: p.id, colliderId: hit.c.id, time: time + elapsed, point: [...p.position], normal: [...hit.n] });
  }
  vector(p.position, "position");
  vector(p.velocity, "velocity");
  return contacts;
}
function createFeedbackParticles(source) {
  const o = structuredClone(source), fps = rational(o.fps), seed2 = integer(o.seed ?? 1, "seed", 0), substeps = integer(o.substeps ?? 2, "substeps"), hz = fps.num / fps.den * substeps;
  const rate = finite(o.rate, "rate", 0), life = finite(o.lifetime, "lifetime", Number.MIN_VALUE), start = finite(o.startTime ?? 0, "startTime", 0), duration = finite(o.duration ?? Number.MAX_VALUE, "duration", 0);
  const origin = vector(o.origin, "origin"), velocity = vector(o.velocity, "velocity"), pj = vector(o.positionJitter ?? [0, 0, 0], "position jitter", 0), vj = vector(o.velocityJitter ?? [0, 0, 0], "velocity jitter", 0), radius = finite(o.radius ?? 0.04, "radius", 0);
  const forces = (o.forces ?? []).map(prepareForce), colliders = (o.colliders ?? []).map(prepareCollider);
  if (new Set(colliders.map((c) => c.id)).size !== colliders.length) spatialError("E_SPATIAL_PARAMETER", "Collider ids must be unique");
  const trailPoints = integer(o.trailPoints ?? 16, "trailPoints", 0), trailEvery = integer(o.trailEverySteps ?? substeps, "trailEverySteps");
  const b = o.budgets ?? {}, maxParticles = integer(b.maxParticles ?? 1e4, "maxParticles"), maxValueBytes = integer(b.maxValueBytes ?? 128 * 1024 * 1024, "maxValueBytes"), maxImpacts = integer(b.maxImpactsPerStep ?? 8, "maxImpactsPerStep"), maxCheckpoints = integer(b.maxCheckpoints ?? 8, "maxCheckpoints", 2);
  const bytesPerParticle = 8 * (12 + 3 * trailPoints), potential = Math.min(maxParticles, Math.ceil(rate * Math.min(life, duration)) + 1);
  if (!Number.isFinite(hz) || !Number.isSafeInteger(potential) || potential * bytesPerParticle * (maxCheckpoints + 3) > maxValueBytes) spatialError("E_SPATIAL_STATE_BUDGET", "Planned live/checkpoint values exceed maxValueBytes; adjust rate/lifetime/trails/checkpoints or explicit budget");
  let state = { step: 0, particles: [], contacts: [], emitted: 0 }, failed = false;
  function birth(id) {
    integer(id, "birth id", 0);
    const random = (salt) => seededRandom(seed2, id, salt) * 2 - 1;
    return { id, birthTime: start + id / rate, lifetime: life, radius, position: vector(origin.map((v, i) => v + pj[i] * random(i)), "initial position"), velocity: vector(velocity.map((v, i) => v + vj[i] * random(i + 3)), "initial velocity"), trail: [] };
  }
  function budget(particles, contacts) {
    if (particles.length > maxParticles || (particles.length * bytesPerParticle + contacts.length * 96) * (maxCheckpoints + 3) > maxValueBytes) spatialError("E_SPATIAL_STATE_BUDGET", "Particle/contact values exceed configured budgets");
  }
  const sim = {
    reset() {
      state = { step: 0, particles: rate > 0 && start === 0 && duration > 0 ? [birth(0)] : [], contacts: [], emitted: rate > 0 && start === 0 && duration > 0 ? 1 : 0 };
    },
    step(dt, step) {
      const time = step / hz, previous = (step - 1) / hz, particles = [], contacts = [];
      const advance = (p, interval) => {
        const next = { ...p, position: [...p.position], velocity: add(p.velocity, computeAcceleration(p.position, p.velocity, forces, time - interval), interval), trail: [...p.trail] };
        contacts.push(...drift(next, interval, time - interval, colliders, maxImpacts));
        if (trailPoints > 0 && step % trailEvery === 0) {
          next.trail.push([...next.position]);
          if (next.trail.length > trailPoints) next.trail.shift();
        }
        particles.push(next);
      };
      for (const p of state.particles) if (time - p.birthTime < life) advance(p, dt);
      let emitted = state.emitted;
      if (rate > 0 && time >= start && duration > 0) {
        const last = Math.floor((time - start) * rate), first = emitted;
        integer(last, "birth index", 0);
        const aliveFirst = Math.max(first, Math.floor((time - start - life) * rate) + 1), end = Math.min(last, Math.ceil(duration * rate) - 1);
        if (end - aliveFirst + 1 + particles.length > maxParticles) spatialError("E_SPATIAL_STATE_BUDGET", "Alive spawn range exceeds maxParticles");
        for (let id = aliveFirst; id <= end; id++) {
          const p = birth(id);
          advance(p, Math.max(0, time - p.birthTime));
        }
        emitted = Math.max(emitted, Math.min(last + 1, end + 1));
      }
      budget(particles, contacts);
      state = { step, particles, contacts, emitted };
      if (Math.abs(time - previous - dt) > 1e-8 * Math.max(1, time)) spatialError("E_SPATIAL_TIME", "Inconsistent fixed step");
    },
    snapshot() {
      return state;
    },
    restore(value) {
      state = value;
    }
  };
  const runner = new FixedStepRunner(sim, { fps: hz, checkpointInterval: integer(b.checkpointInterval ?? 30, "checkpointInterval"), maxCheckpoints, maxSteps: integer(b.maxReplaySteps ?? 1e6, "maxReplaySteps") });
  return {
    sample(context) {
      const frame = finite(context.frame, "frame", 0), step = frame * substeps;
      if (!Number.isSafeInteger(step) || context.fps.num * fps.den !== fps.num * context.fps.den || Math.abs(context.time - frame * fps.den / fps.num) > 1e-9 * Math.max(1, Math.abs(context.time))) spatialError("E_SPATIAL_TIME", "Frame/time/fps must agree and frame must align with the configured fixed substeps");
      if (failed) spatialError("E_SPATIAL_SIMULATION_FAILED", "A failed fixed step requires reset before retry");
      try {
        return { ...runner.seek(step), frame, time: context.time, fps: { ...fps }, seed: seed2 };
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    reset() {
      runner.reset();
      failed = false;
    },
    get checkpointSteps() {
      return runner.checkpointFrames;
    }
  };
}
export {
  createFeedbackParticles,
  finite,
  integer,
  particleAcceleration,
  spatialError,
  vector
};
/**
 * @description FastNoise Lite is an extremely portable open source noise generation library with a large selection of noise algorithms
 * @author Jordan Peck, snowfoxsh
 * @version 1.1.1
 * @copyright Copyright(c) 2023 Jordan Peck, Contributors
 * @license MIT
 * @git https://github.com/Auburn/FastNoiseLite
 * @npm https://www.npmjs.com/package/fastnoise-lite
 * @example
// Import from npm (if you used npm)

import FastNoiseLite from "fastnoise-lite";

// Create and configure FastNoiseLite object

let noise = new FastNoiseLite();
noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);

// Gather noise data
let noiseData = [];

for (let x = 0; x < 128; x++) {
    noiseData[x] = [];

    for (let y = 0; y < 128; y++) {        
        noiseData[x][y] = noise.GetNoise(x,y);
    }
}

// Do something with this data...
 */
