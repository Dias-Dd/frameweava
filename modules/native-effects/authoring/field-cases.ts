import * as api from './index.ts';
import {closureEffects} from './closure-asset.ts';
import {createNativeClosureImageEffects} from '../closure-images/index.ts';
import {createNativeProKeyEffects} from '../keying-pro/index.ts';
import {createNativeEstimationEffects} from '../image-estimation/index.ts';
import {createNativePaintEffects} from '../roto-authoring/index.ts';
import {fixtureStroke,fixtureBrush} from '../roto-authoring/cases.ts';
import type {ImageAsset,ImageEffect,ImageFrame} from './types.ts';
export const width=17,height=13;
export const vectorValues=Float32Array.from({length:width*height*2},(_,i)=>i%2?-.25:.5);
export const motionValues=Float32Array.from({length:width*height*3},(_,i)=>i%3===2?(Math.floor(i/3)%11===0?0:.9):i%3===1?-.25:.5);
export const labelValues=Uint32Array.from({length:width*height},(_,i)=>i%3===0?0xf1234567:i%3);
export const spectrumValues=Float32Array.of(.2,.7,.4,1.1);
export const sampleValues=Float32Array.of(-1.5,.3,2.2,-.2,.1);
export const vectors=api.vectorField(vectorValues),motion=api.motionField(motionValues),labels=api.labelMap(labelValues),spectrum=api.spectrumData(spectrumValues),samples=api.waveformData(sampleValues);
export const other=api.floatImageResource('auxiliary',{width,height});
const field=<T extends object>(declaration:ImageAsset<T>,effect:ImageEffect)=>api.withImageAssets(effect,declaration);
const stroke=fixtureStroke(width,height),brush={...fixtureBrush(6),radius:1.3};
const flow={levels:2,iterations:2,radius:2},fit={fitIterations:2,sampleStep:2};
export const cases:{name:string;effect:ImageEffect;direct:ImageEffect}[]=[
{name:'vectorBlur',effect:api.vectorBlur(vectors,{samples:5}),direct:field(vectors,api.withPreparedEffects(closureEffects,async(i,f,frame)=>f.vectorBlur(i,await frame.asset(vectors),{samples:5})))},
{name:'objectMatte',effect:api.objectMatte(labels,{ids:[0xf1234567,2]}),direct:field(labels,api.withEffects(createNativeClosureImageEffects,async(i,f,frame)=>f.objectMatte(i,await frame.asset(labels),{ids:[0xf1234567,2]})))},
{name:'spectrumBars',effect:api.spectrumBars(spectrum),direct:field(spectrum,api.withEffects(createNativeClosureImageEffects,async(i,f,frame)=>f.spectrumBars(i,await frame.asset(spectrum))))},
{name:'waveformTrace',effect:api.waveformTrace(samples),direct:field(samples,api.withEffects(createNativeClosureImageEffects,async(i,f,frame)=>f.waveformTrace(i,await frame.asset(samples))))},
{name:'warpByFlow',effect:api.warpByFlow(motion),direct:field(motion,api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.warpByFlow(i,await frame.asset(motion))))},
{name:'motionVisualize',effect:api.motionVisualize(motion),direct:field(motion,api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.motionVisualize(i,await frame.asset(motion))))},
{name:'matteVectorBlur',effect:api.matteVectorBlur(motion,{samples:5}),direct:field(motion,api.withEffects(createNativeProKeyEffects,async(i,f,frame)=>f.matteVectorBlur(i,(await frame.asset(motion)).buffer,{samples:5})))},
{name:'temporalMatte',effect:api.temporalMatte(other,other,other,motion),direct:api.withImageSources(field(motion,api.withEffects(createNativeProKeyEffects,async(i,f,frame)=>{const image=await frame.input(other);return f.temporalMatte(i,image,image,image,(await frame.asset(motion)).buffer);})),other)},
{name:'stabilize',effect:api.stabilize(other,{...flow,...fit,model:'translation'}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.stabilize(i,await frame.input(other),{...flow,...fit,model:'translation'})),other)},
{name:'repairRollingShutter',effect:api.repairRollingShutter(other,{...flow,...fit}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.repairRollingShutter(i,await frame.input(other),{...flow,...fit})),other)},
{name:'spectralMatchGrain',effect:api.spectralMatchGrain(other,{radius:1,lumaBins:3}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.spectralMatchGrain(i,await frame.input(other),{radius:1,lumaBins:3})),other)},
{name:'autoColorStabilize',effect:api.autoColorStabilize(other,{...flow}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.autoColorStabilize(i,await frame.input(other),{...flow})),other)},
{name:'blindDeblur',effect:api.blindDeblur({radius:1,iterations:2,imageIterations:2}),direct:api.withEffects(createNativeEstimationEffects,async(i,f)=>(await f.blindDeblur(i,{radius:1,iterations:2,imageIterations:2})).image)},
{name:'cameraShakeDeblur',effect:api.cameraShakeDeblur([other],{patchSize:3,searchRadius:1}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.cameraShakeDeblur(i,[await frame.input(other)],{patchSize:3,searchRadius:1})),other)},
{name:'synthesizeGrain',effect:api.synthesizeGrain(other,{radius:1,lumaBins:3},{seed:37,strength:.1}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.synthesizeGrain(i,await f.grainProfile(await frame.input(other),{radius:1,lumaBins:3}),{seed:37,strength:.1})),other)},
{name:'grainSpectrumView',effect:api.grainSpectrumView(other,{radius:1,lumaBins:3}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>f.grainSpectrumView(i,await f.grainProfile(await frame.input(other),{radius:1,lumaBins:3}))),other)},
{name:'adaptiveDetailUpscale',effect:api.adaptiveDetailUpscale(),direct:api.withEffects(createNativeEstimationEffects,(i,f)=>f.adaptiveDetailUpscale(i,{width,height}))},
{name:'flowWarp',effect:api.flowWarp(other,{flow,warp:{boundary:'clamp'}}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>{const ref=await frame.input(other);return f.warpByFlow(ref,await f.opticalFlow(i,ref,flow),{boundary:'clamp',format:i.info.format,workingColor:i.info.color});}),other)},
{name:'opticalFlowView',effect:api.opticalFlowView(other,{flow}),direct:api.withImageSources(api.withEffects(createNativeEstimationEffects,async(i,f,frame)=>{const ref=await frame.input(other);return f.motionVisualize(i,await f.opticalFlow(i,ref,flow));}),other)},
{name:'paintStroke',effect:api.paintStroke(stroke,{...brush,stencil:other}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.paintStroke(i,stroke,{...brush,stencil:await frame.input(other)})),other)},
{name:'airbrushStroke',effect:api.airbrushStroke(stroke,{...brush,stencil:other,exposure:1.1}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.airbrushStroke(i,stroke,{...brush,stencil:await frame.input(other),exposure:1.1})),other)},
{name:'bristleStroke',effect:api.bristleStroke(stroke,{...brush,stencil:other,fibres:3}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.bristleStroke(i,stroke,{...brush,stencil:await frame.input(other),fibres:3})),other)},
{name:'dryBrushStroke',effect:api.dryBrushStroke(stroke,{...brush,stencil:other,seed:37}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.dryBrushStroke(i,stroke,{...brush,stencil:await frame.input(other),seed:37})),other)},
{name:'scatterStroke',effect:api.scatterStroke(stroke,{...brush,stencil:other,seed:37}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.scatterStroke(i,stroke,{...brush,stencil:await frame.input(other),seed:37})),other)},
{name:'smudgeStroke',effect:api.smudgeStroke(stroke,{...brush,strength:.3}),direct:api.withEffects(createNativePaintEffects,(i,f)=>f.smudgeStroke(i,stroke,{...brush,strength:.3}))},
{name:'wetMixStroke',effect:api.wetMixStroke(stroke,{...brush,strength:.3}),direct:api.withEffects(createNativePaintEffects,(i,f)=>f.wetMixStroke(i,stroke,{...brush,strength:.3}))},
{name:'eraseStroke',effect:api.eraseStroke(stroke,{...brush,stencil:other}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.eraseStroke(i,stroke,{...brush,stencil:await frame.input(other)})),other)},
{name:'dodgeBurnStroke',effect:api.dodgeBurnStroke(stroke,{...brush,stencil:other,exposure:.1}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.dodgeBurnStroke(i,stroke,{...brush,stencil:await frame.input(other),exposure:.1})),other)},
{name:'cloneStroke',effect:api.cloneStroke(other,stroke,brush),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.cloneStroke(i,await frame.input(other),stroke,brush)),other)},
{name:'healStroke',effect:api.healStroke(other,stroke,brush),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.healStroke(i,await frame.input(other),stroke,brush)),other)},
{name:'paintRelief',effect:api.paintRelief(stroke,{height:{radius:1.3},relief:{depth:.2}}),direct:api.withEffects(createNativePaintEffects,async(i,f)=>f.paintRelief(i,await f.brushHeight(i,stroke,{radius:1.3}),{depth:.2}))},
{name:'contourStroke',effect:api.contourStroke({trace:{channel:'alpha'},stroke:{width:.7,color:[1.5,-.1,.3]}}),direct:api.withEffects(createNativePaintEffects,async(i,f)=>f.contourStroke(i,await f.traceContours(i,{channel:'alpha'}),{width:.7,color:[1.5,-.1,.3]}))},
{name:'autoScribble',effect:api.autoScribble(other,{spacing:3,width:.5}),direct:api.withImageSources(api.withEffects(createNativePaintEffects,async(i,f,frame)=>f.autoScribble(i,await frame.input(other),{spacing:3,width:.5})),other)},
{name:'spectrumOverlay',effect:api.spectrumOverlay(spectrum),direct:field(spectrum,api.withEffects(createNativeClosureImageEffects,async(i,f,frame)=>f.over(await f.spectrumBars(i,await frame.asset(spectrum)),i,{format:i.info.format})))},
{name:'waveformOverlay',effect:api.waveformOverlay(samples),direct:field(samples,api.withEffects(createNativeClosureImageEffects,async(i,f,frame)=>f.over(await f.waveformTrace(i,await frame.asset(samples)),i,{format:i.info.format})))},
];
