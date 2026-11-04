import type {FrameContext} from '../../../../src/core/types.ts';
import * as t from '../../src/native-time/plans.ts';
export function planTrace(c:FrameContext){const dt=c.fps.den/c.fps.num;return {
 sourceTimeContext:t.sourceTimeContext(c,c.time+dt/2),shutterTimeContext:t.shutterTimeContext(c,c.time+dt/2),
 resolveTimeRange:t.resolveTimeRange(-dt,{start:0,end:1,boundary:'clamp'}),
 frameBlendSamples:[...t.frameBlendSamples({time:c.time+dt/2},c)],
 echoSamples:[...t.echoSamples({echoes:2,interval:-dt,decay:.5},c)],
 trailSamples:[...t.trailSamples({duration:dt,count:3},c)],
 wideTimeSamples:[...t.wideTimeSamples({before:dt/2,after:dt/2,count:3,weight:'triangle'},c)],
 shutterTimeSamples:[...t.shutterTimeSamples({count:3,angleDegrees:360},c)],
 freezeTimeRange:t.freezeTimeRange(c.time,{start:0,end:.125,after:'resume'}),
 reverseTimeRange:t.reverseTimeRange(c.time,{start:0,end:.25}),
 jitterTime:t.jitterTime(c.time,{amplitude:dt,frequency:12,seed:5}),
 strobeTime:t.strobeTime(c.time,{period:3*dt,onDuration:dt}),
 };}
