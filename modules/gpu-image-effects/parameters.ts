import {EngineError} from '../../src/core/errors.ts';
import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {FloatPixelPass,FloatPixelPassOptions} from '../gpu-effects/index.ts';

export interface ImageEffectOptions extends FloatPixelPassOptions {signal?:AbortSignal}
export interface BlurOptions extends ImageEffectOptions {radius?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface GlowOptions extends BlurOptions {threshold?:Signal<number>;intensity?:Signal<number>}
export function fail(code:string,message:string):never{throw new EngineError(code,message);}
export function fields(value:unknown,allowed:readonly string[],path:string):void{
 if(!value||typeof value!=='object'||Array.isArray(value))fail('E_GPU_IMAGE_PARAMETER',`${path}: expected an options object`);
 for(const key of Object.keys(value))if(!allowed.includes(key))fail('E_GPU_IMAGE_PARAMETER',`${path}.${key}: unknown option`);
}
function scalar(value:Signal<number>|undefined,fallback:number,name:string,max:number,context?:FrameContext){
 if(value!==undefined&&typeof value!=='number'&&!context)fail('E_GPU_IMAGE_CONTEXT',`${name}: a Signal requires the existing FrameContext`);
 const result=value===undefined?fallback:typeof value==='number'?value:evaluate(value,context!);
 if(typeof result!=='number'||!Number.isFinite(result)||result<0||result>max)fail('E_GPU_IMAGE_PARAMETER',`${name}: expected a finite number in [0,${max}]`);return result;
}
/** Preserve the qualified existing Pixel Pass domain; no new animation evaluator. */
export function resolveEffect(kind:'gaussian'|'glow',options:BlurOptions|GlowOptions={},context?:FrameContext):{pass:FloatPixelPass;output:FloatPixelPassOptions;signal?:AbortSignal}{
 fields(options,['radius','boundary','workingColor','format','alpha','maxBufferBytes','signal',...kind==='glow'?['threshold','intensity']:[]],kind);
 if(options.boundary!==undefined&&options.boundary!=='transparent'&&options.boundary!=='clamp')fail('E_GPU_IMAGE_PARAMETER','boundary must be transparent or clamp');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const radius=scalar(options.radius,kind==='glow'?8:1,'radius (sigma px)',64,context),base={radius,boundary:options.boundary??'transparent' as const};
 const pass:FloatPixelPass=kind==='gaussian'?{kind,...base}:{kind,...base,threshold:scalar((options as GlowOptions).threshold,1,'threshold',1e6,context),intensity:scalar((options as GlowOptions).intensity,1,'intensity',100,context)};
 return {pass,output:Object.fromEntries(['workingColor','format','alpha','maxBufferBytes'].filter(key=>options[key as keyof ImageEffectOptions]!==undefined).map(key=>[key,options[key as keyof ImageEffectOptions]])),signal:options.signal};
}

export interface Tile {x:number;y:number;width:number;height:number;readX:number;readY:number;readWidth:number;readHeight:number}
export interface TilePlan {width:number;height:number;halo:number;tilePixels:number;stepX:number;stepY:number;count:number}
/** A bounded *per-owner* allocation, never a limit on total image area or work. */
export function planTiles(width:number,height:number,halo:number,tilePixels:number):TilePlan{
 for(const [key,value,min]of [['width',width,1],['height',height,1],['halo',halo,0],['tilePixels',tilePixels,1]] as const)if(!Number.isSafeInteger(value)||value<min)fail('E_GPU_IMAGE_BUDGET',`${key}: expected a safe integer >= ${min}`);
 const side=Math.floor(Math.sqrt(tilePixels)),w=Math.min(width,side),h=Math.min(height,Math.floor(tilePixels/w),Math.max(side,2*halo+1));
 const stepX=width<=w?width:w-2*halo,stepY=height<=h?height:h-2*halo;
 if(stepX<1||stepY<1)fail('E_GPU_IMAGE_BUDGET','The tile budget cannot hold the Gaussian neighborhood; increase the explicit budget');
 return {width,height,halo,tilePixels,stepX,stepY,count:Math.ceil(width/stepX)*Math.ceil(height/stepY)};
}
export function* tiles(plan:TilePlan):Generator<Tile>{
 for(let y=0;y<plan.height;y+=plan.stepY)for(let x=0;x<plan.width;x+=plan.stepX){
  const width=Math.min(plan.stepX,plan.width-x),height=Math.min(plan.stepY,plan.height-y),readX=Math.max(0,x-plan.halo),readY=Math.max(0,y-plan.halo);
  yield {x,y,width,height,readX,readY,readWidth:Math.min(plan.width,x+width+plan.halo)-readX,readHeight:Math.min(plan.height,y+height+plan.halo)-readY};
 }
}
