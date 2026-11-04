import type {CosseratRod,Quaternion,RodResiduals} from './rod-types.ts';
import type {FrameContext,Rational,Signal} from '../../../src/core/types.ts';
import type {KernelConstraint,Vec3} from './codec.ts';export type {KernelConstraint,Vec3};
import type {DeformableCollision,DeformableContact} from './contact-codec.ts';export type {DeformableCollider,DeformableCollision,DeformableContact} from './contact-codec.ts';
export type VectorSignal=[Signal<number>,Signal<number>,Signal<number>];
export interface DeformableBudgets {maxAerodynamicFaces?:number;maxParticles?:number;maxConstraints?:number;maxColliders?:number;maxContactsPerStep?:number;maxProjectionWork?:number;maxSnapshotBytes?:number;maxCheckpointBytes?:number;maxOutputBytes?:number;maxReplaySteps?:number;checkpointInterval?:number;maxCheckpoints?:number}
export interface DeformableOptions {aerodynamics?:import('./aero-types.ts').FaceAerodynamics;rod?:CosseratRod;fps:number|Rational;substeps?:number;iterations?:number;seed?:number;restPositions:Vec3[];positions?:Vec3[];velocities?:Vec3[];inverseMasses:number[];constraints:KernelConstraint[];gravity?:Vec3;acceleration?:VectorSignal;dampingRate?:number;pins?:{particle:number;target:VectorSignal}[];collision?:DeformableCollision;budgets?:DeformableBudgets}
export interface DeformableFrame {aerodynamics?:import('./aero-types.ts').AerodynamicSample;orientations?:Quaternion[];angularVelocities?:Vec3[];rod?:{closed:boolean;model:'cosserat-pbd';regularizer:0.000001}&RodResiduals;frame:number;time:number;step:number;fps:Rational;seed:number;positions:Vec3[];velocities:Vec3[];multipliers:number[];maxDistanceResidual:number;maxBendResidual:number;maxDihedralResidual?:number;maxVolumeResidual:number;invertedTetrahedra:number;collapsedTetrahedra:number;contacts:DeformableContact[];maxPenetration:number;maxNormalVelocityResidual:number}
export interface DeformableDiagnostics {disposed:boolean;buffers:number;kernels:number;failed:boolean;currentStep:number;checkpointSteps:number[];snapshotBytes:number;plannedCheckpointBytes:number;physicalPeakBytes:null;backend:'xpbd-f64-wasm'|'cosserat-pbd-f64-wasm'}
export interface DeformableSimulation {sample(context:FrameContext):Promise<DeformableFrame>;reset():Promise<void>;diagnostics():Promise<DeformableDiagnostics>;dispose():Promise<{remainingBuffers:number}>}
export interface DeformableClientOptions {worker?:boolean;signal?:AbortSignal;initializationTimeoutMs?:number}

export type * from './rod-types.ts';

export type * from './aero-types.ts';
