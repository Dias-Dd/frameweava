import type {FrameContext,Signal} from '../../../src/core/types.ts';import type {Vec3,VectorSignal,DeformableOptions,DeformableFrame,DeformableSimulation} from './types.ts';
export type Quaternion=[number,number,number,number];
export type QuaternionSignal=[Signal<number>,Signal<number>,Signal<number>,Signal<number>];
export interface CosseratRod {
 closed?:boolean;restOrientations:Quaternion[];orientations?:Quaternion[];angularVelocities?:Vec3[];inverseOrientationMasses:number[];
 /** Local material axes: shear x/y and stretch z. Dimensionless PBD coefficients 0..1. */
 stretchShearStiffness?:Vec3|Vec3[];
 /** Local bend x/y and twist z. Not XPBD compliance or a calibrated elastic modulus. */
 bendTwistStiffness?:Vec3|Vec3[];
 orientationPins?:{segment:number;target:QuaternionSignal}[];
 angularAcceleration?:VectorSignal;angularDampingRate?:number;
}
export interface RodResiduals {maxStretchShearResidual:number;maxBendQuaternionResidual:number;maxTwistQuaternionResidual:number}
export interface RodFrame extends DeformableFrame {orientations:Quaternion[];angularVelocities:Vec3[];rod:{closed:boolean;model:'cosserat-pbd';regularizer:0.000001}&RodResiduals}
export type RodOptions=Pick<DeformableOptions,'fps'|'substeps'|'iterations'|'seed'|'gravity'|'acceleration'|'dampingRate'|'collision'|'budgets'|'velocities'|'positions'|'pins'>&Omit<CosseratRod,'restOrientations'|'inverseOrientationMasses'>&{
 linearDensity?:number;fixedParticles?:number[];fixedSegments?:number[];restOrientations?:Quaternion[];inverseOrientationMasses?:number[];
};

export type RodSimulation=Omit<DeformableSimulation,'sample'>&{sample(context:FrameContext):Promise<RodFrame>};
