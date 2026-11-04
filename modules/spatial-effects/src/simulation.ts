import {prepareBirthPlan} from './bursts.ts';
import {subEmitterSimulation} from './sub-emitters.ts';
import {assertColor} from '../../../src/media/surface.ts';
import {FixedStepRunner} from '../../../src/core/simulation.ts';
import {rational, seededRandom} from '../../../src/core/time.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {Vec3,ParticleCollider,ParticleForce,FeedbackParticleOptions,FeedbackParticle,ParticleSnapshot,ParticleContact,FeedbackParticles,FeedbackParticleTools,ParticleCollisionEnvironment} from './types.ts';
import {spatialError,finite,integer,vector} from './checks.ts';
import {createNoise} from './noise.ts';
export {spatialError,finite,integer,vector} from './checks.ts';
type PreparedForce=Exclude<ParticleForce,{kind:'curl'}>|{kind:'curl';field:ReturnType<typeof createNoise>;strength:number;epsilon?:number;motion:Vec3};
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add=(a:Vec3,b:Vec3,scale=1)=>a.map((v,i)=>v+b[i]*scale) as Vec3;
const norm=(v:Vec3)=>Math.hypot(...v);
function unit(v:Vec3):Vec3 {const n=norm(v);if(!n||!Number.isFinite(n))spatialError('E_SPATIAL_PARAMETER','A nonzero finite axis is required');return v.map(x=>x/n) as Vec3;}

/** SI-valued built-in force operators. No wall-clock, author callback or ambient random state. */
function computeAcceleration(position:Vec3,velocity:Vec3,forces:readonly PreparedForce[],time:number):Vec3 {
  let a:Vec3=[0,0,0];
  for(const f of forces){
    if(f.kind==='acceleration')a=add(a,f.value);
    else if(f.kind==='drag')a=add(a,velocity,-f.coefficient);
    else if(f.kind==='curl')a=add(a,f.field.curl3(add(position,f.motion,time),f.epsilon),f.strength);
    else {const r=add(position,f.center,-1),soft=f.softening??.1;
      if(f.kind==='attractor')a=add(a,r,-f.strength/(dot(r,r)+soft*soft)**1.5);
      else {const axis=f.axis,cross:Vec3=[axis[1]*r[2]-axis[2]*r[1],axis[2]*r[0]-axis[0]*r[2],axis[0]*r[1]-axis[1]*r[0]];
        a=add(a,cross,f.strength/Math.sqrt(dot(r,r)+soft*soft));}
    }
  }return vector(a,'acceleration');
}
function prepareForce(f:ParticleForce):PreparedForce {
  if(!f||typeof f!=='object')spatialError('E_SPATIAL_PARAMETER','Invalid force');
  if(f.kind==='acceleration')return {kind:f.kind,value:vector(f.value,'acceleration')};
  if(f.kind==='drag')return {kind:f.kind,coefficient:finite(f.coefficient,'drag',0)};
  if(f.kind==='curl')return {kind:f.kind,field:createNoise(f.noise),strength:finite(f.strength,'curl strength'),epsilon:f.epsilon===undefined?undefined:finite(f.epsilon,'curl epsilon',Number.MIN_VALUE),motion:vector(f.motion??[0,0,0],'curl motion')};
  if(f.kind==='attractor'||f.kind==='vortex')return {...f,center:vector(f.center,'force center'),strength:finite(f.strength,'strength'),softening:finite(f.softening??.1,'softening',Number.MIN_VALUE),...f.kind==='vortex'?{axis:unit(vector(f.axis,'vortex axis'))}:{}};
  return spatialError('E_SPATIAL_PARAMETER','Unknown force');
}
export function particleAcceleration(position:Vec3,velocity:Vec3,forces:readonly ParticleForce[],time=0):Vec3 {
  return computeAcceleration(vector(position,'position'),vector(velocity,'velocity'),forces.map(prepareForce),finite(time,'force time'));
}
function prepareCollider(c:ParticleCollider):ParticleCollider {
  if(!c||typeof c.id!=='string'||!c.id.length)spatialError('E_SPATIAL_PARAMETER','Collider id required');
  const material={id:c.id,restitution:finite(c.restitution??.7,'restitution',0,1),friction:finite(c.friction??0,'friction',0,1)};
  if(c.kind==='plane')return {...material,kind:c.kind,normal:unit(vector(c.normal,'plane normal')),offset:finite(c.offset,'plane offset')};
  if(c.kind==='sphere')return {...material,kind:c.kind,center:vector(c.center,'sphere center'),radius:finite(c.radius,'sphere radius',Number.MIN_VALUE)};
  return spatialError('E_SPATIAL_PARAMETER','Unknown collider');
}

