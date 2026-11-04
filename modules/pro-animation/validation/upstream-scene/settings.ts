import type {FrameContext} from '../../../../src/core/types.ts';
export const methods=['retime','frameBlend','echo','trails','shutterBlur','wideTime','posterize','strobe','timeCrossfade','timeDifference'] as const;
export type Method=typeof methods[number];
export function options(method:Method,c:FrameContext,format:'rgba16float'|'rgba32float'){
 const dt=c.fps.den/c.fps.num,common={format};switch(method){
 case 'retime':return {...common,time:c.time+dt/2};
 case 'frameBlend':return {...common,time:c.time+dt/2,fps:c.fps};
 case 'echo':return {...common,echoes:2,interval:-dt,intensity:.8,decay:.5,mode:'in-front'};
 case 'trails':return {...common,duration:dt,count:3,falloff:'linear',mode:'weighted-mean'};
 case 'shutterBlur':return {...common,count:3,angleDegrees:360};
 case 'wideTime':return {...common,before:dt/2,after:dt/2,count:3,weight:'triangle'};
 case 'posterize':return {...common,rate:12};
 case 'strobe':return {...common,period:3*dt,onDuration:dt};
 case 'timeCrossfade':return {...common,progress:.4,fromTime:c.time,toTime:c.time+dt};
 case 'timeDifference':return {...common,offset:-dt,opacity:.8,mode:'absolute'};
 }
}
