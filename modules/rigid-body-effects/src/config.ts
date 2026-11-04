import {rational} from '../../../src/core/time.ts';
import {checkedColliderMesh,nativeShape} from './mesh-shapes.ts';
import {assertJson,checkSignals} from '../../../src/core/graph.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {RigidWorldOptions,Vec3,Quaternion,VectorSignal,RigidShape,RigidCollisionGroups,RigidRay,RigidShapeQuery,RigidShapeCast,RigidQueryFilter} from './types.ts';
export function rigidError(code:string,message:string):never {throw Object.assign(new Error(message),{code});}
function object(v:unknown,name:string,keys:string[]):Record<string,any>{
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))rigidError('E_RIGID_PARAMETER',name+' must be a plain object');
  for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key)!;if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))rigidError('E_RIGID_PARAMETER',name+' contains an unknown/accessor field');}
  return v as Record<string,any>;
}
export function finite(v:unknown,name:string,min=-Number.MAX_VALUE,max=Number.MAX_VALUE):number {if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)rigidError('E_RIGID_PARAMETER',name+' must be finite within its declared range');return v;}
export function integer(v:unknown,name:string,min=1,max=Number.MAX_SAFE_INTEGER){const n=finite(v,name,min,max);if(!Number.isSafeInteger(n))rigidError('E_RIGID_PARAMETER',name+' must be a safe integer');return n;}
function boolean(v:unknown,name:string){if(typeof v!=='boolean')rigidError('E_RIGID_PARAMETER',name+' must be boolean');return v;}
function id(v:unknown,name:string){if(typeof v!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v))rigidError('E_RIGID_PARAMETER',name+' needs a stable ID');return v;}
export function vector(v:unknown,name:string,min=-Number.MAX_VALUE):Vec3 {if(!Array.isArray(v)||v.length!==3)rigidError('E_RIGID_PARAMETER',name+' must have three components');return v.map(x=>finite(x,name,min)) as Vec3;}
function quaternion(v:unknown,name:string):Quaternion {if(!Array.isArray(v)||v.length!==4)rigidError('E_RIGID_PARAMETER',name+' must be XYZW');const q=v.map(x=>finite(x,name)) as Quaternion;if(Math.abs(q.reduce((s,x)=>s+x*x,0)-1)>1e-8)rigidError('E_RIGID_PARAMETER',name+' must already be a unit quaternion');return q;}
function locks(v:unknown,name:string):[boolean,boolean,boolean] {if(!Array.isArray(v)||v.length!==3)rigidError('E_RIGID_PARAMETER',name+' needs three booleans');return v.map(x=>boolean(x,name)) as [boolean,boolean,boolean];}
function array(v:unknown,name:string,max:number):any[]{if(!Array.isArray(v)||v.length>max)rigidError('E_RIGID_BUDGET',name+' must be an array within the explicit budget');if(Reflect.ownKeys(v).length!==v.length+1)rigidError('E_RIGID_PARAMETER',name+' must be a dense, undecorated data array');for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d))rigidError('E_RIGID_PARAMETER',name+' must contain own data elements');}return v;}
function unique(ids:string[],name:string){if(new Set(ids).size!==ids.length)rigidError('E_RIGID_PARAMETER','Duplicate '+name);}

/** Existing local-frame Signal evaluation. Global/progress signals need a future explicit Stage mapping;
 * reject them instead of inferring a second clock or returning stale/wrong values. */
