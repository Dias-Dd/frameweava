import {sceneBindings} from './scene-bindings.ts';
import {createCharacterRenderer} from './character-renderer.ts';
import * as characterControls from './character-controls.ts';import {importGltfCharacter,importBvhMotion,characterGraphicsAsset} from './character-import.ts';import {characterDocument,createCharacterAnimator,createCharacterRetargeter,characterRootMotion} from './character-animation.ts';
import * as coupledModels from './coupled-models.ts';import {createCoupledPhysics} from './coupled-physics.ts';import {fractureBodies} from './fracture-bodies.ts';
import {lightingDefaults,lightingRig,studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting} from './studio-lighting.ts';
import {cameraView} from './view-presets.ts';
import {materialPreset} from './material-presets.ts';
import {linearColor} from './colors.ts';
import * as puppetControls from './puppet-controls.ts';
import * as particleMapping from './particle-mapping.ts';
import {foamPopTime,foamBubbleRadius,foamPairForce,createFoamSimulation,renderFoamBubbles} from './foam.ts';
import * as shatterGeometry from './shatter-geometry.ts';
import * as waterControls from './water-controls.ts';
import * as contactModels from './contact-models.ts';
import {createContactPhysics} from './contact-physics.ts';
import {createWaveWorld,renderWaveWorld} from './wave-world.ts';
import {renderHeightCaustics,causticFocus,refractHeightSlope} from './height-caustics.ts';
import type {NativePluginInit,ModuleLoader} from '../../src/plugins/sdk.ts';
import {createSpatialCreation} from './index.ts';
import {fail,ownedPost,retainedPost} from './lifecycle.ts';
import type {CreationStage} from './types.ts';
import {clothSheet,ballBody,boxBody,groundBody,springJoint} from './physics-assets.ts';
/** Ordinary R1 v2. All resource admission, sealing and authorization remains in
 * the loader. This remaps only the three carried, declared resource names. */
export function initialize(init:NativePluginInit){
 if(init.backend!=='native-gpu'||!init.gpu)fail('Native bindings require an admitted scope','E_CREATION_DEVICE');
 const resource=(name:string):ModuleLoader=>(async(request:any)=>{if(request.module!=='bytes'||request.format!=='resource'||Object.keys(request).some(k=>!['module','format'].includes(k)))fail('Only the existing solver byte request is admitted','E_CREATION_SERVICE');return init.loadModule({module:name,format:'resource'});}) as ModuleLoader;
 const sceneLibrary=sceneBindings(init);
 const api=createSpatialCreation({...init,gpu:init.gpu},{puppet:resource('puppetBytes'),rigid:resource('rigidBytes'),deform:resource('deformBytes'),contacts:resource('contactBytes'),coupled:resource('coupledBytes')}),instances=new Set<CreationStage>(),pending=new Set<Promise<CreationStage>>();let closed=false,closing:Promise<void>|undefined;
 const exports=Object.fromEntries(Object.entries(api).map(([name,fn])=>[name,(...args:unknown[])=>{
  if(closed)return Promise.reject(Object.assign(new Error('Creation module disposed'),{code:'E_CREATION_CLOSED'}));
  const task=(async()=>{const instance=await Reflect.apply(fn,api,args);if(closed){await instance.dispose?.();fail('Creation module disposed','E_CREATION_CLOSED');}instances.add(instance);const dispose=instance.dispose?.bind(instance);instance.dispose=async()=>{try{await dispose?.();}finally{instances.delete(instance);}};return instance;})();
  pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
 }])) as {[K in keyof typeof api]:(...args:Parameters<typeof api[K]>)=>Promise<Awaited<ReturnType<typeof api[K]>>>};
 return {exports:{...exports,...sceneLibrary.exports,createCharacterRenderer,...characterControls,importGltfCharacter,importBvhMotion,characterGraphicsAsset,characterDocument,createCharacterAnimator,createCharacterRetargeter,characterRootMotion,...coupledModels,createCoupledPhysics,fractureBodies,...puppetControls,...particleMapping,...shatterGeometry,...waterControls,...contactModels,createContactPhysics,createWaveWorld,renderWaveWorld,renderHeightCaustics,causticFocus,refractHeightSlope,foamPopTime,foamBubbleRadius,foamPairForce,createFoamSimulation,renderFoamBubbles,lightingDefaults,lightingRig,studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting,cameraView,materialPreset,linearColor,ownedPost,retainedPost,clothSheet,ballBody,boxBody,groundBody,springJoint},dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await Promise.allSettled([...pending]);const results=await Promise.allSettled([sceneLibrary.dispose(),...[...instances].map(i=>i.dispose?.())]);const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Creation module cleanup failed');})();}};
}