/** Swept sphere against planes and exterior sphere obstacles. Drift is continuous; force integration is semi-implicit Euler. */
function drift(p:FeedbackParticle,dt:number,time:number,colliders:readonly ParticleCollider[],maxImpacts:number,environment?:ParticleCollisionEnvironment,query?:()=>void,captureVelocity=false):ParticleContact[] {
  let remaining=dt,elapsed=0,impacts=0;const contacts:ParticleContact[]=[];
  while(remaining>0){
    let hit:{t:number;n:Vec3;c:{id:string;friction?:number;restitution?:number};push:number;surface?:Vec3;law?:'coulomb'}|undefined;
    for(const c of colliders){let t=Infinity,n:Vec3=[1,0,0],push=0;
      if(c.kind==='plane'){
        n=c.normal;const d=dot(p.position,n)-c.offset-p.radius,v=dot(p.velocity,n);
        if(d<0){t=0;push=-d;}else if(v<0)t=-d/v;
      }else{
        const r=add(p.position,c.center,-1),distance=norm(r),R=c.radius+p.radius;
        if(distance<R){t=0;push=R-distance;n=distance?r.map(x=>x/distance) as Vec3:[1,0,0];}
        else {const A=dot(p.velocity,p.velocity),B=dot(r,p.velocity),C=dot(r,r)-R*R,D=B*B-A*C;
          if(A>0&&B<0&&D>=0){t=(-B-Math.sqrt(D))/A;if(t>=0&&t<=remaining)n=unit(add(r,p.velocity,t));}}
      }
      if(t>=0&&t<=remaining&&(!hit||t<hit.t))hit={t,n,c,push};
    }
    if(environment){query!();const candidate=environment.sweepSphere({position:[...p.position],velocity:[...p.velocity],radius:p.radius,duration:remaining});
      if(candidate&&typeof (candidate as any).then==='function'){void Promise.resolve(candidate).catch(()=>{});spatialError('E_SPATIAL_ENV_ASYNC','A collision environment must return a completed synchronous result, not a Promise');}
      if(candidate!==null){
        if(!candidate||!environment.colliderIds.includes(candidate.colliderId))spatialError('E_SPATIAL_ENVIRONMENT','Collision result must name a declared obstacle');
        const t=finite(candidate.time,'collision time',0);if(t>remaining)spatialError('E_SPATIAL_ENVIRONMENT','Collision time exceeds current drift interval');
        const n=vector(candidate.normal,'collision normal');if(Math.abs(dot(n,n)-1)>1e-8)spatialError('E_SPATIAL_ENVIRONMENT','Collision normal must be unit length');
        const push=finite(candidate.penetration,'penetration',0),surface=vector(candidate.point,'collision surface'),restitution=finite(candidate.restitution,'restitution',0,1),friction=finite(candidate.friction,'Coulomb friction',0);
        if(!hit||t<hit.t)hit={t:t,n:n,push:push,surface:surface,law:'coulomb',c:{id:candidate.colliderId,restitution:restitution,friction:friction}};
      }
    }
    if(!hit){p.position=add(p.position,p.velocity,remaining);break;}
    if(++impacts>maxImpacts)spatialError('E_SPATIAL_COLLISION_BUDGET','Collision iteration budget exhausted; reduce timestep or raise maxImpactsPerStep');
    p.position=add(p.position,p.velocity,hit.t);elapsed+=hit.t;remaining-=hit.t;
    const epsilon=1e-9*Math.max(1,norm(p.position),p.radius);p.position=add(p.position,hit.n,hit.push+epsilon);
    const inward=dot(p.velocity,hit.n);
    if(inward<0){const tangent=add(p.velocity,hit.n,-inward),friction=hit.c.friction!;
      const tangentSpeed=norm(tangent),scale=hit.law==='coulomb'?(tangentSpeed?Math.max(0,1-friction*(1+hit.c.restitution!)*(-inward)/tangentSpeed):0):1-friction;
      p.velocity=add(tangent.map(v=>v*scale) as Vec3,hit.n,-inward*hit.c.restitution!);}
    contacts.push({particleId:p.id,colliderId:hit.c.id,time:time+elapsed,point:[...p.position],normal:[...hit.n],...captureVelocity?{velocity:[...p.velocity] as Vec3}:{},...hit.surface?{surfacePoint:[...hit.surface] as Vec3}:{}});
  }
  vector(p.position,'position');vector(p.velocity,'velocity');return contacts;
}

