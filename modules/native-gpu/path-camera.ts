import type {FrameContext} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {cameraParameters} from './scene-render.ts';

/** Physical lens dimensions in the scene's meter coordinate system. */
export interface NativePathLens {
  /** Pupil radius, not diameter. Zero preserves a pinhole. */
  apertureRadius:number;
  /** Distance to the sharp plane along camera forward, not ray length. */
  focusDistance:number;
}
export function pathCameraParameters(frame:Parameters<typeof cameraParameters>[0],width:number,height:number,
  context:FrameContext,lens:NativePathLens|((context:FrameContext)=>NativePathLens)) {
  const value=typeof lens==='function'?lens(context):lens;
  if(!value || !Number.isFinite(Math.fround(value.apertureRadius)) || value.apertureRadius<0 ||
    !Number.isFinite(Math.fround(value.focusDistance)) || Math.fround(value.focusDistance)<=0)
    throw new EngineError('E_NATIVE_PATH_LENS','Lens requires a finite nonnegative aperture radius and a positive focus distance');
  if(value.apertureRadius>0 && frame.camera.projection!=='perspective')
    throw new EngineError('E_NATIVE_PATH_LENS','A physical thin lens requires a perspective camera');
  const base=cameraParameters(frame,width,height),words=new Float32Array(28);
  words.set(base.words);words[24]=value.apertureRadius;words[25]=value.focusDistance;
  return {words,far:base.far};
}

/** Midpoint box shutter in Stage-local frames. No simulation stepping or history. */
export interface NativePathShutter {
  /** Exposure in local frames * 360; zero is an instantaneous shutter. */
  angleDegrees:number;
  /** Equal-weight scene poses per exposure; must divide camera sample count. */
  timeSamples:number;
}
export function pathShutterContexts(context:FrameContext,samples:number,shutter?:NativePathShutter):FrameContext[] {
  if(!shutter)return [context];
  const {angleDegrees:angle,timeSamples:count}=shutter;
  if(!Number.isFinite(angle)||angle<0||!Number.isSafeInteger(count)||count<1||count>samples||samples%count!==0)
    throw new EngineError('E_NATIVE_PATH_SHUTTER','Require a nonnegative finite shutter angle and equal-weight time samples dividing camera samples');
  if(angle===0)return [context];
  if(!Number.isFinite(context.dt)||context.dt===0)
    throw new EngineError('E_NATIVE_PATH_SHUTTER','Shutter requires a nonzero affine Stage time mapping');
  const frameSeconds=context.fps.den/context.fps.num;
  return Array.from({length:count},(_,index)=>{
    const offset=((index+.5)/count-.5)*angle/360,seconds=offset*frameSeconds,delta=seconds/context.dt;
    const time=context.time+seconds,globalTime=context.globalTime+delta*frameSeconds;
    if(!Number.isFinite(time)||!Number.isFinite(globalTime)||seconds!==0&&time===context.time)
      throw new EngineError('E_NATIVE_PATH_SHUTTER','Shutter sample is outside finite time resolution');
    return {...context,time,frame:context.frame+offset,globalFrame:context.globalFrame+delta,globalTime,
      progress:context.durationInFrames<=1?0:context.progress+delta/(context.durationInFrames-1)};
  });
}
