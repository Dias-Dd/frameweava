import {EngineError} from '../../src/core/errors.ts';
import {frameToSeconds,hashString} from '../../src/core/time.ts';
import type {FrameContext,StageSpec,TVG} from '../../src/core/types.ts';
/** Internal subframe context only. Public frameContext/Renderer integer admission is unchanged. */
export function temporalFrameContext(tvg:TVG,stage:StageSpec,globalFrame:number):FrameContext {
 if(!Number.isFinite(globalFrame)||globalFrame<0||globalFrame>=tvg.composition.durationInFrames||globalFrame<stage.time.start||globalFrame>=stage.time.start+stage.time.duration)throw new EngineError('E_NATIVE_TEMPORAL_RANGE','Sample lies outside the declared composition/producer interval',{stageId:stage.id,details:{globalFrame}});
 const {fps,seed}=tvg.composition,{start,offset,rate,duration}=stage.time,frame=offset+(globalFrame-start)*rate.num/rate.den;
 return {frame,globalFrame,time:frameToSeconds(frame,fps),globalTime:frameToSeconds(globalFrame,fps),dt:frameToSeconds(rate.num/rate.den,fps),fps,durationInFrames:duration,progress:duration<=1?0:(globalFrame-start)/(duration-1),seed:(seed^hashString(stage.id))>>>0};
}
export function temporalGlobalFrame(consumer:StageSpec,context:Readonly<FrameContext>,clock:'consumer-local'|'composition'){
 const f=clock==='composition'?context.globalTime*context.fps.num/context.fps.den:consumer.time.start+(context.time*context.fps.num/context.fps.den-consumer.time.offset)*consumer.time.rate.den/consumer.time.rate.num;
 if(!Number.isFinite(f))throw new EngineError('E_NATIVE_TEMPORAL_CONTEXT','Source time mapping is not invertible');return f;
}
