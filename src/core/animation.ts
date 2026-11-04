import type { Easing, Expression, FrameContext, Keyframe, Keyframes, Spring } from './types.js';
import { EngineError } from './errors.js';
import { seededRandom } from './time.js';

export const EXPRESSION_OPERATIONS = new Set(['time','frame','globalTime','globalFrame','progress','add','sub','mul','div','sin','cos','abs','min','max','clamp','pow','floor','ceil','mod','random']);
type Argument = number | Expression;
export function expression(op: string, ...args: Argument[]): Expression { return { $expr: op, args }; }
export const expr = {
  time: expression('time'), frame: expression('frame'), globalTime: expression('globalTime'),
  globalFrame: expression('globalFrame'), progress: expression('progress'),
  add: (...args: Argument[]) => expression('add', ...args), sub: (a: Argument,b: Argument) => expression('sub',a,b),
  mul: (...args: Argument[]) => expression('mul', ...args), div: (a: Argument,b: Argument) => expression('div',a,b),
  sin: (a: Argument) => expression('sin',a), cos: (a: Argument) => expression('cos',a),
  abs: (a: Argument) => expression('abs',a), min: (...args: Argument[]) => expression('min',...args),
  max: (...args: Argument[]) => expression('max',...args), clamp: (a: Argument,min: Argument,max: Argument) => expression('clamp',a,min,max),
  pow: (a: Argument,b: Argument) => expression('pow',a,b), floor: (a: Argument) => expression('floor',a),
  ceil: (a: Argument) => expression('ceil',a), mod: (a: Argument,b: Argument) => expression('mod',a,b),
  random: (salt: Argument = 0) => expression('random',salt)
};
export function keyframes<T extends number | string>(keys: Keyframe<T>[]): Keyframes<T> {
  validateKeyframes(keys); return { $keyframes: keys.map(key => ({ ...key })) };
}
export function spring(options: Partial<Spring['$spring']> & Pick<Spring['$spring'],'from'|'to'>): Spring {
  const result = { from: options.from, to: options.to, start: options.start ?? 0, stiffness: options.stiffness ?? 170,
    damping: options.damping ?? 26, mass: options.mass ?? 1, velocity: options.velocity ?? 0 };
  if (Object.values(result).some(v => !Number.isFinite(v)) || result.mass <= 0 || result.stiffness <= 0 || result.damping < 0)
    throw new EngineError('E_SPRING', 'Spring needs finite parameters, positive mass/stiffness and nonnegative damping.');
  return { $spring: result };
}
export function validateEasing(easing: unknown): void {
  if (easing === undefined || ['linear','step','easeIn','easeOut','easeInOut'].includes(easing as string)) return;
  const points = (easing as { bezier?: number[] })?.bezier;
  if (!Array.isArray(points) || points.length !== 4 || points.some(p => !Number.isFinite(p)) || points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1)
    throw new EngineError('E_EASING', 'Cubic Bezier easing requires four finite values with x control points inside [0,1].');
}
export function validateKeyframes(keys: unknown): asserts keys is Keyframe[] {
  if (!Array.isArray(keys) || !keys.length) throw new EngineError('E_KEYFRAMES', 'A keyframe track must contain at least one key.');
  let previous = -Infinity; let type: string | undefined;
  for (const key of keys) {
    if (!key || !Number.isFinite(key.frame) || key.frame < 0 || key.frame <= previous)
      throw new EngineError('E_KEYFRAMES', 'Keyframes must have finite, nonnegative, strictly increasing frame numbers.');
    if (!(typeof key.value === 'number' && Number.isFinite(key.value)) && typeof key.value !== 'string')
      throw new EngineError('E_KEYFRAMES', 'Keyframe values must be finite numbers or strings.');
    type ??= typeof key.value;
    if (type !== typeof key.value) throw new EngineError('E_KEYFRAMES', 'All values in a keyframe track must have the same type.');
    validateEasing(key.easing); previous = key.frame;
  }
}
const cubic = (p1: number,p2: number,t: number) => 3*(1-t)*(1-t)*t*p1 + 3*(1-t)*t*t*p2 + t*t*t;
export function easingAt(easing: Easing | undefined, t: number): number {
  t = Math.max(0,Math.min(1,t));
  if (!easing || easing === 'linear') return t;
  if (easing === 'step') return t === 1 ? 1 : 0;
  if (easing === 'easeIn') return t*t;
  if (easing === 'easeOut') return 1-(1-t)*(1-t);
  if (easing === 'easeInOut') return t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
  const [x1,y1,x2,y2] = easing.bezier;
  let low = 0, high = 1;
  // Monotone x is guaranteed by the validated CSS-style control point bounds.
  for (let i=0;i<36;i++) { const u=(low+high)/2; if (cubic(x1,x2,u)<t) low=u; else high=u; }
  return cubic(y1,y2,(low+high)/2);
}
type Color = [number,number,number,number];
const named: Record<string,string> = { transparent:'#00000000',black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',blue:'#0000ff',cyan:'#00ffff',magenta:'#ff00ff',yellow:'#ffff00' };
export function parseColor(input: string): Color | undefined {
  const source = named[input.toLowerCase()] ?? input;
  if (/^#[\da-f]{3,4}$/i.test(source)) {
    const values = source.slice(1).split('').map(v=>parseInt(v+v,16)); return [values[0],values[1],values[2],(values[3] ?? 255)/255];
  }
  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(source)) return [parseInt(source.slice(1,3),16),parseInt(source.slice(3,5),16),parseInt(source.slice(5,7),16),source.length===9?parseInt(source.slice(7,9),16)/255:1];
  const match = source.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (match) return [Number(match[1]),Number(match[2]),Number(match[3]),match[4] === undefined?1:Number(match[4])];
  return undefined;
}
function interpolate(a: number|string,b: number|string,t: number): number|string {
  if (typeof a === 'number' && typeof b === 'number') return a+(b-a)*t;
  if (a === b) return a;
  const ca=parseColor(String(a)),cb=parseColor(String(b));
  if (ca && cb) {
    const c=ca.map((v,i)=>v+(cb[i]-v)*t);
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Number(c[3].toFixed(6))})`;
  }
  return t < 1 ? a : b;
}
export function keyframesAt(track: Keyframes, frame: number): number|string {
  const keys=track.$keyframes;
  if (frame<=keys[0].frame) return keys[0].value;
  if (frame>=keys[keys.length-1].frame) return keys[keys.length-1].value;
  let low=0,high=keys.length-1;
  while (high-low>1) { const mid=(low+high)>>1; if (keys[mid].frame<=frame) low=mid; else high=mid; }
  return interpolate(keys[low].value,keys[high].value,easingAt(keys[high].easing,(frame-keys[low].frame)/(keys[high].frame-keys[low].frame)));
}
export function springAt(springValue: Spring, context: FrameContext): number {
  const p=springValue.$spring;
  const t=Math.max(0,(context.frame-p.start)*context.fps.den/context.fps.num);
  const x0=p.from-p.to, w0=Math.sqrt(p.stiffness/p.mass), z=p.damping/(2*Math.sqrt(p.stiffness*p.mass));
  if (z<1-1e-8) { const wd=w0*Math.sqrt(1-z*z); return p.to+Math.exp(-z*w0*t)*(x0*Math.cos(wd*t)+(p.velocity+z*w0*x0)/wd*Math.sin(wd*t)); }
  if (z<=1+1e-8) return p.to+Math.exp(-w0*t)*(x0+(p.velocity+w0*x0)*t);
  const r1=-w0*(z-Math.sqrt(z*z-1)),r2=-w0*(z+Math.sqrt(z*z-1));
  const c1=(p.velocity-r2*x0)/(r1-r2),c2=x0-c1;
  return p.to+c1*Math.exp(r1*t)+c2*Math.exp(r2*t);
}
export function expressionAt(node: Expression, context: FrameContext): number {
  const a=node.args.map(x=>typeof x==='number'?x:expressionAt(x,context));
  let result: number;
  switch (node.$expr) {
    case 'time': result=context.time; break; case 'frame': result=context.frame; break;
    case 'globalTime': result=context.globalTime; break; case 'globalFrame': result=context.globalFrame; break; case 'progress': result=context.progress; break;
    case 'add': result=a.reduce((x,y)=>x+y,0); break; case 'sub': result=a[0]-a[1]; break;
    case 'mul': result=a.reduce((x,y)=>x*y,1); break; case 'div': result=a[0]/a[1]; break;
    case 'sin': result=Math.sin(a[0]); break; case 'cos': result=Math.cos(a[0]); break; case 'abs': result=Math.abs(a[0]); break;
    case 'min': result=Math.min(...a); break; case 'max': result=Math.max(...a); break;
    case 'clamp': result=Math.min(a[2],Math.max(a[1],a[0])); break;
    case 'pow': result=Math.pow(a[0],a[1]); break; case 'floor': result=Math.floor(a[0]); break; case 'ceil': result=Math.ceil(a[0]); break;
    case 'mod': result=a[0]%a[1]; break; case 'random': result=seededRandom(context.seed,context.frame,a[0]??0); break;
    default: throw new EngineError('E_EXPRESSION', `Unsupported expression operation: ${node.$expr}`);
  }
  if (!Number.isFinite(result)) throw new EngineError('E_EXPRESSION', `Expression ${node.$expr} produced a non-finite number.`, { frame: context.globalFrame });
  return result;
}
/** Recursively evaluate JSON signals, preserving ordinary nested objects. */
export function evaluate<T>(value: T, context: FrameContext): any {
  if (!value || typeof value!=='object') return value;
  if ('$keyframes' in value) return keyframesAt(value as Keyframes,context.frame);
  if ('$expr' in value) return expressionAt(value as unknown as Expression,context);
  if ('$spring' in value) return springAt(value as Spring,context);
  if (Array.isArray(value)) return value.map(item=>evaluate(item,context));
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,evaluate(item,context)]));
}
