import {FixedStepRunner,type FixedStepSimulation} from '../../../src/core/simulation.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {instantiateModule,type Session} from './session.mjs';
import {normalizeWorld,controlContext,rigidError,vector,finite,sampleContext,queryInput,integer,type PreparedWorld} from '../src/config.ts';
import {validateMeshData} from '../../graphics-contracts/validate.ts';
import type {RigidFrame,RigidContact,RigidState,RigidDiagnostics,RigidColliderMesh} from '../src/types.ts';
type Snapshot={step:number;bytes:Uint8Array;contacts:RigidContact[]};
const encoder=new TextEncoder(),decoder=new TextDecoder('utf8',{fatal:true});
export const encode=(v:unknown)=>encoder.encode(JSON.stringify(v));
export const decode=(v:Uint8Array)=>JSON.parse(decoder.decode(v));
/** A bytes-v1 data adapter, not another Runner/Host/RPC. Both the existing Kit
 * direct client and Worker run exactly this adapter and Core FixedStepRunner. */
export async function instantiatePhysics(bytes:BufferSource):Promise<Session>{
  const raw=await instantiateModule(bytes);let config:PreparedWorld|undefined,runner:FixedStepRunner<Snapshot>|undefined,step=0,contacts:RigidContact[]=[],failed=false,disposed=false,snapshotBytes=0;
  function native(op:number,value:Uint8Array,capacity:number){try{return raw.call(op,value,capacity);}catch(error){try{const e=decode(raw.call(8,new Uint8Array(),8192));if(typeof e.code==='string'&&typeof e.message==='string')rigidError(e.code,e.message);}catch(detail){if((detail as {code?:string}).code?.startsWith('E_RIGID_'))throw detail;}throw error;}}
  const json=(op:number,value:unknown,capacity=4096)=>decode(native(op,encode(value),capacity));
  function need(){if(disposed)rigidError('E_RIGID_DISPOSED','Rigid simulation is disposed');if(!config||!runner)rigidError('E_RIGID_INITIALIZATION','Rigid simulation has not been configured');return {c:config,r:runner};}
  function eventValues(c:PreparedWorld,events:any[],at:number):RigidContact[]{
    if(!Array.isArray(events)||events.length>c.budgets.maxEventsPerStep)rigidError('E_RIGID_EVENT_BUDGET','Invalid event data');
    return events.map(e=>{
      if(!['started','stopped','force'].includes(e.kind)||!Number.isSafeInteger(e.colliderA)||!Number.isSafeInteger(e.colliderB)||!c.colliderIds[e.colliderA]||!c.colliderIds[e.colliderB]||typeof e.sensor!=='boolean'||typeof e.started!=='boolean'||!Array.isArray(e.points)||e.points.length>c.budgets.maxPointsPerEvent)rigidError('E_RIGID_PROTOCOL','Malformed physical contact event');
      return {kind:e.kind,step:at,time:at*c.fps.den/c.fps.num/c.substeps,colliderA:c.colliderIds[e.colliderA],colliderB:c.colliderIds[e.colliderB],bodyA:c.bodies[c.colliderBodies[e.colliderA]].id,bodyB:c.bodies[c.colliderBodies[e.colliderB]].id,sensor:e.sensor,started:e.started,totalForce:vector(e.totalForce,'contact force'),totalMagnitude:finite(e.totalMagnitude,'contact force magnitude',0),maxForceDirection:vector(e.maxForceDirection,'force direction'),maxForceMagnitude:finite(e.maxForceMagnitude,'maximum force',0),points:e.points.map((p:any)=>({pointA:vector(p.pointA,'contact point'),pointB:vector(p.pointB,'contact point'),normal:vector(p.normal,'contact normal')}))};
    });
  }
  function initialize(input:unknown){
    if(config)rigidError('E_RIGID_INITIALIZATION','World configuration is immutable; create another owner');const c=normalizeWorld(input as Parameters<typeof normalizeWorld>[0]);
    const simulation:FixedStepSimulation<Snapshot>={
      reset(){json(1,c.native);step=0;contacts=[];},
      step(dt,next){
        if((next-1)%c.substeps===0)contacts=[];
        const start=controlContext((next-1)/c.substeps,c.fps,c.substeps,c.seed),end=controlContext(next/c.substeps,c.fps,c.substeps,c.seed);
        const controls=c.controls.map((v,index)=>({index,force:vector(evaluate(v.force,start),'force'),torque:vector(evaluate(v.torque,start),'torque'),...(v.target?{target:vector(evaluate(v.target,end),'kinematicPosition')}:{})}));
        json(2,{step:next,dt,controls});const events=json(7,{},c.budgets.maxOutputBytes);if(events.step!==next)rigidError('E_RIGID_TIME','Native step number disagrees');for(const event of eventValues(c,events.events,next))contacts.push(event);step=next;
      },
      snapshot(){const bytes=native(3,new Uint8Array(),c.budgets.maxSnapshotBytes);snapshotBytes=bytes.length+encode(contacts).byteLength+8;if(snapshotBytes>c.budgets.maxSnapshotBytes)rigidError('E_RIGID_BUDGET','Native snapshot plus current-frame event values exceed maxSnapshotBytes');return {step,bytes,contacts:structuredClone(contacts)};},
      restore(snapshot){native(4,snapshot.bytes,64);step=snapshot.step;contacts=structuredClone(snapshot.contacts);}
    };
    try{runner=new FixedStepRunner(simulation,{fps:c.fps.num/c.fps.den*c.substeps,checkpointInterval:c.budgets.checkpointInterval,maxCheckpoints:c.budgets.maxCheckpoints,maxSteps:c.budgets.maxReplaySteps});config=c;failed=false;}
    catch(error){failed=true;raw.dispose();disposed=true;throw error;}
  }
  function sample(context:FrameContext):RigidFrame{
    const {c,r}=need();if(failed)rigidError('E_RIGID_FAILED','Previous seek failed; reset or recreate the simulation');
    const {frame,time}=sampleContext(context,c.fps,c.substeps),at=frame*c.substeps;
    try{
      const result=r.seek(at),physical=json(5,{},c.budgets.maxOutputBytes);if(physical.step!==at||physical.bodies.length!==c.bodies.length)rigidError('E_RIGID_PROTOCOL','Native body state does not match the configured world');
      const bodies:RigidState[]=physical.bodies.map((body:any,i:number)=>{const q=body.rotation;if(!Array.isArray(q)||q.length!==4||q.some((n:unknown)=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(q.reduce((s:number,x:number)=>s+x*x,0)-1)>1e-8||typeof body.sleeping!=='boolean')rigidError('E_RIGID_NUMERIC','Invalid quaternion/sleep state');return {id:c.bodies[i].id,position:vector(body.position,'body position'),rotation:q,linearVelocity:vector(body.linearVelocity,'linear velocity'),angularVelocity:vector(body.angularVelocity,'angular velocity'),sleeping:body.sleeping,mass:finite(body.mass,'body mass',0)};});
      return {frame,time,step:at,fps:c.fps,seed:c.seed,bodies,contacts:result.contacts};
    }catch(error){failed=true;throw error;}
  }
  function query(op:number,input:unknown){
    const {c}=need();if(failed)rigidError('E_RIGID_FAILED','Previous seek failed; reset before querying');
    const identity=(n:any)=>{const i=integer(n,'native collider index',0,c.colliderIds.length-1),body=c.bodies[c.colliderBodies[i]],collider=c.bodies.flatMap(b=>b.colliders)[i];return {colliderId:c.colliderIds[i],bodyId:body.id,sensor:collider.sensor};};
    if(op===103){
      const meshes=json(9,{},c.budgets.maxOutputBytes);if(!Array.isArray(meshes)||meshes.length>c.colliderIds.length)rigidError('E_RIGID_PROTOCOL','Malformed collider geometry');
      return meshes.map((m:any):RigidColliderMesh=>{const id=identity(m.collider),collider=c.bodies.flatMap(b=>b.colliders)[m.collider],shape=collider.shape;
        if(shape.kind!=='convexHull'&&shape.kind!=='trimesh'||m.kind!==shape.kind||!Array.isArray(m.indices))rigidError('E_RIGID_PROTOCOL','Collider geometry identity mismatch');
        const mesh=validateMeshData({schema:'frameweave.mesh',version:1,id:shape.mesh.id,coordinates:shape.mesh.coordinates,topology:'triangles',vertexIds:m.vertices.map((_:unknown,i:number)=>'v'+i),restPositions:m.vertices,indices:m.indices.flat()});
        return {...id,kind:shape.kind,position:collider.position,rotation:collider.rotation,mesh};});
    }
    const kind=op===104?'ray':op===105?'cast':'overlap',result=json(op-94,queryInput(kind,input,c),c.budgets.maxOutputBytes);
    if(result.step!==step||!Array.isArray(result.hits)||result.hits.length>c.budgets.maxQueryResults)rigidError('E_RIGID_PROTOCOL','Malformed passive query result');
    const normal=(v:unknown)=>v===null?null:vector(v,'query normal');
    const hits=result.hits.map((h:any)=>{const id=identity(h.collider);
      if(kind==='ray'){if(!h.feature||!['vertex','edge','face','unknown'].includes(h.feature.kind))rigidError('E_RIGID_PROTOCOL','Malformed ray feature');return {...id,distance:finite(h.distance,'ray distance',0),point:vector(h.point,'ray point'),normal:normal(h.normal),feature:{kind:h.feature.kind,index:h.feature.index===null?null:integer(h.feature.index,'feature index',0)}};}
      if(op===107)return {...id,distance:finite(h.distance,'signed contact distance'),pointMoving:vector(h.pointMoving,'moving contact'),pointCollider:vector(h.pointCollider,'collider contact'),normalCollider:normal(h.normalCollider)};
      if(kind==='cast'){if(!['converged','out-of-iterations','failed','penetrating-or-within-target'].includes(h.status))rigidError('E_RIGID_PROTOCOL','Malformed shape-cast status');return {...id,timeOfImpact:finite(h.timeOfImpact,'timeOfImpact',0),pointMoving:vector(h.pointMoving,'moving witness'),pointCollider:vector(h.pointCollider,'collider witness'),normalCollider:normal(h.normalCollider),status:h.status,subshape:integer(h.subshape,'subshape',0)};}
      return id;
    });return {step,time:step*c.fps.den/c.fps.num/c.substeps,hits};
  }
  function diagnostics():RigidDiagnostics {
    const nativeInfo=disposed?{worlds:0}:json(6,{}),c=config;
    return {...raw.diagnostics(),worlds:nativeInfo.worlds,failed,currentStep:step,checkpointSteps:runner?.checkpointFrames??[],snapshotBytes,plannedCheckpointBytes:c?c.budgets.maxSnapshotBytes*(c.budgets.maxCheckpoints+3):0,physicalPeakBytes:null,backend:'rapier3d-f64-wasm',rapier:'0.36.1',precision:'f64',determinism:'enhanced'};
  }
  return {
    call(op,input,capacity){if(disposed)rigidError('E_RIGID_DISPOSED','Rigid simulation is disposed');let result;
      if(op===100){initialize(decode(input));result={ready:true};}
      else if(op===101)result=sample(decode(input));
      else if(op===102){const {r}=need();try{r.reset();failed=false;result={reset:true};}catch(error){failed=true;throw error;}}
      else if(op>=103&&op<=107)result=query(op,decode(input));
      else rigidError('E_RIGID_OPERATION','Unsupported public physics operation');
      const bytes=encode(result);if(bytes.length>capacity){failed=true;rigidError('E_RIGID_BYTES','Physics output exceeds existing bytes-v1 reply budget');}return bytes;
    },diagnostics,
    dispose(){if(disposed)return {remainingBuffers:0};disposed=true;runner=undefined;config=undefined;contacts=[];step=0;snapshotBytes=0;return raw.dispose();}
  };
}
