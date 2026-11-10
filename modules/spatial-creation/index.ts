export {createCharacterRenderer} from './character-renderer.ts';
export type {CharacterRenderOptions,CharacterTextureBinding} from './character-renderer.ts';
import {characterActor} from './character-actor.ts';
export type * from './character-assets.ts';
export * from './character-controls.ts';
export {importGltfCharacter,importBvhMotion,characterGraphicsAsset} from './character-import.ts';
export {characterDocument,createCharacterAnimator,createCharacterRetargeter,characterRootMotion} from './character-animation.ts';
export type {CharacterRetargetOptions} from './character-animation.ts';
export type {CharacterActorOptions} from './character-actor.ts';
import {coupledPhysicsScene} from './coupled-scenes.ts';
export * from './coupled-models.ts';
export {fractureBodies} from './fracture-bodies.ts';
export type {FractureBodyOptions} from './fracture-bodies.ts';
export {createCoupledPhysics} from './coupled-physics.ts';
export type {CoupledWorldOptions,CoupledFrame,CoupledPiece,CoupledEvent} from './coupled-physics.ts';
export type {CoupledSceneOptions} from './coupled-scenes.ts';
export type {LightingPreset,LightingRigControls,LightingRig,CreationLighting} from './studio-lighting.ts';
export type {CameraView,CameraViewControls,OrthographicViewControls,PerspectiveViewControls,OrbitViewControls} from './view-presets.ts';
export type {CreationMaterialPreset} from './material-presets.ts';
export {lightingDefaults,lightingRig,studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting} from './studio-lighting.ts';
export {cameraView} from './view-presets.ts';
export {materialPreset} from './material-presets.ts';
export {linearColor} from './colors.ts';
export * from './types.ts';
export * from './foam.ts';
export * from './contact-models.ts';
export {createContactPhysics} from './contact-physics.ts';
export type {ContactPhysicsOptions,ContactPhysicsFrame} from './contact-physics.ts';
export * from './contact-scenes.ts';
import {contactPhysicsScene,collidingCloth,collidingRope,collidingParticles} from './contact-scenes.ts';
export * from './water-controls.ts';
export * from './wave-world.ts';
export {heightCaustics,renderHeightCaustics,causticFocus,refractHeightSlope} from './height-caustics.ts';
import {waveWorld} from './wave-world.ts';
import {heightCaustics} from './height-caustics.ts';
export * from './shatter-geometry.ts';
export * from './shatter.ts';
import {foamField} from './foam.ts';
import {shatterImage,shatterMesh} from './shatter.ts';
export type {CreationFinish,FinishPreset,FinishControls,FinishGlow,FinishTint,FinishTritone} from './finish.ts';
export * from './particles.ts';
export * from './particle-field.ts';
export * from './composition.ts';
export * from './creation-scenes.ts';
export {stroke3D,neonStroke,neonRing,neonSpiral,orbitRibbons} from './strokes.ts';
export type {StrokeAppearance,StrokeGeometryOptions,Stroke3DOptions,NeonShapeOptions} from './strokes.ts';
export type {StrokeShapeOptions} from './stroke-shapes.ts';
export * from './electric.ts';
export * from './characters.ts';
export * from './image-characters.ts';
export * from './sculptures.ts';
export * from './clones.ts';
export * from './creator-effects.ts';
export * from './motion.ts';
export {arrangeCreations,rowCreations,columnCreations,gridCreations,radialCreations,arcCreations,spiralCreations,scatterCreations,cascadeCreations,fanCreations} from './layout.ts';
export type {CreationLayout,LayoutControls,LayoutOrientation,GridLayout,RadialLayout,ArcLayout,SpiralLayout,ScatterLayout,CascadeLayout,FanLayout,ArrangeCreationOptions,LayoutCreationOptions,GridCreationOptions,RadialCreationOptions,ArcCreationOptions,SpiralCreationOptions,ScatterCreationOptions,CascadeCreationOptions,FanCreationOptions} from './layout.ts';
export * from './cards.ts';
export * from './scenes.ts';
export * from './objects.ts';
export * from './physics.ts';
export * from './physics-scenes.ts';
export * from './puppet.ts';
export * from './puppet-controls.ts';
export * from './particle-mapping.ts';
export * from './mapped-particle-field.ts';
export {clothSheet,ballBody,boxBody,groundBody,springJoint} from './physics-assets.ts';
export type {ClothSheetOptions,BallBodyOptions,BoxBodyOptions,GroundBodyOptions,SpringJointOptions,BodyControls} from './physics-assets.ts';
export * from './shot.ts';
export {ownedPost,retainedPost} from './lifecycle.ts';
import type {CreationInit,CreationServices} from './types.ts';
import {particles,particleBurst,particleFountain,particleRain,vortexParticles} from './particles.ts';
import {mappedParticleField} from './mapped-particle-field.ts';
import {particleField,snowField,sparkField,bubbleField,fireflyField,dustField,confettiField,energyField,starField,petalField} from './particle-field.ts';
import {stackCreations,fadeCreation,crossfadeCreations,placeCreation,imageCreation,solidBackground,gradientBackground} from './composition.ts';
import {starlitRibbonScene,celebrationScene,energyScene} from './creation-scenes.ts';
import {stroke3D,neonStroke,neonRing,neonSpiral,orbitRibbons} from './strokes.ts';
import {lightningBolt,electricArc,lightningStrike,plasmaOrb,electricScene} from './electric.ts';
import {puppetCharacter,characterIdle,characterWave,characterWalk,characterRun,characterJump,characterDance,characterPoint,characterReach,characterScene} from './characters.ts';
import {imageCharacter,imageCharacterIdle,imageCharacterWave,imageCharacterWalk,imageCharacterRun,imageCharacterJump,imageCharacterDance,imageCharacterPoint,imageCharacterReach,imageCharacterScene} from './image-characters.ts';
import {arrangeCreations,rowCreations,columnCreations,gridCreations,radialCreations,arcCreations,spiralCreations,scatterCreations,cascadeCreations,fanCreations} from './layout.ts';
import {frameCreation,cardCreation,creationGallery} from './cards.ts';
import {animateCreation,fadeInCreation,fadeOutCreation,slideInCreation,slideOutCreation,popInCreation,popOutCreation,spinInCreation,spinOutCreation,springInCreation,floatCreation,pulseCreation,swingCreation,staggerCreations} from './motion.ts';
import {blurCreation,glowCreation,shadowCreation,innerShadowCreation,outlineCreation,sharpenCreation,pixelateCreation,chromaKeyCreation,lumaKeyCreation,wobbleCreation,maskCreation} from './creator-effects.ts';
import {clones3D,lineClones,gridClones,radialClones,sphereClones,scatterClones,helixClones,spiralClones,honeycombClones,waveClones,cloneScene} from './clones.ts';
import {box3D,sphere3D,torus3D,cylinder3D,cone3D,capsule3D,knot3D,icosahedron3D,mesh3D,sculptureScene} from './sculptures.ts';
import {orbitalScene,crystalScene,emberScene,lagoonScene,noiseTexture} from './scenes.ts';
import {silkRibbon,characterMotion,puppetCard} from './objects.ts';
import {ribbonScene} from './shot.ts';
import {rigidScene,ropeScene,clothScene} from './physics.ts';
import {hangingCloth,windFlag,drapedCloth,bouncingBalls,dominoes} from './physics-scenes.ts';
import {puppetImage,puppetSway,puppetBend,puppetStretch,puppetBreathe,puppetWave,puppetJelly,puppetFlutter,puppetReach,puppetSquash} from './puppet.ts';
/** Source-level entry. R1 initialize binds this once so creators call only named
 * functions. Does not select a device, grant permissions, or own the scope. */
