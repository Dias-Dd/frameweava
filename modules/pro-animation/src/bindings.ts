import * as advanced from './advanced.ts';
import {EngineError} from '../../../src/core/errors.ts';
import {revealText,wiggle,createImageEffects,createVectorTools,createCoverageRasterizer,glow,blur,displacement,surfaceFromCoverage,applyFloatKernel,createShapeModifiers,createPathTools,createAnimatedTextTools,rangeSelector,combineSelectors,selectorOrder,randomSelector,stagger,segmentText,noiseField,createDeformationTools,createDisplacementMap,displaceWithMap,emitParticles,rasterizeParticles} from './index.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {PluginInit} from '../../../src/plugins/sdk.ts';
/** R1 Stage initializer; direct imports use this declared lifecycle, never an ambient singleton. */
export async function initialize(init:PluginInit){
 const graphics=await init.loadModule({module:'main',format:'javascript',dependency:'frameweave.graphics-contracts'});
 const shapes=createShapeModifiers(graphics as unknown as typeof Graphics);
 const vector=createVectorTools(graphics as unknown as typeof Graphics),coverage=createCoverageRasterizer(graphics as unknown as typeof Graphics),paths=createPathTools(graphics as unknown as typeof Graphics),text=createAnimatedTextTools(graphics as unknown as typeof Graphics),deform=createDeformationTools(graphics as unknown as typeof Graphics);
 let image:ReturnType<typeof createImageEffects>|undefined,disposed=false;
 const legacy=async()=>{if(disposed)throw new EngineError('E_PA_DISPOSED','PA binding disposed');return image??=createImageEffects(init);};
 const professional=(v:unknown):boolean=>!!v&&typeof v==='object'&&'schemaVersion' in v;
 return {exports:{...advanced,...shapes,revealText,wiggle,rangeSelector,combineSelectors,selectorOrder,randomSelector,stagger,segmentText,...text,noiseField,...deform,createDisplacementMap,displaceWithMap,emitParticles,rasterizeParticles,trimPaths:(p:any,options:any,ctx:any)=>options.mode==='curves'?paths.trimCurves(p,options,ctx):vector.trimPaths(p,options,ctx),measurePath:paths.measurePath,createPathSampler:paths.createPathSampler,matchPaths:paths.matchPaths,morphPath:vector.morphPath,blur,surfaceFromCoverage,applyFloatKernel,...coverage,
  glow:(input:any,options:any,context:any)=>professional(input)?glow(input,options,context):legacy().then(fx=>fx.glow(input,options,context)),
  displacement:(input:any,options:any,context:any)=>professional(input)?displacement(input,options,context):legacy().then(fx=>fx.displacement(input,options,context))},
  async dispose(){if(disposed)return;disposed=true;if(image)await (await image).dispose();}};
}
