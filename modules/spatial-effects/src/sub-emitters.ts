// SPDX-License-Identifier: Apache-2.0
import {FixedStepRunner} from '../../../src/core/simulation.ts';
import {rational,seededRandom} from '../../../src/core/time.ts';
import {linear709,type ColorEncoding} from '../../../src/media/surface.ts';
import {prepareBirthPlan} from './bursts.ts';
import {finite,integer,vector,spatialError} from './checks.ts';
import type {FeedbackParticleOptions,FeedbackParticle,FeedbackParticles,ParticleSnapshot,ParticleContact,Vec3} from './types.ts';

interface Tools {
 fps:{num:number;den:number};seed:number;substeps:number;hz:number;check():void;
 birth(id:number,time:number):FeedbackParticle;plan:ReturnType<typeof prepareBirthPlan>;
 advance(p:FeedbackParticle,interval:number,time:number,query:()=>void):{next:FeedbackParticle;contacts:ParticleContact[]};
 trailPoints:number;trailEvery:number;maxParticles:number;maxValueBytes:number;maxCheckpoints:number;maxEnvironmentQueries:number;appearanceColor?:ColorEncoding;
}
interface Event {kind:'birth'|'collision'|'death';time:number;parent:FeedbackParticle;normal:Vec3;order:number}
/** Internal event heap; it does not own time or simulation snapshots. */
class Events {
 values:Event[]=[];
 before(a:Event,b:Event){return a.time<b.time||a.time===b.time&&(a.parent.id<b.parent.id||a.parent.id===b.parent.id&&a.order<b.order);}
 push(e:Event){let i=this.values.push(e)-1;while(i){const p=(i-1)>>1;if(!this.before(e,this.values[p]))break;this.values[i]=this.values[p];i=p;}this.values[i]=e;}
 pop(){const head=this.values[0],end=this.values.pop()!;if(this.values.length){let i=0;while(i*2+1<this.values.length){let c=i*2+1;if(c+1<this.values.length&&this.before(this.values[c+1],this.values[c]))c++;if(!this.before(this.values[c],end))break;this.values[i]=this.values[c];i=c;}this.values[i]=end;}return head;}
}
/** Uses the existing force/collision operators and the one Core seek runner.
 * Exact event times, stable identity counters and child state are checkpointed. */
