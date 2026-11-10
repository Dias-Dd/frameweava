export {createCharacterRenderer} from './character-renderer.ts';
export type {CharacterRenderOptions,CharacterTextureBinding} from './character-renderer.ts';
export type * from './character-assets.ts';
export * from './character-controls.ts';
export {importGltfCharacter,importBvhMotion,characterGraphicsAsset} from './character-import.ts';
export {characterDocument,createCharacterAnimator,createCharacterRetargeter,characterRootMotion} from './character-animation.ts';
export type {CharacterRetargetOptions} from './character-animation.ts';
export type {CharacterActorOptions} from './character-actor.ts';
export * from './coupled-models.ts';
export {fractureBodies} from './fracture-bodies.ts';
export type {FractureBodyOptions} from './fracture-bodies.ts';
export {createCoupledPhysics} from './coupled-physics.ts';
export type {CoupledWorldOptions,CoupledFrame,CoupledPiece,CoupledEvent} from './coupled-physics.ts';
export type {CoupledSceneOptions} from './coupled-scenes.ts';
export {lightingDefaults,lightingRig,studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting} from './studio-lighting.ts';
export {cameraView} from './view-presets.ts';
export {materialPreset} from './material-presets.ts';
export {linearColor} from './colors.ts';
export * from './puppet-controls.ts';
export * from './particle-mapping.ts';
/** Package entry has no device or WASM side effects. Named functions are bound
 * by the existing R1 v2 initializer inside an explicitly authored Native Stage. */
export {ownedPost,retainedPost} from './lifecycle.ts';
export {clothSheet,ballBody,boxBody,groundBody,springJoint} from './physics-assets.ts';

export {foamPopTime,foamBubbleRadius,foamPairForce,createFoamSimulation,renderFoamBubbles} from './foam.ts';
export type {FoamOptions,FoamGpuFrame} from './foam.ts';
export * from './shatter-geometry.ts';
export type {ShatterImageOptions,ShatterMeshOptions} from './shatter.ts';

export * from './water-controls.ts';
export {createWaveWorld,renderWaveWorld} from './wave-world.ts';
export type {WaveWorldOptions,WaveGpuFrame} from './wave-world.ts';
export {renderHeightCaustics,causticFocus,refractHeightSlope} from './height-caustics.ts';
export type {HeightCausticsOptions} from './height-caustics.ts';

export * from './contact-models.ts';
export {createContactPhysics} from './contact-physics.ts';
export type {ContactPhysicsOptions,ContactPhysicsFrame} from './contact-physics.ts';
export type {PhysicsContact} from './contact-codec.ts';
export type {ContactSceneOptions,CollidingClothOptions,CollidingRopeOptions,CollidingParticlesOptions} from './contact-scenes.ts';

export * from './rendering.ts';