export function controlContext(frame:number,fps:{num:number;den:number},substeps:number,seed:number):FrameContext{
  const time=frame*fps.den/fps.num;return {frame,time,globalFrame:frame,globalTime:time,dt:fps.den/fps.num/substeps,fps,durationInFrames:1,progress:0,seed};
}
/** Validate before JSON transport, which otherwise converts NaN/Infinity to null. */
export function sampleContext(value:unknown,fps:{num:number;den:number},substeps:number){
  const ctx=object(value,'FrameContext',['frame','time','fps','globalFrame','globalTime','dt','durationInFrames','progress','seed']);
  const frame=finite(ctx.frame,'frame',0),time=finite(ctx.time,'time',0),rate=object(ctx.fps,'fps',['num','den']),normalized=rational(rate as {num:number;den:number});
  if(normalized.num!==fps.num||normalized.den!==fps.den||!Number.isSafeInteger(frame*substeps)||Math.abs(time-frame*fps.den/fps.num)>1e-9*Math.max(1,Math.abs(time)))rigidError('E_RIGID_TIME','Frame/time/FPS must agree and frame must align to configured fixed substeps');
  return {frame,time,fps:{...fps}};
}
function signals(v:unknown,name:string):VectorSignal {
  if(!Array.isArray(v)||v.length!==3)rigidError('E_RIGID_PARAMETER',name+' needs three numeric Signals');assertJson(v);checkSignals(v);
  function visit(v:any,depth=0){if(depth>32)rigidError('E_RIGID_PARAMETER','Signal nesting exceeds the parameter budget');if(typeof v==='number')return;if(!v||typeof v!=='object')rigidError('E_RIGID_PARAMETER','Numeric Signal required');
    if(v.$expr&&['globalFrame','globalTime','progress'].includes(v.$expr))rigidError('E_RIGID_TIME','Physics controls currently support explicit local time/frame; global/progress mapping is unsupported');for(const x of Object.values(v))if(x&&typeof x==='object')for(const y of Array.isArray(x)?x:[x])if(y&&typeof y==='object')visit(y,depth+1);
  }
  v.forEach(x=>visit(x));const result=structuredClone(v) as VectorSignal;vector(evaluate(result,controlContext(0,{num:24,den:1},1,1)),name);return result;
}
export function normalizeWorld(input:RigidWorldOptions){
  const o=object(input,'world',['fps','substeps','seed','gravity','bodies','joints','solver','budgets']),fps=rational(o.fps),substeps=integer(o.substeps??4,'substeps'),seed=integer(o.seed??1,'seed',0,0xffffffff);
  const hz=fps.num/fps.den*substeps;if(!Number.isFinite(hz)||hz<=0||!Number.isFinite(1/hz)||1/hz===0)rigidError('E_RIGID_TIME','Fixed substep frequency is not representable');
  const b=object(o.budgets??{},'budgets',['maxBodies','maxColliders','maxJoints','maxGeometryVertices','maxGeometryTriangles','maxConfigBytes','maxQueryResults','maxEventsPerStep','maxPointsPerEvent','maxSnapshotBytes','maxCheckpointBytes','maxOutputBytes','checkpointInterval','maxCheckpoints','maxReplaySteps']);
  const budgets={maxGeometryVertices:integer(b.maxGeometryVertices??100000,'maxGeometryVertices'),maxGeometryTriangles:integer(b.maxGeometryTriangles??100000,'maxGeometryTriangles'),maxConfigBytes:integer(b.maxConfigBytes??8388608,'maxConfigBytes',64,16777216),maxQueryResults:integer(b.maxQueryResults??20000,'maxQueryResults'),maxBodies:integer(b.maxBodies??10000,'maxBodies'),maxColliders:integer(b.maxColliders??20000,'maxColliders'),maxJoints:integer(b.maxJoints??10000,'maxJoints'),maxEventsPerStep:integer(b.maxEventsPerStep??16384,'maxEventsPerStep'),maxPointsPerEvent:integer(b.maxPointsPerEvent??32,'maxPointsPerEvent'),maxSnapshotBytes:integer(b.maxSnapshotBytes??4194304,'maxSnapshotBytes',64,16777216),maxCheckpointBytes:integer(b.maxCheckpointBytes??134217728,'maxCheckpointBytes'),maxOutputBytes:integer(b.maxOutputBytes??16777216,'maxOutputBytes',64,16777216),checkpointInterval:integer(b.checkpointInterval??30,'checkpointInterval'),maxCheckpoints:integer(b.maxCheckpoints??8,'maxCheckpoints',2),maxReplaySteps:integer(b.maxReplaySteps??1000000,'maxReplaySteps')};
  const planned=budgets.maxSnapshotBytes*(budgets.maxCheckpoints+3);if(!Number.isSafeInteger(planned)||planned>budgets.maxCheckpointBytes)rigidError('E_RIGID_BUDGET','Planned retained checkpoint/snapshot copies exceed maxCheckpointBytes');
  let geometryVertices=0,geometryTriangles=0;
  const colliderIds:string[]=[],colliderBodies:number[]=[],controls:{force:VectorSignal;torque:VectorSignal;target?:VectorSignal}[]=[];
  const bodies=array(o.bodies,'bodies',budgets.maxBodies).map((v,index)=>{
    const x=object(v,'body',['id','kind','position','rotation','linearVelocity','angularVelocity','linearDamping','angularDamping','gravityScale','canSleep','ccd','lockTranslation','lockRotation','colliders','force','torque','kinematicPosition']);
    if(!['dynamic','fixed','kinematic'].includes(x.kind))rigidError('E_RIGID_PARAMETER','Unknown body kind');
    if(x.kinematicPosition!==undefined&&x.kind!=='kinematic'||(x.force!==undefined||x.torque!==undefined)&&x.kind!=='dynamic')rigidError('E_RIGID_PARAMETER','Force/torque require dynamic bodies; targets require kinematic bodies');
    controls.push({force:signals(x.force??[0,0,0],'force'),torque:signals(x.torque??[0,0,0],'torque'),...(x.kinematicPosition!==undefined?{target:signals(x.kinematicPosition,'kinematicPosition')}:{})});
    const colliders=array(x.colliders,'colliders',budgets.maxColliders).map(v=>{
      const c=object(v,'collider',['id','shape','position','rotation','density','friction','restitution','sensor','forceThreshold','groups']),shape=object(c.shape,'shape',['kind','radius','halfExtents','halfHeight','mesh','internalEdges']);let s:RigidShape;
      if(shape.kind==='ball'){object(shape,'ball',['kind','radius']);s={kind:'ball',radius:finite(shape.radius,'radius',Number.MIN_VALUE)};}
      else if(shape.kind==='cuboid'){object(shape,'cuboid',['kind','halfExtents']);s={kind:'cuboid',halfExtents:vector(shape.halfExtents,'halfExtents',Number.MIN_VALUE)};}
      else if(shape.kind==='capsule'){object(shape,'capsule',['kind','radius','halfHeight']);s={kind:'capsule',radius:finite(shape.radius,'radius',Number.MIN_VALUE),halfHeight:finite(shape.halfHeight,'halfHeight',0)};}
      else if(shape.kind==='convexHull'||shape.kind==='trimesh'){
        object(shape,'mesh shape',shape.kind==='convexHull'?['kind','mesh']:['kind','mesh','internalEdges']);
        if(shape.kind==='trimesh'&&x.kind!=='fixed')rigidError('E_RIGID_GEOMETRY','Triangle-mesh colliders are fixed environments; use convexHull or explicit compound colliders for moving bodies');
        if(shape.internalEdges!==undefined&&!['raw','fix-two-sided'].includes(shape.internalEdges))rigidError('E_RIGID_PARAMETER','Unknown internal-edge policy');
        const mesh=checkedColliderMesh(shape.mesh,shape.kind==='convexHull');geometryVertices+=mesh.restPositions.length;geometryTriangles+=mesh.indices.length/3;
        if(geometryVertices>budgets.maxGeometryVertices||geometryTriangles>budgets.maxGeometryTriangles)rigidError('E_RIGID_BUDGET','Total authored collision geometry exceeds explicit budget');
        s=shape.kind==='convexHull'?{kind:'convexHull',mesh}:{kind:'trimesh',mesh,internalEdges:shape.internalEdges??'fix-two-sided'};
      }else rigidError('E_RIGID_PARAMETER','Unknown collider shape');
      colliderIds.push(id(c.id,'collider.id'));colliderBodies.push(index);if(colliderIds.length>budgets.maxColliders)rigidError('E_RIGID_BUDGET','Total collider count exceeds maxColliders');
      const density=finite(c.density??1,'density',Number.MIN_VALUE);
      if(s.kind!=='convexHull'&&s.kind!=='trimesh'){const volume=s.kind==='ball'?4/3*Math.PI*s.radius**3:s.kind==='cuboid'?8*s.halfExtents[0]*s.halfExtents[1]*s.halfExtents[2]:Math.PI*s.radius**2*(2*s.halfHeight)+4/3*Math.PI*s.radius**3,scale=s.kind==='cuboid'?Math.max(...s.halfExtents):s.kind==='capsule'?Math.max(s.radius,s.halfHeight):s.radius,mass=volume*density,momentScale=scale**2*mass;
      if(!Number.isFinite(volume)||volume<=0||!Number.isFinite(mass)||mass<=0||!Number.isFinite(momentScale)||momentScale<=0)rigidError('E_RIGID_PARAMETER','Collider volume/mass/inertia scale is not representable in f64; no silent underflow or clamp');}
      const groups=c.groups===undefined?undefined:collisionGroups(c.groups);
      return {shape:s,...groups?{groups}:{},position:vector(c.position??[0,0,0],'collider.position'),rotation:quaternion(c.rotation??[0,0,0,1],'collider.rotation'),density,friction:finite(c.friction??.5,'friction',0),restitution:finite(c.restitution??0,'restitution',0,1),sensor:boolean(c.sensor??false,'sensor'),forceThreshold:finite(c.forceThreshold??0,'forceThreshold',0)};
    });
    if(x.kind==='dynamic'&&!colliders.length)rigidError('E_RIGID_PARAMETER','Dynamic bodies require an explicit mass-bearing collider in this version');
    return {id:id(x.id,'body.id'),kind:x.kind as 'dynamic'|'fixed'|'kinematic',position:vector(x.position??[0,0,0],'position'),rotation:quaternion(x.rotation??[0,0,0,1],'rotation'),linearVelocity:vector(x.linearVelocity??[0,0,0],'linearVelocity'),angularVelocity:vector(x.angularVelocity??[0,0,0],'angularVelocity'),linearDamping:finite(x.linearDamping??0,'linearDamping',0),angularDamping:finite(x.angularDamping??0,'angularDamping',0),gravityScale:finite(x.gravityScale??1,'gravityScale'),canSleep:boolean(x.canSleep??true,'canSleep'),ccd:boolean(x.ccd??false,'ccd'),lockTranslation:locks(x.lockTranslation??[false,false,false],'lockTranslation'),lockRotation:locks(x.lockRotation??[false,false,false],'lockRotation'),colliders};
  });
  unique(bodies.map(b=>b.id),'body IDs');unique(colliderIds,'collider IDs');const bodyIndex=new Map(bodies.map((b,i)=>[b.id,i])),jointIds:string[]=[];
  const joints=array(o.joints??[],'joints',budgets.maxJoints).map(v=>{
    const j=object(v,'joint',['id','kind','bodyA','bodyB','anchorA','anchorB','contacts','axis','limits','motor','restLength','stiffness','damping']);jointIds.push(id(j.id,'joint.id'));const a=bodyIndex.get(j.bodyA),b=bodyIndex.get(j.bodyB);
    if(a===undefined||b===undefined||a===b)rigidError('E_RIGID_PARAMETER','Joint endpoints must name two existing distinct bodies');
    const base={kind:j.kind as string,bodyA:a,bodyB:b,anchorA:vector(j.anchorA??[0,0,0],'anchorA'),anchorB:vector(j.anchorB??[0,0,0],'anchorB'),contacts:boolean(j.contacts??false,'joint.contacts')};
    if(j.kind==='fixed'||j.kind==='spherical'){object(j,'joint',['id','kind','bodyA','bodyB','anchorA','anchorB','contacts']);return base;}
    if(j.kind==='revolute'||j.kind==='prismatic'){object(j,'joint',['id','kind','bodyA','bodyB','anchorA','anchorB','contacts','axis','limits','motor']);const axis=vector(j.axis,'axis');if(Math.abs(axis.reduce((s,x)=>s+x*x,0)-1)>1e-8)rigidError('E_RIGID_PARAMETER','Joint axis must already be a unit vector');let limits:[number,number]|undefined,motor:{velocity:number;maxForce:number}|undefined;
      if(j.limits!==undefined){if(!Array.isArray(j.limits)||j.limits.length!==2)rigidError('E_RIGID_PARAMETER','limits need two values');limits=[finite(j.limits[0],'limit'),finite(j.limits[1],'limit')];if(limits[0]>limits[1])rigidError('E_RIGID_PARAMETER','Joint limits must be increasing');}
      if(j.motor!==undefined){const m=object(j.motor,'motor',['velocity','maxForce']);motor={velocity:finite(m.velocity,'motor.velocity'),maxForce:finite(m.maxForce,'motor.maxForce',0)};}return {...base,axis,...limits?{limits}:{},...motor?{motor}:{}};
    }
    if(j.kind==='spring'){object(j,'joint',['id','kind','bodyA','bodyB','anchorA','anchorB','contacts','restLength','stiffness','damping']);return {...base,restLength:finite(j.restLength,'restLength',0),stiffness:finite(j.stiffness,'stiffness',0),damping:finite(j.damping,'damping',0)};}
    return rigidError('E_RIGID_PARAMETER','Unknown joint kind');
  });unique(jointIds,'joint IDs');
  const solver=object(o.solver??{},'solver',['iterations','ccdSubsteps','lengthUnit','maxLinearVelocity','allowedLinearError','predictionDistance','maxCorrectiveVelocity','contactRecycling','contactClustering','contactSoftness','staticContactSoftness']);
  const softness=(v:unknown)=>{const x=object(v,'contactSoftness',['frequency','dampingRatio']);return {frequency:finite(x.frequency,'contact frequency',Number.MIN_VALUE),dampingRatio:finite(x.dampingRatio,'contact damping ratio',0)};};
  const native={gravity:vector(o.gravity??[0,-9.81,0],'gravity'),dt:1/hz,iterations:integer(solver.iterations??8,'iterations'),ccdSubsteps:integer(solver.ccdSubsteps??1,'ccdSubsteps',0),lengthUnit:finite(solver.lengthUnit??1,'lengthUnit',Number.MIN_VALUE),maxLinearVelocity:finite(solver.maxLinearVelocity??Number.MAX_VALUE,'maxLinearVelocity',Number.MIN_VALUE),allowedLinearError:finite(solver.allowedLinearError??.005,'allowedLinearError',0),predictionDistance:finite(solver.predictionDistance??.02,'predictionDistance',0),maxCorrectiveVelocity:finite(solver.maxCorrectiveVelocity??3,'maxCorrectiveVelocity',0),contactRecycling:boolean(solver.contactRecycling??false,'contactRecycling'),contactClustering:boolean(solver.contactClustering??true,'contactClustering'),contactSoftness:softness(solver.contactSoftness??{frequency:30,dampingRatio:10}),staticContactSoftness:softness(solver.staticContactSoftness??{frequency:60,dampingRatio:10}),bodies:bodies.map(({id,...body})=>({...body,colliders:body.colliders.map(c=>({...c,shape:nativeShape(c.shape)}))})),joints,maxGeometryVertices:budgets.maxGeometryVertices,maxGeometryTriangles:budgets.maxGeometryTriangles,maxQueryResults:budgets.maxQueryResults,maxEvents:budgets.maxEventsPerStep,maxContactPoints:budgets.maxPointsPerEvent};
  const result={fps,substeps,seed,budgets,bodies,colliderIds,colliderBodies,jointIds,controls,native};assertJson(result);if(new TextEncoder().encode(JSON.stringify(input)).length>budgets.maxConfigBytes)rigidError('E_RIGID_BUDGET','Authored configuration exceeds maxConfigBytes before WASM initialization');return structuredClone(result);
}
export type PreparedWorld=ReturnType<typeof normalizeWorld>;

