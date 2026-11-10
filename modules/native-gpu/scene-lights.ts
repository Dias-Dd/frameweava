import {EngineError} from '../../src/core/errors.ts';
import type {SceneRgb,SceneTransform} from './scene.ts';

export interface SceneEmitter {
  instance: number;
  node: string;
  radiance: SceneRgb;
  positions: Float32Array;
  indices: Uint32Array;
}

const recordWords = 16;
const luminance = ([r,g,b]: SceneRgb) => .2126 * r + .7152 * g + .0722 * b;

function point(vertices: Float32Array, vertex: number, m: SceneTransform): SceneRgb {
  const i = vertex * 3;
  const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
  return [
    Math.fround(m[0]*x + m[1]*y + m[2]*z + m[3]),
    Math.fround(m[4]*x + m[5]*y + m[6]*z + m[7]),
    Math.fround(m[8]*x + m[9]*y + m[10]*z + m[11]),
  ];
}
function difference(a: SceneRgb, b: SceneRgb): SceneRgb {
  return [Math.fround(a[0]-b[0]), Math.fround(a[1]-b[1]), Math.fround(a[2]-b[2])];
}
function triangleArea(a: SceneRgb, b: SceneRgb) {
  return Math.fround(.5 * Math.hypot(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]));
}

/** Exact GPU-visible source IDs, world triangles, and a Float32 CDF. */
export function emitterTable(emitters: readonly SceneEmitter[], instanceCount: number,
    world: ReadonlyMap<string, SceneTransform>, maxBytes: number) {
  const triangles = emitters.reduce((sum, emitter) => sum + emitter.indices.length / 3, 0);
  const length = 2 + instanceCount + triangles * recordWords;
  const fail = (message: string): never => { throw new EngineError('E_NATIVE_PATH_LIGHTS', message); };
  if (!Number.isSafeInteger(length) || length * 4 > maxBytes || length > 0xffffffff)
    fail('Emissive triangle sampling exceeds the device binding budget');
  const data = new Uint32Array(length), floats = new Float32Array(data.buffer);
  const first = 2 + instanceCount;
  data.set([triangles, first]);
  let record = 0, total = 0;
  const weights = new Float64Array(triangles);
  for (const source of emitters) {
    data[2 + source.instance] = record + 1;
    const matrix = world.get(source.node)!;
    const brightness = luminance(source.radiance);
    for (let i = 0; i < source.indices.length; i += 3) {
      const a = point(source.positions,source.indices[i],matrix);
      const e = difference(point(source.positions,source.indices[i+1],matrix),a);
      const f = difference(point(source.positions,source.indices[i+2],matrix),a);
      const area = triangleArea(e,f), at = first + record * recordWords;
      if (![...a,...e,...f,area].every(Number.isFinite))
        fail('Emissive triangle coordinates or area cannot be represented on the GPU');
      floats.set(a,at); floats.set(e,at+4); floats.set(f,at+8);
      floats[at+7] = area;
      data[at+12] = source.instance;
      data[at+13] = i/3;
      total += weights[record++] = area * brightness;
    }
  }
  if (total === 0) { data[0] = 0; return data; }
  let accumulated = 0, last = 0;
  for (let i = 0; i < triangles; i++) {
    const at = first + i * recordWords;
    accumulated += weights[i];
    const cdf = Math.fround(accumulated / total);
    floats[at+3] = cdf;
    floats[at+11] = cdf - last;
    last = cdf;
  }
  return data;
}
