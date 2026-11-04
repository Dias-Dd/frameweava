import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import {fields,fail,type ImageEffectOptions} from './parameters.ts';

export type RepeatMode='repeat'|'mirror';
/** Integer point-sampled repetition; mirror duplicates edge texels. */
export interface TileOptions extends ImageEffectOptions {
 width?:Signal<number>;height?:Signal<number>;offset?:readonly [Signal<number>,Signal<number>];mode?:RepeatMode;
}
export interface ResolvedTile {width:number;height:number;offset:readonly [number,number];mode:RepeatMode}
export function resolveTile(defaults:{width:number;height:number},options:TileOptions={},ctx?:FrameContext){
 fields(options,['width','height','offset','mode','workingColor','format','alpha','maxBufferBytes','signal'],'tile');
 if(options.mode!==undefined&&options.mode!=='repeat'&&options.mode!=='mirror')fail('E_GPU_IMAGE_PARAMETER','tile.mode must be repeat or mirror');
 if(options.offset!==undefined&&(!Array.isArray(options.offset)||options.offset.length!==2))fail('E_GPU_IMAGE_PARAMETER','tile.offset requires [x,y] integer source pixels');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const integer=(raw:Signal<number>|undefined,fallback:number,name:string)=>{
  if(raw!==undefined&&typeof raw!=='number'){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('E_GPU_IMAGE_PARAMETER',`${name}: integer or Signal required`);
   if(!ctx)fail('E_GPU_IMAGE_CONTEXT',`${name}: Signal requires FrameContext`);
  }
  const n=raw===undefined?fallback:typeof raw==='number'?raw:evaluate(raw,ctx!);
  if(typeof n!=='number'||!Number.isSafeInteger(n))fail('E_GPU_IMAGE_PARAMETER',`${name}: safe integer required; no implicit rounding`);return n;
 };
 const resolved:ResolvedTile={width:integer(options.width,defaults.width,'width'),height:integer(options.height,defaults.height,'height'),offset:[integer(options.offset?.[0],0,'offset[0]'),integer(options.offset?.[1],0,'offset[1]')],mode:options.mode??'repeat'};
 if(resolved.width<1||resolved.height<1)fail('E_GPU_IMAGE_PARAMETER','Positive tile output dimensions required');
 return {resolved,output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
export interface RepeatSegment {source:number;length:number;target:number;flip:boolean}
export function repeatPeriod(size:number,mode:RepeatMode){return size*(mode==='mirror'?2:1);}
/** Offset is reduced *before* subtraction, avoiding MAX_SAFE_INTEGER overflow. */
export function repeatPhase(position:number,offset:number,period:number){const reduced=offset%period;return ((position-reduced)%period+period)%period;}
/** At most two repeat or three mirror segments; never one layer per texel. */
export function repeatSegments(size:number,phase:number,span:number,mode:RepeatMode):RepeatSegment[]{
 const period=repeatPeriod(size,mode);
 if(![size,phase,span].every(Number.isSafeInteger)||size<1||phase<0||phase>=period||span<1||span>period)fail('E_GPU_IMAGE_PARAMETER','Invalid periodic seed interval');
 const segments:RepeatSegment[]=[];let target=0,q=phase;
 while(target<span){const flip=mode==='mirror'&&q>=size,end=flip?period:size,length=Math.min(span-target,end-q);segments.push({source:flip?period-q-length:q,length,target,flip});target+=length;q=(q+length)%period;}
 return segments;
}
export interface RepeatGrowth {width:number;height:number;axis:'x'|'y';distance:number}
/** Binary expansion: O(log target/period) copies, not O(number of repeats). */
export function repeatGrowth(seedWidth:number,seedHeight:number,width:number,height:number):RepeatGrowth[]{
 if(![seedWidth,seedHeight,width,height].every(Number.isSafeInteger)||seedWidth<1||seedHeight<1||seedWidth>width||seedHeight>height)fail('E_GPU_IMAGE_PARAMETER','Invalid periodic growth dimensions');
 const result:RepeatGrowth[]=[];let w=seedWidth,h=seedHeight;
 while(w<width){result.push({width:Math.min(width,w*2),height:h,axis:'x',distance:w});w=Math.min(width,w*2);}
 while(h<height){result.push({width:w,height:Math.min(height,h*2),axis:'y',distance:h});h=Math.min(height,h*2);}
 return result;
}
