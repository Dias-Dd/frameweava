import type {Signal,FrameContext} from '../../src/core/types.ts';import type {AovObject,AovMaterial,AovFrame,AovSample} from './aov-types.ts';import type {AnimatedVec3,CreationColor,CreationInit,CreationInputs,CreationOptions} from './types.ts';import type {CreationCamera} from './object-controls.ts';import type {ParticleMapSource} from './mapped-particle-field.ts';
export interface PhysicalMaterial extends AovMaterial {model?:'ggx'|'lambert'|'unlit';roughness?:Signal<number>;metalness?:Signal<number>;castShadow?:boolean;receiveShadow?:boolean}
export interface LitObject extends Omit<AovObject,'material'> {material:PhysicalMaterial}
export interface SunLight {kind:'sun';direction:AnimatedVec3;color?:CreationColor;intensity?:Signal<number>;angularRadius?:Signal<number>;samples?:number;shadows?:boolean}
export interface PointLight {kind:'point';position:AnimatedVec3;color?:CreationColor;intensity?:Signal<number>;minDistance?:number;shadows?:boolean}
export interface SpotLight extends Omit<PointLight,'kind'> {kind:'spot';direction:AnimatedVec3;innerAngle?:Signal<number>;outerAngle?:Signal<number>}
export type PhysicalLight=SunLight|PointLight|SpotLight;
export interface EnvironmentOptions {intensity?:Signal<number>;rotation?:Signal<number>;samples?:number;occlusion?:boolean;background?:boolean;backgroundOpacity?:Signal<number>}
export type PhysicalEnvironment=EnvironmentOptions&({kind:'constant';color:CreationColor}|{kind:'image';source:ParticleMapSource}|{kind:'studio';resolution?:readonly[number,number];sky?:CreationColor;ground?:CreationColor;key?:CreationColor;fill?:CreationColor});
export interface PhysicalLightingOptions {lights?:readonly PhysicalLight[];environment?:PhysicalEnvironment;shadowBias?:number;maxRayTests?:number;maxBytes?:number;samplesPerPixel?:number}
export interface LitSceneOptions extends PhysicalLightingOptions,CreationOptions {objects:readonly LitObject[];camera?:CreationCamera}
export type LightingResponse=Pick<PhysicalMaterial,'name'|'model'|'roughness'|'metalness'|'castShadow'|'receiveShadow'>;
export interface LitRenderOptions extends PhysicalLightingOptions {materials:readonly LightingResponse[];format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export type {CreationInit,CreationInputs,CreationColor,FrameContext,AovFrame,AovSample};