export function createFeedbackParticles(source:FeedbackParticleOptions,tools:FeedbackParticleTools={}):FeedbackParticles {
  if(!tools||Object.keys(tools).some(k=>!['collisionEnvironment','emitter'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown particle tools');
  const emitter=tools.emitter;
  if(emitter&&(!emitter||typeof emitter.identity!=='string'||!emitter.identity.length||typeof emitter.check!=='function'||typeof emitter.sample!=='function'))spatialError('E_SPATIAL_EMITTER','Invalid borrowed emitter');
  if(emitter?.color)assertColor(emitter.color);
  const capturedEmitter=emitter?{identity:emitter.identity,color:emitter.color?structuredClone(emitter.color):undefined,check:emitter.check.bind(emitter),sample:emitter.sample.bind(emitter)}:undefined;
  const supplied=tools.collisionEnvironment;
  if(supplied!==undefined&&(!supplied||typeof supplied!=='object'||typeof supplied.check!=='function'||typeof supplied.sweepSphere!=='function'||typeof supplied.identity!=='string'||!Array.isArray(supplied.colliderIds)||supplied.colliderIds.some(id=>typeof id!=='string'||!id.length)))spatialError('E_SPATIAL_ENVIRONMENT','Invalid borrowed collision environment');
  const environment=supplied?{identity:supplied.identity,colliderIds:[...supplied.colliderIds],check:supplied.check.bind(supplied),sweepSphere:supplied.sweepSphere.bind(supplied)}:undefined;
  function checkEnvironment(){if(emitter){if(emitter.identity!==capturedEmitter!.identity||JSON.stringify(emitter.color)!==JSON.stringify(capturedEmitter!.color))spatialError('E_SPATIAL_EMITTER','Borrowed emitter identity/color changed');const result=capturedEmitter!.check() as unknown;if(result&&typeof (result as any).then==='function'){void Promise.resolve(result).catch(()=>{});spatialError('E_SPATIAL_EMITTER_ASYNC','Emitter checks must complete synchronously');}}if(supplied&&supplied.identity!==environment!.identity)spatialError('E_SPATIAL_ENVIRONMENT','Borrowed collision environment identity changed');const result=environment?.check() as unknown;if(result&&typeof (result as any).then==='function'){void Promise.resolve(result).catch(()=>{});spatialError('E_SPATIAL_ENV_ASYNC','Environment availability checks must be synchronous');}}
  checkEnvironment();if(environment&&new Set(environment.colliderIds).size!==environment.colliderIds.length)spatialError('E_SPATIAL_ENVIRONMENT','Duplicate environment obstacle IDs');
  // Capture author data. Later mutation of configuration cannot invalidate existing checkpoints.
  const o=structuredClone(source),fps=rational(o.fps),seed=integer(o.seed??1,'seed',0),substeps=integer(o.substeps??2,'substeps'),hz=fps.num/fps.den*substeps;
  const rate=finite(o.rate,'rate',0),life=finite(o.lifetime,'lifetime',Number.MIN_VALUE),start=finite(o.startTime??0,'startTime',0),duration=finite(o.duration??Number.MAX_VALUE,'duration',0);
  const birthPlan=o.bursts?.length?prepareBirthPlan(rate,start,duration,life,o.bursts):undefined;
  if(o.bursts!==undefined&&!Array.isArray(o.bursts))spatialError('E_SPATIAL_PARAMETER','bursts must be an array');
  const origin=vector(o.origin,'origin'),velocity=vector(o.velocity,'velocity'),pj=vector(o.positionJitter??[0,0,0],'position jitter',0),vj=vector(o.velocityJitter??[0,0,0],'velocity jitter',0),radius=finite(o.radius??.04,'radius',0);
  const forces=(o.forces??[]).map(prepareForce),colliders=(o.colliders??[]).map(prepareCollider);
  if(new Set(colliders.map(c=>c.id)).size!==colliders.length)spatialError('E_SPATIAL_PARAMETER','Collider ids must be unique');
  if(environment&&(radius<=0||colliders.some(c=>environment.colliderIds.includes(c.id))))spatialError('E_SPATIAL_ENVIRONMENT','Mesh collisions require positive radius and obstacle IDs distinct from primitive colliders');
  const trailPoints=integer(o.trailPoints??16,'trailPoints',0),trailEvery=integer(o.trailEverySteps??substeps,'trailEverySteps');
  const b=o.budgets??{},maxParticles=integer(b.maxParticles??10000,'maxParticles'),maxValueBytes=integer(b.maxValueBytes??128*1024*1024,'maxValueBytes'),maxImpacts=integer(b.maxImpactsPerStep??8,'maxImpactsPerStep'),maxCheckpoints=integer(b.maxCheckpoints??8,'maxCheckpoints',2);
  const maxEnvironmentQueries=integer(b.maxEnvironmentQueriesPerStep??maxParticles*(maxImpacts+1),'maxEnvironmentQueriesPerStep');
  // Logical retained numeric-value bound, not JS heap/driver peak. Include live, returned and checkpoint copies.
  const bytesPerParticle=8*(12+3*trailPoints+(capturedEmitter?.color?4:0)),potential=Math.min(maxParticles,Math.ceil(rate*Math.min(life,duration))+1+(birthPlan?.maxConcurrentBursts??0));
  if(!Number.isFinite(hz)||!Number.isSafeInteger(potential)||potential*bytesPerParticle*(maxCheckpoints+3)>maxValueBytes)spatialError('E_SPATIAL_STATE_BUDGET','Planned live/checkpoint values exceed maxValueBytes; adjust rate/lifetime/trails/checkpoints or explicit budget');
  let state:ParticleSnapshot={step:0,particles:[],contacts:[],emitted:0},failed=false;
  function birth(id:number,birthTime=start+id/rate):FeedbackParticle {
    integer(id,'birth id',0);const random=(salt:number)=>seededRandom(seed,id,salt)*2-1;
    const sampled=capturedEmitter?.sample(seed,id);if(sampled&&typeof (sampled as any).then==='function'){void Promise.resolve(sampled).catch(()=>{});spatialError('E_SPATIAL_EMITTER_ASYNC','Emitter sample must be synchronous');}
    if(capturedEmitter&&!sampled)spatialError('E_SPATIAL_EMITTER','Emitter returned no sample');
    const offset=sampled?vector(sampled.position,'emitter position'):[0,0,0] as Vec3;
    if(sampled?.ink&&!capturedEmitter?.color)spatialError('E_SPATIAL_COLOR','Inherited emitter ink requires explicit color encoding');
    return {id,birthTime,lifetime:life,radius,position:vector(origin.map((v,i)=>v+offset[i]+pj[i]*random(i)) as Vec3,'initial position'),velocity:vector(velocity.map((v,i)=>v+vj[i]*random(i+3)) as Vec3,'initial velocity'),trail:[],...(sampled?.ink?{ink:vector(sampled.ink,'emitter ink')}:{}) ,...(sampled?.opacity!==undefined?{opacity:finite(sampled.opacity,'emitter opacity',0,1)}:{})};
  }
  function budget(particles:FeedbackParticle[],contacts:ParticleContact[]){
    if(particles.length>maxParticles||((particles.length*bytesPerParticle+contacts.length*(environment?120:96))*(maxCheckpoints+3))>maxValueBytes)spatialError('E_SPATIAL_STATE_BUDGET','Particle/contact values exceed configured budgets');
  }
  if(o.subEmitters!==undefined&&!Array.isArray(o.subEmitters))spatialError('E_SPATIAL_PARAMETER','subEmitters must be an array');
  if(o.subEmitters?.length)return subEmitterSimulation(o,{
    fps,seed,substeps,hz,check:checkEnvironment,birth,
    plan:prepareBirthPlan(rate,start,duration,life,o.bursts??[]),
    advance(p,interval,time,query){const next={...p,position:[...p.position] as Vec3,velocity:add(p.velocity,computeAcceleration(p.position,p.velocity,forces,time),interval),trail:[...p.trail]};const contacts=drift(next,interval,time,colliders,maxImpacts,environment,query,true);return {next,contacts};},
    trailPoints,trailEvery,maxParticles,maxValueBytes,maxCheckpoints,maxEnvironmentQueries,appearanceColor:capturedEmitter?.color
  });
  const sim={
    reset(){if(birthPlan){const births=birthPlan.births(-Infinity,0,maxParticles);state={step:0,particles:births.map(e=>birth(e.id,e.time)),contacts:[],emitted:birthPlan.count(0)};budget(state.particles,[]);return;}state={step:0,particles:rate>0&&start===0&&duration>0?[birth(0)]:[],contacts:[],emitted:rate>0&&start===0&&duration>0?1:0};},
    step(dt:number,step:number){
      let environmentQueries=0;const query=()=>{if(++environmentQueries>maxEnvironmentQueries)spatialError('E_SPATIAL_COLLISION_BUDGET','Environment query budget exceeded; no partial particle step is published');};
      const time=step/hz,previous=(step-1)/hz,particles:FeedbackParticle[]=[],contacts:ParticleContact[]=[];
      const advance=(p:FeedbackParticle,interval:number)=>{
        const next={...p,position:[...p.position] as Vec3,velocity:add(p.velocity,computeAcceleration(p.position,p.velocity,forces,time-interval),interval),trail:[...p.trail]};
        contacts.push(...drift(next,interval,time-interval,colliders,maxImpacts,environment,query));
        if(trailPoints>0&&step%trailEvery===0){next.trail.push([...next.position]);if(next.trail.length>trailPoints)next.trail.shift();}
        particles.push(next);
      };
      for(const p of state.particles)if(time-p.birthTime<life)advance(p,dt);
      let emitted=state.emitted;
      if(birthPlan){for(const event of birthPlan.births(previous,time,maxParticles-particles.length))advance(birth(event.id,event.time),time-event.time);emitted=birthPlan.count(time);}
      else if(rate>0&&time>=start&&duration>0){
        const last=Math.floor((time-start)*rate),first=emitted;
        integer(last,'birth index',0);
        // Budget the actual live spawn range before iterating a potentially huge emission rate.
        const aliveFirst=Math.max(first,Math.floor((time-start-life)*rate)+1),end=Math.min(last,Math.ceil(duration*rate)-1);
        if(end-aliveFirst+1+particles.length>maxParticles)spatialError('E_SPATIAL_STATE_BUDGET','Alive spawn range exceeds maxParticles');
        for(let id=aliveFirst;id<=end;id++){const p=birth(id);advance(p,Math.max(0,time-p.birthTime));}
        emitted=Math.max(emitted,Math.min(last+1,end+1));
      }
      budget(particles,contacts);state={step,particles,contacts,emitted};
      // previous is intentionally independent of seek/request order (dt is supplied by the one existing runner).
      if(Math.abs(time-previous-dt)>1e-8*Math.max(1,time))spatialError('E_SPATIAL_TIME','Inconsistent fixed step');
    },snapshot(){return state;},restore(value:ParticleSnapshot){state=value;}
  };
  const runner=new FixedStepRunner(sim,{fps:hz,checkpointInterval:integer(b.checkpointInterval??30,'checkpointInterval'),maxCheckpoints,maxSteps:integer(b.maxReplaySteps??1000000,'maxReplaySteps')});
  return {
    sample(context:FrameContext){
      checkEnvironment();const time=finite(context.time,'time',0),rate=rational(context.fps);
      const frame=finite(context.frame,'frame',0),step=frame*substeps;
      if(!Number.isSafeInteger(step)||rate.num!==fps.num||rate.den!==fps.den||Math.abs(time-frame*fps.den/fps.num)>1e-9*Math.max(1,Math.abs(time)))spatialError('E_SPATIAL_TIME','Frame/time/fps must agree and frame must align with the configured fixed substeps');
      if(failed)spatialError('E_SPATIAL_SIMULATION_FAILED','A failed fixed step requires reset before retry');
      try{return {...runner.seek(step),frame,time:time,fps:{...fps},seed,...(capturedEmitter?.color?{appearanceColor:structuredClone(capturedEmitter.color)}:{})};}catch(error){failed=true;throw error;}
    },
    reset(){checkEnvironment();runner.reset();failed=false;},get checkpointSteps(){return runner.checkpointFrames;}
  };
}