export function subEmitterSimulation(o:FeedbackParticleOptions,t:Tools):FeedbackParticles {
 const rules=o.subEmitters!.map(rule=>{
  if(!rule||typeof rule.id!=='string'||!rule.id||Object.keys(rule).some(k=>!['id','on','count','lifetime','maxGeneration','from','velocity','velocityJitter','inheritVelocity','normalSpeed','positionOffset','radius','ink','opacity'].includes(k))||!['birth','collision','death'].includes(rule.on))spatialError('E_SPATIAL_PARAMETER','Invalid sub-emitter rule');
  if(rule.from!==undefined&&(!Array.isArray(rule.from)||rule.from.some(s=>typeof s!=='string'||!s)))spatialError('E_SPATIAL_PARAMETER','Sub-emitter from must list source IDs');
  return {...rule,count:integer(rule.count,'child count',0),lifetime:finite(rule.lifetime,'child lifetime',Number.MIN_VALUE),maxGeneration:integer(rule.maxGeneration??1,'maxGeneration'),velocity:vector(rule.velocity??[0,0,0],'child velocity'),velocityJitter:vector(rule.velocityJitter??[0,0,0],'child jitter',0),inheritVelocity:finite(rule.inheritVelocity??1,'inheritVelocity'),normalSpeed:finite(rule.normalSpeed??0,'normalSpeed'),positionOffset:vector(rule.positionOffset??[0,0,0],'child position offset'),radius:finite(rule.radius??o.radius??.04,'child radius',0),ink:rule.ink?vector(rule.ink,'child ink'):undefined,opacity:rule.opacity===undefined?undefined:finite(rule.opacity,'child opacity',0,1)};
 });
 if(new Set(rules.map(r=>r.id)).size!==rules.length||rules.some(r=>r.id==='root'))spatialError('E_SPATIAL_PARAMETER','Sub-emitter IDs must be unique and distinct from root');
 if(rules.some(r=>r.from?.some(id=>id!=='root'&&!rules.some(other=>other.id===id))))spatialError('E_SPATIAL_PARAMETER','Sub-emitter from references an unknown source');
 const maxSpawns=integer(o.budgets?.maxSpawnsPerStep??t.maxParticles,'maxSpawnsPerStep'),bytes=8*(18+3*t.trailPoints),maxSteps=integer(o.budgets?.maxReplaySteps??1000000,'maxReplaySteps');
 let state:ParticleSnapshot,failed=false;
 function tick(step:number,previous:number,time:number,reset=false){
  const next:ParticleSnapshot={step,particles:[],contacts:[],emitted:t.plan.count(time),nextParticleId:reset?0:state.nextParticleId,subEmitted:reset?0:state.subEmitted,eventSequence:reset?0:state.eventSequence,events:reset||(step-1)%t.substeps===0?[]:[...state.events??[]]};
  const queue=new Events();let order=0,spawns=0,queries=0;
  const query=()=>{if(++queries>t.maxEnvironmentQueries)spatialError('E_SPATIAL_COLLISION_BUDGET','Sub-emitter collision query budget exceeded');};
  const budget=()=>{if(next.particles.length>t.maxParticles||(next.particles.length*bytes+next.contacts.length*144+next.events!.length*64+queue.values.length*(bytes+48))*(t.maxCheckpoints+3)>t.maxValueBytes)spatialError('E_SPATIAL_STATE_BUDGET','Sub-emitter live/contact/event checkpoint budget exceeded');};
  const event=(kind:Event['kind'],time:number,p:FeedbackParticle,normal:Vec3=[0,0,0])=>{queue.push({kind,time,parent:structuredClone(p),normal,order:order++});budget();};
  const reserve=()=>{if(++spawns>maxSpawns)spatialError('E_SPATIAL_STATE_BUDGET','Sub-emitter fan-out exceeds maxSpawnsPerStep');const id=next.nextParticleId!++;integer(id,'stable particle identity',0);return id;};
  function advance(p:FeedbackParticle,from:number){
   const death=p.birthTime+p.lifetime,until=Math.min(time,death),duration=Math.max(0,until-from),result=t.advance(p,duration,from,query);const q=result.next;
   next.contacts.push(...result.contacts);
   for(const contact of result.contacts)event('collision',contact.time,{...p,position:[...contact.point],velocity:[...contact.velocity!]},contact.normal);
   if(death<=time){event('death',death,q);return;}
   if(t.trailPoints&&step%t.trailEvery===0){q.trail.push([...q.position]);if(q.trail.length>t.trailPoints)q.trail.shift();}
   next.particles.push(q);budget();
  }
  if(!reset)for(const p of state.particles)advance(p,previous);
  for(const birth of t.plan.births(reset?-Infinity:previous,time,maxSpawns,true)){const p={...t.birth(birth.id,birth.time),id:reserve(),sourceId:'root',generation:0};event('birth',p.birthTime,p);advance(p,p.birthTime);}
  while(queue.values.length){const e=queue.pop(),p=e.parent;
   for(const rule of rules){if(rule.on!==e.kind||(p.generation??0)>=rule.maxGeneration||rule.from&&!rule.from.includes(p.sourceId??'root'))continue;
    for(let i=0;i<rule.count;i++){
     const id=reserve(),sequence=next.eventSequence!++,random=(salt:number)=>2*seededRandom(t.seed,id,salt)-1;
     const child:FeedbackParticle={id,parentId:p.id,generation:(p.generation??0)+1,sourceId:rule.id,birthTime:e.time,lifetime:rule.lifetime,radius:rule.radius,position:vector(p.position.map((v,k)=>v+rule.positionOffset[k]) as Vec3,'child position'),velocity:vector(rule.velocity.map((v,k)=>v+p.velocity[k]*rule.inheritVelocity+e.normal[k]*rule.normalSpeed+rule.velocityJitter[k]*random(k)) as Vec3,'child velocity'),trail:[],...(rule.ink||p.ink?{ink:[...(rule.ink??p.ink!)] as Vec3}:{}),...(rule.opacity!==undefined||p.opacity!==undefined?{opacity:rule.opacity??p.opacity}:{})};
     next.events!.push({sequence,time:e.time,kind:e.kind,parentId:p.id,childId:id,sourceId:rule.id,generation:child.generation!});next.subEmitted!++;budget();event('birth',child.birthTime,child);advance(child,child.birthTime);
    }
   }
  }
  next.particles.sort((a,b)=>a.id-b.id);budget();state=next;
 }
 const runner=new FixedStepRunner<ParticleSnapshot>({reset(){tick(0,0,0,true);},step(_dt,step){tick(step,(step-1)/t.hz,step/t.hz);},snapshot:()=>state,restore:s=>{state=s;}},{fps:t.hz,checkpointInterval:integer(o.budgets?.checkpointInterval??30,'checkpointInterval'),maxCheckpoints:t.maxCheckpoints,maxSteps});
 return {sample(c){t.check();const fps=rational(c.fps),step=c.frame*t.substeps;if(fps.num!==t.fps.num||fps.den!==t.fps.den||!Number.isSafeInteger(step)||step<0||Math.abs(c.time-c.frame*fps.den/fps.num)>1e-9*Math.max(1,Math.abs(c.time)))spatialError('E_SPATIAL_TIME','Sub-emitter context must match fixed step/fps');if(failed)spatialError('E_SPATIAL_SIMULATION_FAILED','Reset after a failed event step');try{return {...runner.seek(step),frame:c.frame,time:c.time,fps:{...fps},seed:t.seed,appearanceColor:structuredClone(t.appearanceColor??linear709)};}catch(e){failed=true;throw e;}},reset(){t.check();runner.reset();failed=false;},get checkpointSteps(){return runner.checkpointFrames;}};
}