export function collisionGroups(value:unknown):RigidCollisionGroups{
  const g=object(value,'collision groups',['memberships','filter']);return {memberships:integer(g.memberships,'memberships',0,0xffffffff),filter:integer(g.filter,'filter',0,0xffffffff)};
}
function queryFilter(value:unknown,c:PreparedWorld){
  const f=object(value??{},'query filter',['includeSensors','excludeBodies','excludeColliders','groups']);
  const bodyNames=array(f.excludeBodies??[],'excludeBodies',c.budgets.maxBodies).map(v=>id(v,'excluded body'));
  const colliderNames=array(f.excludeColliders??[],'excludeColliders',c.budgets.maxColliders).map(v=>id(v,'excluded collider'));
  if(bodyNames.some(n=>!c.bodies.some(b=>b.id===n))||colliderNames.some(n=>!c.colliderIds.includes(n)))rigidError('E_RIGID_PARAMETER','Query exclusion must name an existing body/collider');
  return {includeSensors:boolean(f.includeSensors??false,'includeSensors'),exclude:c.colliderIds.flatMap((n,i)=>bodyNames.includes(c.bodies[c.colliderBodies[i]].id)||colliderNames.includes(n)?[i]:[]),...f.groups===undefined?{}:{groups:collisionGroups(f.groups)}};
}
function queryShape(value:unknown,c:PreparedWorld):RigidShape{
  const s=object(value,'query shape',['kind','radius','halfExtents','halfHeight','mesh']);
  if(s.kind==='convexHull'){object(s,'convexHull',['kind','mesh']);const mesh=checkedColliderMesh(s.mesh,true);if(mesh.restPositions.length>c.budgets.maxGeometryVertices||mesh.indices.length/3>c.budgets.maxGeometryTriangles)rigidError('E_RIGID_BUDGET','Query geometry exceeds world geometry budget');return {kind:'convexHull',mesh};}
  if(s.kind==='ball'){object(s,'ball',['kind','radius']);return {kind:'ball',radius:finite(s.radius,'radius',Number.MIN_VALUE)};}
  if(s.kind==='cuboid'){object(s,'cuboid',['kind','halfExtents']);return {kind:'cuboid',halfExtents:vector(s.halfExtents,'halfExtents',Number.MIN_VALUE)};}
  if(s.kind==='capsule'){object(s,'capsule',['kind','radius','halfHeight']);return {kind:'capsule',radius:finite(s.radius,'radius',Number.MIN_VALUE),halfHeight:finite(s.halfHeight,'halfHeight',0)};}
  return rigidError('E_RIGID_GEOMETRY','Queries require a ball, cuboid, capsule or convexHull; concave moving query shapes are unsupported');
}
/** Private wire normalization, repeated inside the Worker before touching WASM. */
export function queryInput(kind:'ray'|'cast'|'overlap',value:unknown,c:PreparedWorld){
  let result:unknown;
  if(kind==='ray'){
    const q=object(value,'ray',['origin','direction','maxDistance','solid','filter']),origin=vector(q.origin,'origin'),direction=vector(q.direction,'direction'),maxDistance=finite(q.maxDistance,'maxDistance',0);
    if(Math.abs(direction.reduce((s,x)=>s+x*x,0)-1)>1e-8)rigidError('E_RIGID_PARAMETER','Ray direction must already be a unit vector; maxDistance is measured in meters');
    vector(origin.map((x,i)=>x+direction[i]*maxDistance),'ray endpoint');
    result={origin,direction,maxDistance,solid:boolean(q.solid??true,'solid'),filter:queryFilter(q.filter,c),maxResults:c.budgets.maxQueryResults};
  }else{
    const q=object(value,'shape query',['shape','position','rotation','filter',...(kind==='cast'?['velocity','maxTime','targetDistance','stopAtPenetration']:[])]),shape=queryShape(q.shape,c),position=vector(q.position,'query position');
    const base={shape:nativeShape(shape),position,rotation:quaternion(q.rotation??[0,0,0,1],'query rotation'),filter:queryFilter(q.filter,c),maxResults:c.budgets.maxQueryResults};
    if(kind==='cast'){const velocity=vector(q.velocity,'cast velocity'),maxTime=finite(q.maxTime,'maxTime',0);vector(position.map((x,i)=>x+velocity[i]*maxTime),'cast endpoint');result={...base,velocity,maxTime,targetDistance:finite(q.targetDistance??0,'targetDistance',0),stopAtPenetration:boolean(q.stopAtPenetration??true,'stopAtPenetration')};}
    else result=base;
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>c.budgets.maxConfigBytes)rigidError('E_RIGID_BUDGET','Query exceeds maxConfigBytes');return result;
}
