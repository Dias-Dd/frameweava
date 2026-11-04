import type {ModuleLoader} from '../../../src/plugins/sdk.ts';
import {instantiatePhysics,encode,decode} from '../runtime/physics.ts';
import {normalizeWorld,queryInput,finite,vector,rigidError} from './config.ts';
import type {RigidWorldOptions,StaticCollisionClientOptions,StaticCollisionEnvironment,SphereSweep,SphereSweepHit,RigidQueryResult,RigidCastHit,RigidColliderMesh,RigidDiagnostics} from './types.ts';
/** Existing verified C1 resource loader and data adapter; no Worker or new IPC layer.
 * The hidden world is immutable/fixed and never stepped, so its data need not enter
 * the particle Runner's snapshots. The caller owns this tool; simulations borrow it. */
export async function createStaticCollisionEnvironment(load:ModuleLoader,input:RigidWorldOptions,options:StaticCollisionClientOptions={}):Promise<StaticCollisionEnvironment>{
  const initial=normalizeWorld(input),source=structuredClone(input);
  if(initial.bodies.some(b=>b.kind!=='fixed')||initial.jointIds.length)rigidError('E_RIGID_STATIC_REQUIRED','Particle collision environments require fixed bodies and no joints; use a sampled rigid world for moving obstacles');
  if(!options||![Object.prototype,null].includes(Object.getPrototypeOf(options))||Reflect.ownKeys(options).some(k=>typeof k!=='string'||!['signal','filter'].includes(k)||!('value' in Object.getOwnPropertyDescriptor(options,k)!)))rigidError('E_RIGID_PARAMETER','Invalid static collision options');
  const signal=options.signal;
  if(signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))rigidError('E_RIGID_PARAMETER','signal must be an AbortSignal');
  queryInput('cast',{shape:{kind:'ball',radius:1},position:[0,0,0],velocity:[0,0,0],maxTime:0,filter:options.filter},initial);
  const filter=structuredClone(options.filter??{});
  if(filter.includeSensors)rigidError('E_RIGID_PARAMETER','Sensors cannot become solid particle collision obstacles');
  queryInput('cast',{shape:{kind:'ball',radius:1},position:[0,0,0],velocity:[0,0,0],maxTime:0,filter:filter},initial);
  if(signal?.aborted)rigidError('E_RIGID_CANCELLED','Static environment initialization cancelled');
  // Plan reply capacity from actual authored geometry/count, not the 16MiB maximum
  // on every scalar query. Explicit author budgets always win; no partial replies.
  const planned=65536+encode(source).length*2+initial.colliderIds.length*1024;
  source.budgets={...source.budgets,maxOutputBytes:source.budgets?.maxOutputBytes??Math.min(16777216,planned),maxQueryResults:source.budgets?.maxQueryResults??Math.max(1,initial.colliderIds.length)};
  const prepared=normalizeWorld(source),wire=encode(source),signature=new TextEncoder().encode(JSON.stringify(prepared)),identity=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',signature))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const session=await instantiatePhysics((await load({module:'bytes',format:'resource'})).slice().buffer);
  let disposed=false,invalid=false,sweeps=0,casts=0,contactQueries=0;const colliders=prepared.bodies.flatMap(b=>b.colliders),byId=new Map(prepared.colliderIds.map((id,i)=>[id,colliders[i]]));
  function check(){if(signal?.aborted)rigidError('E_RIGID_CANCELLED','Static collision environment cancelled');if(disposed)rigidError('E_RIGID_DISPOSED','Static collision environment disposed');if(invalid)rigidError('E_RIGID_FAILED','Static collision owner failed; dispose and recreate');}
  function dispose(){if(disposed)return {remainingBuffers:0};disposed=true;signal?.removeEventListener('abort',dispose);return session.dispose();}
  signal?.addEventListener('abort',dispose,{once:true});
  try{check();session.call(100,wire,64);}catch(error){dispose();throw error;}
  function invoke<T>(op:number,value:unknown):T{check();try{return decode(session.call(op,encode(value),prepared.budgets.maxOutputBytes)) as T;}catch(error){invalid=!!(session.diagnostics() as RigidDiagnostics).failed;throw error;}}
  function cast(q:SphereSweep,stop:boolean){casts++;return invoke<RigidQueryResult<RigidCastHit>>(105,{shape:{kind:'ball',radius:q.radius},position:q.position,velocity:q.velocity,maxTime:q.duration,stopAtPenetration:stop,filter:filter}).hits;}
  function convert(h:RigidCastHit):SphereSweepHit{
    if(h.status==='failed'||h.status==='out-of-iterations')rigidError('E_RIGID_COLLISION_CONVERGENCE','Particle cast did not converge for '+h.colliderId);
    if(!h.normalCollider||Math.abs(h.normalCollider.reduce((s,x)=>s+x*x,0)-1)>1e-8)rigidError('E_RIGID_COLLISION_NORMAL','No reliable unit collision normal for '+h.colliderId);
    const n=h.normalCollider,material=byId.get(h.colliderId)!;
    return {time:h.timeOfImpact,point:h.pointCollider,normal:n,penetration:0,colliderId:h.colliderId,bodyId:h.bodyId,restitution:material.restitution,friction:material.friction};
  }
  return {identity:identity,get colliderIds(){return [...prepared.colliderIds];},check:check,
    sweepSphere(value:SphereSweep){check();if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['position','velocity','radius','duration'].includes(k)))rigidError('E_RIGID_PARAMETER','Invalid sphere sweep');
      const q={position:vector(value.position,'sweep position'),velocity:vector(value.velocity,'sweep velocity'),radius:finite(value.radius,'sweep radius',Number.MIN_VALUE),duration:finite(value.duration,'sweep duration',0)};sweeps++;
      contactQueries++;
      const probes=invoke<RigidQueryResult<{colliderId:string;bodyId:string;distance:number;pointCollider:[number,number,number];normalCollider:[number,number,number]|null}>>(107,{shape:{kind:'ball',radius:q.radius},position:q.position,filter:filter});
      const candidates:SphereSweepHit[]=[];
      for(const h of probes.hits){const normal=h.normalCollider;if(!normal||Math.abs(normal.reduce((s,x)=>s+x*x,0)-1)>1e-8)rigidError('E_RIGID_COLLISION_NORMAL','No reliable contact normal for '+h.colliderId);const penetration=Math.max(0,-h.distance),inward=normal.reduce((s,x,i)=>s+x*q.velocity[i],0);if(penetration===0&&inward>=0)continue;const material=byId.get(h.colliderId)!;candidates.push({time:0,point:h.pointCollider,normal:normal,penetration:penetration,colliderId:h.colliderId,bodyId:h.bodyId,restitution:material.restitution,friction:material.friction});}
      // A real signed contact query handles deep/stationary initial penetration;
      // a cast alone can return no hit for zero velocity inside a convex body.
      // Once clear, upstream separating-contact casts can find a later face of
      // the same concave mesh instead of silently excluding that whole collider.
      if(!candidates.length)candidates.push(...cast(q,false).map(convert).filter(h=>h.time>0||h.normal.reduce((s,n,i)=>s+n*q.velocity[i],0)<0));
      candidates.sort((a,b)=>a.time-b.time||prepared.colliderIds.indexOf(a.colliderId)-prepared.colliderIds.indexOf(b.colliderId));return candidates[0]??null;
    },colliderMeshes:()=>invoke<RigidColliderMesh[]>(103,{}),
    diagnostics(){const info=session.diagnostics() as RigidDiagnostics;return {...info,sweeps:sweeps,casts:casts,contactQueries:contactQueries};},dispose:dispose};
}
