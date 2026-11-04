import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';

export type ColorEffect={kind:'color';saturation?:Signal<number>;gain?:readonly [Signal<number>,Signal<number>,Signal<number>]};
/** radius is the integer spacing between the five taps, in physical pixels. */
export type BlurEffect={kind:'blur';radius?:Signal<number>};
export type GlowEffect={kind:'glow';radius?:Signal<number>;threshold?:Signal<number>;intensity?:Signal<number>};
export type GpuEffect=ColorEffect|BlurEffect|GlowEffect;
export type EffectSource=readonly GpuEffect[]|((context:FrameContext)=>readonly GpuEffect[]);
export type ResolvedEffect={kind:'color';saturation:number;gain:readonly [number,number,number]}|{kind:'blur';radius:number}|{kind:'glow';radius:number;threshold:number;intensity:number};
export type BackendPreference='auto'|'webgpu'|'webgl2';
export type ImageInput=HTMLCanvasElement|ImageBitmap;

export class GpuEffectsError extends Error {
  constructor(readonly code:string,message:string){super(`[${code}] ${message}`);this.name='GpuEffectsError';}
}
export function fail(code:string,message:string):never{throw new GpuEffectsError(code,message);}
function number(value:unknown,defaultValue:number,min:number,max:number,name:string,integer=false):number {
  if(value===undefined)return defaultValue;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))
    fail('E_GPU_PARAMETERS',`${name} must be ${integer?'an integer':'finite'} in [${min}, ${max}]`);
  return value;
}
export function resolveEffects(source:EffectSource,context:FrameContext):ResolvedEffect[] {
  const effects:unknown=evaluate(typeof source==='function'?source(context):source,context);
  if(!Array.isArray(effects))fail('E_GPU_PARAMETERS','Expected an effects array');
  return effects.map((value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))fail('E_GPU_PARAMETERS','Expected an effect object');
    const e=value as Record<string,unknown>;
    const keys=e.kind==='color'?['kind','saturation','gain']:e.kind==='blur'?['kind','radius']:e.kind==='glow'?['kind','radius','threshold','intensity']:[];
    if(!keys.length||Object.keys(e).some(k=>!keys.includes(k)))fail('E_GPU_PARAMETERS','Unknown effect kind or parameter');
    if(e.kind==='color'){
      const gain=e.gain??[1.08,.96,1.02];
      if(!Array.isArray(gain)||gain.length!==3)fail('E_GPU_PARAMETERS','gain must have three components');
      return {kind:'color',saturation:number(e.saturation,1.1,0,4,'saturation'),gain:gain.map(v=>number(v,1,0,4,'gain')) as [number,number,number]};
    }
    const radius=number(e.radius,1,0,32,'radius',true);
    return e.kind==='blur'?{kind:'blur',radius}:{kind:'glow',radius,threshold:number(e.threshold,.35,0,1,'threshold'),intensity:number(e.intensity,.7,0,4,'intensity')};
  });
}
export function dimensions(width:number,height:number,maxPixels=4194304):void {
  if(!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>16777216||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>maxPixels)
    fail('E_GPU_SIZE','Expected positive integer dimensions within the explicit pixel budget (default 4MP, opt-in ceiling 16MP)');
}
