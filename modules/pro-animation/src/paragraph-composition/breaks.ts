// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
export interface LineCandidate {cost:number;fitness:0|1|2|3;hyphenated:boolean;feasible:boolean}
export interface ParagraphBreakOptions {linePenalty?:number;fitnessPenalty?:number;consecutiveHyphenPenalty?:number;signal?:AbortSignal}
/** Dynamic programming over measured, context-sensitive line candidates. Unlike
 * additive box/glue APIs, measure may reshape the WHOLE original-source line.
 * One best prefix per (boundary,fitness,hyphen) is sufficient: all future costs
 * depend only on that state. Exact for this declared candidate/cost model. */
export async function optimizeParagraphBreaks(boundaries:readonly number[],measure:(start:number,end:number,last:boolean)=>Promise<LineCandidate>,options:ParagraphBreakOptions={}){
 const points=[...boundaries],{signal}=options,linePenalty=options.linePenalty??1,fitnessPenalty=options.fitnessPenalty??4,hyphenPenalty=options.consecutiveHyphenPenalty??20;
 if(points.length<2||points.some((v,i)=>!Number.isSafeInteger(v)||v<0||i>0&&v<=points[i-1])||![linePenalty,fitnessPenalty,hyphenPenalty].every(v=>Number.isFinite(v)&&v>=0)||typeof measure!=='function')throw new EngineError('E_PA_COMPOSE_PARAMETER','Strictly ordered source boundaries and finite nonnegative break costs required');
 type State={at:number;fitness:number;hyphenated:boolean;cost:number;previous?:State;lines:number};
 const states=new Map<number,Map<string,State>>([[points[0],new Map([['start',{at:points[0],fitness:-1,hyphenated:false,cost:0,lines:0}]])]]);let edges=0;
 for(let j=1;j<points.length;j++){
  const end=points[j],next=new Map<string,State>();
  for(let i=0;i<j;i++){
   signal?.throwIfAborted();const start=points[i],before=states.get(start);if(!before?.size)continue;
   const line=await measure(start,end,j===points.length-1);edges++;
   if(!Number.isFinite(line.cost)||line.cost<0||!Number.isInteger(line.fitness)||line.fitness<0||line.fitness>3)throw new EngineError('E_PA_COMPOSE_COST','Measured line cost/fitness is invalid');
   if(!line.feasible)continue;
   const key=line.fitness+':'+Number(line.hyphenated);
   for(const previous of before.values()){
    const cost=previous.cost+line.cost+linePenalty+(previous.fitness>=0&&Math.abs(previous.fitness-line.fitness)>1?fitnessPenalty:0)+(previous.hyphenated&&line.hyphenated?hyphenPenalty:0);
    if(!Number.isFinite(cost))throw new EngineError('E_PA_COMPOSE_COST','Paragraph cost exceeds Float64 range');
    const old=next.get(key);if(!old||cost<old.cost)next.set(key,{at:end,fitness:line.fitness,hyphenated:line.hyphenated,cost,previous,lines:previous.lines+1});
   }
  }states.set(end,next);
 }
 let best:State|undefined;for(const state of states.get(points.at(-1)!)?.values()??[])if(!best||state.cost<best.cost)best=state;
 if(!best)throw new EngineError('E_PA_COMPOSE_UNBREAKABLE','No feasible complete paragraph under the requested spacing/overflow policy');
 const breaks:number[]=[];let state:State|undefined=best;while(state?.previous){breaks.push(state.at);state=state.previous;}breaks.reverse();
 return Object.freeze({breaks:Object.freeze(breaks),cost:best.cost,lineCount:best.lines,measuredEdges:edges,optimality:'exact over supplied boundaries and measured costs' as const});
}
