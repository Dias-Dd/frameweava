import type {FrameContext, Rational, Signal} from '../../../src/core/types.ts';
import type {ColorEncoding,ProfessionalSurface} from '../../../src/media/surface.ts';
import type {NoiseOptions} from './noise.ts';

/** World units are meters, right-handed, +Y up, +Z towards the viewer (Graphics Coordinates3D). */
export type Vec3 = [number, number, number];
export type ParticleForce =
  | {kind:'acceleration'; value:Vec3}
  | {kind:'drag'; coefficient:number}
  | {kind:'attractor'; center:Vec3; strength:number; softening?:number}
  | {kind:'vortex'; center:Vec3; axis:Vec3; strength:number; softening?:number}
  | {kind:'curl';noise:NoiseOptions;strength:number;epsilon?:number;motion?:Vec3};
interface CollisionMaterial {id:string; restitution?:number; friction?:number}
export type ParticleCollider = CollisionMaterial & (
  | {kind:'plane'; normal:Vec3; offset:number}
  | {kind:'sphere'; center:Vec3; radius:number}
);
export interface ParticleBudgets {
  /** Configurable safety limits, not algorithmic ceilings. CPU/driver physical peak is unknown. */
  maxParticles?:number; maxValueBytes?:number; maxReplaySteps?:number;
  checkpointInterval?:number; maxCheckpoints?:number; maxImpactsPerStep?:number;maxEnvironmentQueriesPerStep?:number;
  /** Includes short-lived births and recursive event fan-out, not just survivors. */
  maxSpawnsPerStep?:number;
}
export interface ParticleSubEmitter {
  id:string;on:'birth'|'collision'|'death';count:number;lifetime:number;
  /** Root is generation 0. A rule may create children up to this generation. */
  maxGeneration?:number;from?:readonly string[];
  velocity?:Vec3;velocityJitter?:Vec3;inheritVelocity?:number;normalSpeed?:number;positionOffset?:Vec3;
  radius?:number;ink?:Vec3;opacity?:number;
}
export interface FeedbackParticleOptions {
  fps:number|Rational; seed?:number; substeps?:number;
  /** Absolute session seconds; same-time continuous birth sorts before bursts, then source order. */
  bursts?:readonly {time:number;count:number}[];
  rate:number; lifetime:number; startTime?:number; duration?:number;
  origin:Vec3; positionJitter?:Vec3; velocity:Vec3; velocityJitter?:Vec3;
  radius?:number; forces?:readonly ParticleForce[]; colliders?:readonly ParticleCollider[];
  trailPoints?:number; trailEverySteps?:number; budgets?:ParticleBudgets;
  subEmitters?:readonly ParticleSubEmitter[];
}
export interface FeedbackParticle {
  id:number; birthTime:number; lifetime:number; radius:number;
  /** Optional scene-linear unassociated image ink; source alpha inheritance is explicit. */
  ink?:Vec3;opacity?:number;
  parentId?:number;generation?:number;sourceId?:string;
  position:Vec3; velocity:Vec3; trail:Vec3[];
}
export interface ParticleContact {particleId:number; colliderId:string; time:number; point:Vec3; normal:Vec3;/** Captured post-impact velocity for event-driven child inheritance. */velocity?:Vec3;/** Actual obstacle witness; point retains legacy particle-center semantics. */surfacePoint?:Vec3}
export interface ParticleEmissionEvent {sequence:number;time:number;kind:'birth'|'collision'|'death';parentId:number;childId:number;sourceId:string;generation:number}
export interface ParticleSnapshot {step:number; particles:FeedbackParticle[]; contacts:ParticleContact[]; emitted:number;nextParticleId?:number;subEmitted?:number;eventSequence?:number;events?:ParticleEmissionEvent[]}
export interface ParticleFrame extends ParticleSnapshot {frame:number; time:number; fps:Rational; seed:number;appearanceColor?:ColorEncoding}
export interface FeedbackParticles {
  sample(context:FrameContext):ParticleFrame;
  reset():void;
  readonly checkpointSteps:readonly number[];
}
export interface ParticleStyle {
  /** Scene-linear unassociated ink in the explicitly chosen working color space. Signed/HDR RGB allowed. */
  ink?:Vec3; opacity?:Signal<number>; radiusScale?:Signal<number>;
  trailOpacity?:Signal<number>; trailWidth?:Signal<number>; fadeWithAge?:boolean;
  /** Optional age-derived multipliers. Existing global Signals and fade remain multiplicative. */
  overLife?:import('./appearance.ts').ParticleLifeCurves;
  rotation?:Signal<number>;aspectRatio?:Signal<number>;spriteFrame?:Signal<number>;
}

/** Borrowed same-Stage synchronous collision service. Never stored in a checkpoint. */
export interface ParticleCollisionEnvironment {
  readonly identity:string;readonly colliderIds:readonly string[];
  check():void;
  sweepSphere(request:{position:Vec3;velocity:Vec3;radius:number;duration:number}):null|{
    time:number;point:Vec3;normal:Vec3;penetration:number;colliderId:string;
    restitution:number;/** Coulomb friction coefficient. */friction:number;
  };
}
export interface ParticleEmitter {
  readonly identity:string;readonly color?:Readonly<ColorEncoding>;
  check():void;
  /** Synchronous completed geometry/attributes. RNG uses seed+stable birth ordinal. */
  sample(seed:number,ordinal:number):{position:Vec3;ink?:Vec3;opacity?:number};
}
export interface ImageEmitterOptions {
  id:string;bounds:{left:number;right:number;bottom:number;top:number;z?:number};
  threshold?:number;weight?:'alpha'|'uniform';inherit?:'none'|'color'|'color-alpha';sampling?:'center'|'pixel-area';
  maxSourcePixels?:number;maxValueBytes?:number;
}
export interface ImageParticleEmitter extends ParticleEmitter {
  diagnostics():{identity:string;disposed:boolean;selectedPixels:number;totalWeight:number;sourceWidth:number;sourceHeight:number;plannedValueBytes:number;weight:string;inherit:string;sampling:string};
  dispose():void;
}
export interface FeedbackParticleTools {collisionEnvironment?:ParticleCollisionEnvironment;/** Borrowed same-Stage source; no handle enters a checkpoint. */emitter?:ParticleEmitter}


export interface ParticleSpriteAtlas {
  /** Copied once at owner creation; the caller keeps ownership of this input. */
  source:ProfessionalSurface;columns:number;rows:number;count?:number;
  sampling?:'nearest'|'linear';boundary?:'zero'|'clamp';frameBlending?:boolean;
}

