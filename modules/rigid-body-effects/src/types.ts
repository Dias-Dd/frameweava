import type {FrameContext,Rational,Signal} from '../../../src/core/types.ts';
import type {Vec3,MeshData} from '../../graphics-contracts/types.ts';
export type {Vec3,MeshData};
/** Unit quaternion, XYZW, matching native Three/Graphics world axes. */
export type Quaternion=[number,number,number,number];
export type VectorSignal=[Signal<number>,Signal<number>,Signal<number>];
export type RigidShape={kind:'ball';radius:number}|{kind:'cuboid';halfExtents:Vec3}|{kind:'capsule';halfHeight:number;radius:number}
  |{kind:'convexHull';mesh:MeshData}
  |{kind:'trimesh';mesh:MeshData;internalEdges?:'raw'|'fix-two-sided'};
export interface RigidCollisionGroups {memberships:number;filter:number}
export interface RigidCollider {
  id:string;shape:RigidShape;position?:Vec3;rotation?:Quaternion;
  density?:number;friction?:number;restitution?:number;sensor?:boolean;forceThreshold?:number;groups?:RigidCollisionGroups;
}
export interface RigidBody {
  id:string;kind:'dynamic'|'fixed'|'kinematic';position?:Vec3;rotation?:Quaternion;
  linearVelocity?:Vec3;angularVelocity?:Vec3;linearDamping?:number;angularDamping?:number;gravityScale?:number;
  canSleep?:boolean;ccd?:boolean;lockTranslation?:[boolean,boolean,boolean];lockRotation?:[boolean,boolean,boolean];
  colliders:RigidCollider[];
  /** Newtons / Newton meters, sampled at each fixed substep's start using existing local-frame Signals. */
  force?:VectorSignal;torque?:VectorSignal;
  /** Local world meters at substep end; only for a position-driven kinematic body. */
  kinematicPosition?:VectorSignal;
}
interface JointBase {id:string;bodyA:string;bodyB:string;anchorA?:Vec3;anchorB?:Vec3;contacts?:boolean}
interface JointMotor {velocity:number;maxForce:number}
export type RigidJoint=JointBase&(
  |{kind:'fixed'|'spherical'}
  |{kind:'revolute'|'prismatic';axis:Vec3;limits?:[number,number];motor?:JointMotor}
  |{kind:'spring';restLength:number;stiffness:number;damping:number}
);
export interface RigidBudgets {
  maxBodies?:number;maxColliders?:number;maxJoints?:number;
  maxGeometryVertices?:number;maxGeometryTriangles?:number;maxConfigBytes?:number;maxQueryResults?:number;
  maxEventsPerStep?:number;maxPointsPerEvent?:number;
  maxSnapshotBytes?:number;maxCheckpointBytes?:number;maxOutputBytes?:number;
  checkpointInterval?:number;maxCheckpoints?:number;maxReplaySteps?:number;
}
export interface RigidWorldOptions {
  fps:number|Rational;substeps?:number;seed?:number;gravity?:Vec3;
  bodies:RigidBody[];joints?:RigidJoint[];
  solver?:{
    iterations?:number;ccdSubsteps?:number;lengthUnit?:number;
    /** Omitted means no finite speed clamp. Any explicit limit remains a physics parameter. */
    maxLinearVelocity?:number;
    allowedLinearError?:number;predictionDistance?:number;maxCorrectiveVelocity?:number;
    /** Contact spring frequency in Hz and damping ratio; finite softness permits penetration. */
    contactSoftness?:{frequency:number;dampingRatio:number};
    staticContactSoftness?:{frequency:number;dampingRatio:number};
    /** Disabled by default: upstream recycling permits stale contact features. */
    contactRecycling?:boolean;contactClustering?:boolean;
  };budgets?:RigidBudgets;
}
export interface RigidState {
  id:string;position:Vec3;rotation:Quaternion;linearVelocity:Vec3;angularVelocity:Vec3;sleeping:boolean;mass:number;
}
export interface RigidContact {
  kind:'started'|'stopped'|'force';step:number;time:number;
  colliderA:string;colliderB:string;bodyA:string;bodyB:string;sensor:boolean;started:boolean;
  totalForce:Vec3;totalMagnitude:number;maxForceDirection:Vec3;maxForceMagnitude:number;
  points:{pointA:Vec3;pointB:Vec3;normal:Vec3}[];
}
export interface RigidFrame {
  frame:number;time:number;step:number;fps:Rational;seed:number;
  bodies:RigidState[];contacts:RigidContact[];
}
export interface RigidDiagnostics {
  disposed:boolean;buffers:number;worlds:number;failed:boolean;currentStep:number;checkpointSteps:number[];
  snapshotBytes:number;plannedCheckpointBytes:number;physicalPeakBytes:null;
  backend:'rapier3d-f64-wasm';rapier:'0.36.1';precision:'f64';determinism:'enhanced';
}
export interface RigidQueryFilter {includeSensors?:boolean;excludeBodies?:string[];excludeColliders?:string[];groups?:RigidCollisionGroups}
export interface RigidRay {origin:Vec3;direction:Vec3;maxDistance:number;solid?:boolean;filter?:RigidQueryFilter}
export interface RigidShapeQuery {shape:Exclude<RigidShape,{kind:'trimesh'}>;position:Vec3;rotation?:Quaternion;filter?:RigidQueryFilter}
export interface RigidShapeCast extends RigidShapeQuery {velocity:Vec3;maxTime:number;targetDistance?:number;stopAtPenetration?:boolean}
export interface RigidQueryIdentity {colliderId:string;bodyId:string;sensor:boolean}
export interface RigidRayHit extends RigidQueryIdentity {distance:number;point:Vec3;normal:Vec3|null;feature:{kind:'vertex'|'edge'|'face'|'unknown';index:number|null}}
export interface RigidCastHit extends RigidQueryIdentity {timeOfImpact:number;pointMoving:Vec3;pointCollider:Vec3;normalCollider:Vec3|null;status:'converged'|'out-of-iterations'|'failed'|'penetrating-or-within-target';subshape:number}
export interface RigidQueryResult<T> {step:number;time:number;hits:T[]}
export interface RigidColliderMesh extends RigidQueryIdentity {kind:'convexHull'|'trimesh';position:Vec3;rotation:Quaternion;mesh:MeshData}
export interface RigidSimulation {
  sample(context:FrameContext):Promise<RigidFrame>;
  reset():Promise<void>;
  /** Passive queries of the current successful world; never advance time. */
  colliderMeshes():Promise<RigidColliderMesh[]>;
  castRay(ray:RigidRay):Promise<RigidQueryResult<RigidRayHit>>;
  castShape(query:RigidShapeCast):Promise<RigidQueryResult<RigidCastHit>>;
  intersections(query:RigidShapeQuery):Promise<RigidQueryResult<RigidQueryIdentity>>;
  diagnostics():Promise<RigidDiagnostics>;
  dispose():Promise<{remainingBuffers:number}>;
}
export interface RigidClientOptions {worker?:boolean;signal?:AbortSignal;initializationTimeoutMs?:number}

/** A Stage-local borrowed tool, not a PortValue, snapshot handle or Worker proxy. */
export interface SphereSweep {position:Vec3;velocity:Vec3;radius:number;duration:number}
export interface SphereSweepHit {time:number;point:Vec3;normal:Vec3;penetration:number;colliderId:string;bodyId:string;restitution:number;/** Coulomb coefficient, not tangential damping. */friction:number}
export interface StaticCollisionEnvironment {
  readonly identity:string;readonly colliderIds:readonly string[];
  check():void;
  /** Real synchronous WASM evaluation; initialization alone is asynchronous. */
  sweepSphere(request:SphereSweep):SphereSweepHit|null;
  colliderMeshes():RigidColliderMesh[];
  diagnostics():RigidDiagnostics&{sweeps:number;casts:number;contactQueries:number};
  dispose():{remainingBuffers:number};
}
export interface StaticCollisionClientOptions {signal?:AbortSignal;filter?:Omit<RigidQueryFilter,'includeSensors'>&{includeSensors?:false}}
