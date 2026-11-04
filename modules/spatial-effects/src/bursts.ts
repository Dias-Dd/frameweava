// SPDX-License-Identifier: Apache-2.0
import {spatialError,finite,integer} from './checks.ts';
/** Event-only birth planning. The existing FixedStepRunner still owns all stepping. */
export function prepareBirthPlan(rate:number,start:number,duration:number,lifetime:number,source:readonly {time:number;count:number}[]){
  if(!Array.isArray(source))spatialError('E_SPATIAL_PARAMETER','bursts must be an array');
  const bursts=source.map((b,i)=>{if(!b||Object.keys(b).some(k=>!['time','count'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Invalid burst');return {time:finite(b.time,'burst time',0),count:integer(b.count,'burst count',0),order:i};}).sort((a,b)=>a.time-b.time||a.order-b.order);
  let prefix=0,window=0,first=0,maxWindow=0;const sums:number[]=[];for(let i=0;i<bursts.length;i++){const b=bursts[i];prefix+=b.count;if(!Number.isSafeInteger(prefix))spatialError('E_SPATIAL_STATE_BUDGET','Burst count sum exceeds safe integer identities');sums.push(prefix);window+=b.count;while(first<i&&bursts[first].time<=b.time-lifetime)window-=bursts[first++].count;maxWindow=Math.max(maxWindow,window);}
  const end=rate>0&&duration>0?Math.ceil(duration*rate):0;
  function continuous(time:number){if(rate===0||duration===0||time<start)return 0;let n=Math.min(Math.floor((time-start)*rate)+1,end);if(!Number.isSafeInteger(n)||n<0)spatialError('E_SPATIAL_STATE_BUDGET','Continuous birth identity is not representable');while(n&&start+(n-1)/rate>time)n--;while(n<end&&start+n/rate<=time){n++;if(!Number.isSafeInteger(n))spatialError('E_SPATIAL_STATE_BUDGET','Birth identity overflow');}return n;}
  function burstCount(time:number,strict=false){let lo=0,hi=bursts.length;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(strict?bursts[mid].time<time:bursts[mid].time<=time)lo=mid+1;else hi=mid;}return lo?sums[lo-1]:0;}
  const count=(time:number)=>{const n=continuous(time)+burstCount(time);if(!Number.isSafeInteger(n))spatialError('E_SPATIAL_STATE_BUDGET','Combined birth identity exceeds safe integer');return n;};
  function births(previous:number,time:number,max:number,includeExpired=false){const a=continuous(previous),b=continuous(time),events:{id:number;time:number}[]=[];let firstRate=a;
    if(rate>0&&!includeExpired)firstRate=Math.max(a,Math.floor((time-lifetime-start)*rate)+1);
    const aliveBursts=bursts.filter(e=>e.time>previous&&e.time<=time&&(includeExpired||time-e.time<lifetime)),amount=Math.max(0,b-firstRate)+aliveBursts.reduce((n,e)=>n+e.count,0);if(amount>max)spatialError('E_SPATIAL_STATE_BUDGET','Births exceed the configured particle/spawn budget');
    for(let i=firstRate;i<b;i++){const t=start+i/rate;if(includeExpired||time-t<lifetime)events.push({id:i+burstCount(t,true),time:t});}
    let prior=0;for(const e of bursts){if(e.time>previous&&e.time<=time&&(includeExpired||time-e.time<lifetime)){const base=continuous(e.time)+prior;for(let i=0;i<e.count;i++)events.push({id:base+i,time:e.time});}prior+=e.count;}
    events.sort((a,b)=>a.time-b.time||a.id-b.id);for(const e of events)integer(e.id,'birth id',0);return events;
  }
  return {maxConcurrentBursts:maxWindow,count,births};
}
