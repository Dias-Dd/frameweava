import type { FrameContext, Rational, StageSpec, TVG } from './types.js';
import { EngineError } from './errors.js';

export function rational(value: number | Rational): Rational {
  const rate = typeof value === 'number' ? { num: value, den: 1 } : value;
  if (!Number.isSafeInteger(rate.num) || !Number.isSafeInteger(rate.den) || rate.den <= 0 || rate.num <= 0)
    throw new EngineError('E_TIME', 'A frame rate must be a positive integer or a positive rational {num, den}.');
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(rate.num, rate.den);
  return { num: rate.num / divisor, den: rate.den / divisor };
}
export function frameToSeconds(frame: number, fps: Rational): number { return frame * fps.den / fps.num; }
export function secondsToFrame(seconds: number, fps: Rational): number {
  if (!Number.isFinite(seconds)) throw new EngineError('E_TIME', 'Time must be finite.');
  return Math.round(seconds * fps.num / fps.den);
}
export function isActive(stage: StageSpec, globalFrame: number): boolean {
  return globalFrame >= stage.time.start && globalFrame < stage.time.start + stage.time.duration;
}
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
/** Stateless random value: identical seed/frame/salt always produces the same number. */
export function seededRandom(seed: number, frame = 0, salt: number | string = 0): number {
  let x = hashString(`${seed}|${frame}|${salt}`);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export function frameContext(tvg: TVG, stage: StageSpec, globalFrame: number): FrameContext {
  if (!Number.isInteger(globalFrame) || globalFrame < 0 || globalFrame >= tvg.composition.durationInFrames)
    throw new EngineError('E_FRAME_RANGE', `Frame ${globalFrame} is outside [0, ${tvg.composition.durationInFrames}).`, { frame: globalFrame });
  const { fps, seed } = tvg.composition;
  const { start, offset, rate, duration } = stage.time;
  const frame = offset + (globalFrame - start) * rate.num / rate.den;
  return { frame, globalFrame, time: frameToSeconds(frame, fps), globalTime: frameToSeconds(globalFrame, fps),
    dt: frameToSeconds(rate.num / rate.den, fps), fps, durationInFrames: duration,
    progress: duration <= 1 ? 0 : (globalFrame - start) / (duration - 1),
    seed: (seed ^ hashString(stage.id)) >>> 0 };
}
/** Composition-time context, useful for layer transforms. */
export function compositionContext(tvg: TVG, globalFrame: number): FrameContext {
  return frameContext(tvg, { id: '$composition', time: { start: 0, duration: tvg.composition.durationInFrames,
    offset: 0, rate: { num: 1, den: 1 } } } as StageSpec, globalFrame);
}