export function createSpatialCreation(init:CreationInit,services:CreationServices={}){
 return {
  characterActor:(o:Parameters<typeof characterActor>[1])=>characterActor(init,o),
  arrangeCreations:(s:Parameters<typeof arrangeCreations>[1],o?:Parameters<typeof arrangeCreations>[2])=>arrangeCreations(init,s,o),rowCreations:(s:Parameters<typeof rowCreations>[1],o?:Parameters<typeof rowCreations>[2])=>rowCreations(init,s,o),columnCreations:(s:Parameters<typeof columnCreations>[1],o?:Parameters<typeof columnCreations>[2])=>columnCreations(init,s,o),gridCreations:(s:Parameters<typeof gridCreations>[1],o?:Parameters<typeof gridCreations>[2])=>gridCreations(init,s,o),radialCreations:(s:Parameters<typeof radialCreations>[1],o?:Parameters<typeof radialCreations>[2])=>radialCreations(init,s,o),arcCreations:(s:Parameters<typeof arcCreations>[1],o?:Parameters<typeof arcCreations>[2])=>arcCreations(init,s,o),spiralCreations:(s:Parameters<typeof spiralCreations>[1],o?:Parameters<typeof spiralCreations>[2])=>spiralCreations(init,s,o),scatterCreations:(s:Parameters<typeof scatterCreations>[1],o?:Parameters<typeof scatterCreations>[2])=>scatterCreations(init,s,o),cascadeCreations:(s:Parameters<typeof cascadeCreations>[1],o?:Parameters<typeof cascadeCreations>[2])=>cascadeCreations(init,s,o),fanCreations:(s:Parameters<typeof fanCreations>[1],o?:Parameters<typeof fanCreations>[2])=>fanCreations(init,s,o),frameCreation:(s:Parameters<typeof frameCreation>[1],o?:Parameters<typeof frameCreation>[2])=>frameCreation(init,s,o),cardCreation:(s:Parameters<typeof cardCreation>[1],o?:Parameters<typeof cardCreation>[2])=>cardCreation(init,s,o),creationGallery:(s:Parameters<typeof creationGallery>[1],o?:Parameters<typeof creationGallery>[2])=>creationGallery(init,s,o),
  animateCreation:(s:Parameters<typeof animateCreation>[1],o?:Parameters<typeof animateCreation>[2])=>animateCreation(init,s,o),fadeInCreation:(s:Parameters<typeof fadeInCreation>[1],o?:Parameters<typeof fadeInCreation>[2])=>fadeInCreation(init,s,o),fadeOutCreation:(s:Parameters<typeof fadeOutCreation>[1],o?:Parameters<typeof fadeOutCreation>[2])=>fadeOutCreation(init,s,o),slideInCreation:(s:Parameters<typeof slideInCreation>[1],o?:Parameters<typeof slideInCreation>[2])=>slideInCreation(init,s,o),slideOutCreation:(s:Parameters<typeof slideOutCreation>[1],o?:Parameters<typeof slideOutCreation>[2])=>slideOutCreation(init,s,o),popInCreation:(s:Parameters<typeof popInCreation>[1],o?:Parameters<typeof popInCreation>[2])=>popInCreation(init,s,o),popOutCreation:(s:Parameters<typeof popOutCreation>[1],o?:Parameters<typeof popOutCreation>[2])=>popOutCreation(init,s,o),spinInCreation:(s:Parameters<typeof spinInCreation>[1],o?:Parameters<typeof spinInCreation>[2])=>spinInCreation(init,s,o),spinOutCreation:(s:Parameters<typeof spinOutCreation>[1],o?:Parameters<typeof spinOutCreation>[2])=>spinOutCreation(init,s,o),springInCreation:(s:Parameters<typeof springInCreation>[1],o?:Parameters<typeof springInCreation>[2])=>springInCreation(init,s,o),floatCreation:(s:Parameters<typeof floatCreation>[1],o?:Parameters<typeof floatCreation>[2])=>floatCreation(init,s,o),pulseCreation:(s:Parameters<typeof pulseCreation>[1],o?:Parameters<typeof pulseCreation>[2])=>pulseCreation(init,s,o),swingCreation:(s:Parameters<typeof swingCreation>[1],o?:Parameters<typeof swingCreation>[2])=>swingCreation(init,s,o),staggerCreations:(s:Parameters<typeof staggerCreations>[1],o?:Parameters<typeof staggerCreations>[2])=>staggerCreations(init,s,o),
  blurCreation:(source:Parameters<typeof blurCreation>[1],o?:Parameters<typeof blurCreation>[2])=>blurCreation(init,source,o),glowCreation:(source:Parameters<typeof glowCreation>[1],o?:Parameters<typeof glowCreation>[2])=>glowCreation(init,source,o),shadowCreation:(source:Parameters<typeof shadowCreation>[1],o?:Parameters<typeof shadowCreation>[2])=>shadowCreation(init,source,o),innerShadowCreation:(source:Parameters<typeof innerShadowCreation>[1],o?:Parameters<typeof innerShadowCreation>[2])=>innerShadowCreation(init,source,o),outlineCreation:(source:Parameters<typeof outlineCreation>[1],o?:Parameters<typeof outlineCreation>[2])=>outlineCreation(init,source,o),sharpenCreation:(source:Parameters<typeof sharpenCreation>[1],o?:Parameters<typeof sharpenCreation>[2])=>sharpenCreation(init,source,o),pixelateCreation:(source:Parameters<typeof pixelateCreation>[1],o?:Parameters<typeof pixelateCreation>[2])=>pixelateCreation(init,source,o),chromaKeyCreation:(source:Parameters<typeof chromaKeyCreation>[1],o?:Parameters<typeof chromaKeyCreation>[2])=>chromaKeyCreation(init,source,o),lumaKeyCreation:(source:Parameters<typeof lumaKeyCreation>[1],o?:Parameters<typeof lumaKeyCreation>[2])=>lumaKeyCreation(init,source,o),wobbleCreation:(source:Parameters<typeof wobbleCreation>[1],o?:Parameters<typeof wobbleCreation>[2])=>wobbleCreation(init,source,o),maskCreation:(source:Parameters<typeof maskCreation>[1],mask:Parameters<typeof maskCreation>[2],o?:Parameters<typeof maskCreation>[3])=>maskCreation(init,source,mask,o),
  clones3D:(o:Parameters<typeof clones3D>[1])=>clones3D(init,o),lineClones:(o?:Parameters<typeof lineClones>[1])=>lineClones(init,o),gridClones:(o?:Parameters<typeof gridClones>[1])=>gridClones(init,o),radialClones:(o?:Parameters<typeof radialClones>[1])=>radialClones(init,o),sphereClones:(o?:Parameters<typeof sphereClones>[1])=>sphereClones(init,o),scatterClones:(o?:Parameters<typeof scatterClones>[1])=>scatterClones(init,o),helixClones:(o?:Parameters<typeof helixClones>[1])=>helixClones(init,o),spiralClones:(o?:Parameters<typeof spiralClones>[1])=>spiralClones(init,o),honeycombClones:(o?:Parameters<typeof honeycombClones>[1])=>honeycombClones(init,o),waveClones:(o?:Parameters<typeof waveClones>[1])=>waveClones(init,o),cloneScene:(o?:Parameters<typeof cloneScene>[1])=>cloneScene(init,o),
  box3D:(o?:Parameters<typeof box3D>[1])=>box3D(init,o),sphere3D:(o?:Parameters<typeof sphere3D>[1])=>sphere3D(init,o),torus3D:(o?:Parameters<typeof torus3D>[1])=>torus3D(init,o),cylinder3D:(o?:Parameters<typeof cylinder3D>[1])=>cylinder3D(init,o),cone3D:(o?:Parameters<typeof cone3D>[1])=>cone3D(init,o),capsule3D:(o?:Parameters<typeof capsule3D>[1])=>capsule3D(init,o),knot3D:(o?:Parameters<typeof knot3D>[1])=>knot3D(init,o),icosahedron3D:(o?:Parameters<typeof icosahedron3D>[1])=>icosahedron3D(init,o),mesh3D:(o:Parameters<typeof mesh3D>[1])=>mesh3D(init,o),sculptureScene:(o?:Parameters<typeof sculptureScene>[1])=>sculptureScene(init,o),
  imageCharacter:(o:Parameters<typeof imageCharacter>[1])=>imageCharacter(init,o),imageCharacterIdle:(o:Parameters<typeof imageCharacterIdle>[1])=>imageCharacterIdle(init,o),imageCharacterWave:(o:Parameters<typeof imageCharacterWave>[1])=>imageCharacterWave(init,o),imageCharacterWalk:(o:Parameters<typeof imageCharacterWalk>[1])=>imageCharacterWalk(init,o),imageCharacterRun:(o:Parameters<typeof imageCharacterRun>[1])=>imageCharacterRun(init,o),imageCharacterJump:(o:Parameters<typeof imageCharacterJump>[1])=>imageCharacterJump(init,o),imageCharacterDance:(o:Parameters<typeof imageCharacterDance>[1])=>imageCharacterDance(init,o),imageCharacterPoint:(o:Parameters<typeof imageCharacterPoint>[1])=>imageCharacterPoint(init,o),imageCharacterReach:(o:Parameters<typeof imageCharacterReach>[1])=>imageCharacterReach(init,o),imageCharacterScene:(o:Parameters<typeof imageCharacterScene>[1])=>imageCharacterScene(init,o),
  puppetCharacter:(o?:Parameters<typeof puppetCharacter>[1])=>puppetCharacter(init,o),characterIdle:(o?:Parameters<typeof characterIdle>[1])=>characterIdle(init,o),characterWave:(o?:Parameters<typeof characterWave>[1])=>characterWave(init,o),characterWalk:(o?:Parameters<typeof characterWalk>[1])=>characterWalk(init,o),characterRun:(o?:Parameters<typeof characterRun>[1])=>characterRun(init,o),characterJump:(o?:Parameters<typeof characterJump>[1])=>characterJump(init,o),characterDance:(o?:Parameters<typeof characterDance>[1])=>characterDance(init,o),characterPoint:(o?:Parameters<typeof characterPoint>[1])=>characterPoint(init,o),characterReach:(o?:Parameters<typeof characterReach>[1])=>characterReach(init,o),characterScene:(o?:Parameters<typeof characterScene>[1])=>characterScene(init,o),
  stroke3D:(o:Parameters<typeof stroke3D>[1])=>stroke3D(init,o),neonStroke:(o:Parameters<typeof neonStroke>[1])=>neonStroke(init,o),neonRing:(o?:Parameters<typeof neonRing>[1])=>neonRing(init,o),neonSpiral:(o?:Parameters<typeof neonSpiral>[1])=>neonSpiral(init,o),orbitRibbons:(o?:Parameters<typeof orbitRibbons>[1])=>orbitRibbons(init,o),lightningBolt:(o?:Parameters<typeof lightningBolt>[1])=>lightningBolt(init,o),electricArc:(o?:Parameters<typeof electricArc>[1])=>electricArc(init,o),lightningStrike:(o?:Parameters<typeof lightningStrike>[1])=>lightningStrike(init,o),plasmaOrb:(o?:Parameters<typeof plasmaOrb>[1])=>plasmaOrb(init,o),electricScene:(o?:Parameters<typeof electricScene>[1])=>electricScene(init,o),
  stackCreations:(items:Parameters<typeof stackCreations>[1],o?:Parameters<typeof stackCreations>[2])=>stackCreations(init,items,o),fadeCreation:(item:Parameters<typeof fadeCreation>[1],opacity:Parameters<typeof fadeCreation>[2],o?:Parameters<typeof fadeCreation>[3])=>fadeCreation(init,item,opacity,o),crossfadeCreations:(from:Parameters<typeof crossfadeCreations>[1],to:Parameters<typeof crossfadeCreations>[2],amount:Parameters<typeof crossfadeCreations>[3],o?:Parameters<typeof crossfadeCreations>[4])=>crossfadeCreations(init,from,to,amount,o),placeCreation:(item:Parameters<typeof placeCreation>[1],o?:Parameters<typeof placeCreation>[2])=>placeCreation(init,item,o),imageCreation:(o:Parameters<typeof imageCreation>[1])=>imageCreation(init,o),solidBackground:(o?:Parameters<typeof solidBackground>[1])=>solidBackground(init,o),gradientBackground:(o?:Parameters<typeof gradientBackground>[1])=>gradientBackground(init,o),starlitRibbonScene:(o?:Parameters<typeof starlitRibbonScene>[1])=>starlitRibbonScene(init,o),celebrationScene:(o?:Parameters<typeof celebrationScene>[1])=>celebrationScene(init,o),energyScene:(o?:Parameters<typeof energyScene>[1])=>energyScene(init,o),
  particles:(o?:Parameters<typeof particles>[1])=>particles(init,o),particleBurst:(o?:Parameters<typeof particleBurst>[1])=>particleBurst(init,o),particleFountain:(o?:Parameters<typeof particleFountain>[1])=>particleFountain(init,o),particleRain:(o?:Parameters<typeof particleRain>[1])=>particleRain(init,o),vortexParticles:(o?:Parameters<typeof vortexParticles>[1])=>vortexParticles(init,o),
  coupledPhysicsScene:(o:Parameters<typeof coupledPhysicsScene>[1])=>coupledPhysicsScene(init,o,services.coupled),
  contactPhysicsScene:(o:Parameters<typeof contactPhysicsScene>[1])=>contactPhysicsScene(init,o,services.contacts),collidingCloth:(o?:Parameters<typeof collidingCloth>[1])=>collidingCloth(init,o,services.contacts),collidingRope:(o?:Parameters<typeof collidingRope>[1])=>collidingRope(init,o,services.contacts),collidingParticles:(o?:Parameters<typeof collidingParticles>[1])=>collidingParticles(init,o,services.contacts),
  waveWorld:(o?:Parameters<typeof waveWorld>[1])=>waveWorld(init,o),heightCaustics:(o:Parameters<typeof heightCaustics>[1])=>heightCaustics(init,o),
  foamField:(o?:Parameters<typeof foamField>[1])=>foamField(init,o),shatterImage:(o:Parameters<typeof shatterImage>[1])=>shatterImage(init,o),shatterMesh:(o:Parameters<typeof shatterMesh>[1])=>shatterMesh(init,o),
  mappedParticleField:(o?:Parameters<typeof mappedParticleField>[1])=>mappedParticleField(init,o),particleField:(o?:Parameters<typeof particleField>[1])=>particleField(init,o),snowField:(o?:Parameters<typeof snowField>[1])=>snowField(init,o),sparkField:(o?:Parameters<typeof sparkField>[1])=>sparkField(init,o),bubbleField:(o?:Parameters<typeof bubbleField>[1])=>bubbleField(init,o),fireflyField:(o?:Parameters<typeof fireflyField>[1])=>fireflyField(init,o),dustField:(o?:Parameters<typeof dustField>[1])=>dustField(init,o),confettiField:(o?:Parameters<typeof confettiField>[1])=>confettiField(init,o),energyField:(o?:Parameters<typeof energyField>[1])=>energyField(init,o),starField:(o?:Parameters<typeof starField>[1])=>starField(init,o),petalField:(o?:Parameters<typeof petalField>[1])=>petalField(init,o),
  orbitalScene:(o?:Parameters<typeof orbitalScene>[1])=>orbitalScene(init,o),crystalScene:(o?:Parameters<typeof crystalScene>[1])=>crystalScene(init,o),emberScene:(o?:Parameters<typeof emberScene>[1])=>emberScene(init,o),lagoonScene:(o?:Parameters<typeof lagoonScene>[1])=>lagoonScene(init,o),noiseTexture:(o?:Parameters<typeof noiseTexture>[1])=>noiseTexture(init,o),
  silkRibbon:(o?:Parameters<typeof silkRibbon>[1])=>silkRibbon(init,o),ribbonScene:(o?:Parameters<typeof ribbonScene>[1])=>ribbonScene(init,o),characterMotion:(o:Parameters<typeof characterMotion>[1])=>characterMotion(init,o),puppetCard:(o:Parameters<typeof puppetCard>[1])=>puppetCard(init,o,services.puppet),rigidScene:(o?:Parameters<typeof rigidScene>[1])=>rigidScene(init,o,services.rigid),ropeScene:(o?:Parameters<typeof ropeScene>[1])=>ropeScene(init,o,services.deform),clothScene:(o:Parameters<typeof clothScene>[1])=>clothScene(init,o,services.deform),
  hangingCloth:(o?:Parameters<typeof hangingCloth>[1])=>hangingCloth(init,o,services.deform),windFlag:(o?:Parameters<typeof windFlag>[1])=>windFlag(init,o,services.deform),drapedCloth:(o?:Parameters<typeof drapedCloth>[1])=>drapedCloth(init,o,services.deform),bouncingBalls:(o?:Parameters<typeof bouncingBalls>[1])=>bouncingBalls(init,o,services.rigid),dominoes:(o?:Parameters<typeof dominoes>[1])=>dominoes(init,o,services.rigid),
  puppetImage:(o:Parameters<typeof puppetImage>[1])=>puppetImage(init,o,services.puppet),puppetSway:(o?:Parameters<typeof puppetSway>[1])=>puppetSway(init,o,services.puppet),puppetBend:(o?:Parameters<typeof puppetBend>[1])=>puppetBend(init,o,services.puppet),puppetStretch:(o?:Parameters<typeof puppetStretch>[1])=>puppetStretch(init,o,services.puppet),puppetBreathe:(o?:Parameters<typeof puppetBreathe>[1])=>puppetBreathe(init,o,services.puppet),puppetWave:(o?:Parameters<typeof puppetWave>[1])=>puppetWave(init,o,services.puppet),puppetJelly:(o?:Parameters<typeof puppetJelly>[1])=>puppetJelly(init,o,services.puppet),puppetFlutter:(o?:Parameters<typeof puppetFlutter>[1])=>puppetFlutter(init,o,services.puppet),puppetReach:(o?:Parameters<typeof puppetReach>[1])=>puppetReach(init,o,services.puppet),puppetSquash:(o?:Parameters<typeof puppetSquash>[1])=>puppetSquash(init,o,services.puppet),
 };
}

export * from './rendering.ts';
