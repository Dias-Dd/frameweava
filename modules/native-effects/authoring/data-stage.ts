import {defineNativeStage} from '../../native-gpu/authoring.ts';import {linear709} from '../../../src/media/surface.ts';
import {EngineError} from '../../../src/core/errors.ts';import {publish} from '../composite/stage.ts';
import {fixtureSource} from '../temporal-restoration/stage.ts';
import {depthField,createNativeRestorationEffects} from '../restoration/index.ts';
import {createNativeTemporalEffects} from '../temporal-restoration/filters.ts';
import {createNativeStabilizationEffects} from '../stabilization/index.ts';
import {createImageTools,depthMap,depthOfField,depthBilateral,splitDiopter,temporalDenoise,synthesizeTemporalGrain,temporalSpectrumView,matchTemporalGrain,stabilizeSequencePath,withEffects,type ImageAsset,type ImageEffect} from './index.ts';
const period={num:1001,den:30000},profile={samplePeriod:period,radius:1,temporalRadius:1,oversampling:1,preblurSigma:.7,analysisStride:5,batchPatches:3};
const lens={focalLengthMm:35,fStop:8,focusDistanceM:3,sensorWidthMm:4};
const denoise={windowSeconds:.1,maximumGapSeconds:.06,timeSigmaSeconds:.08,rangeSigma:.4,noiseSigma:.1,motionSensitivity:.5,minimumConfidence:.2,strength:.8,flowOptions:{levels:2,iterations:2,radius:2}};
const stabilization={model:'translation' as const,maximumGapSeconds:.06,meshColumns:1,meshRows:1,meshRadius:3,meshSampleStep:1,meshIterations:2,fit:{fitIterations:2,sampleStep:1,robustRadius:2,minimumConfidence:.05},flow:{levels:2,iterations:2,radius:2},velocity:0,acceleration:.0003,jerk:.000001,crop:'none' as const};
export const dataNumeric=defineNativeStage(async init=>{
 const g=init.gpu,tools=createImageTools(init),values=Float32Array.from({length:init.width*init.height},(_,i)=>i%11===0?0:1.5+6.5*(i%init.width)/init.width),declaration=depthMap(values,{rangeM:[1.5,8]});let prepares=0,releases=0;
 const depth:ImageAsset<Awaited<ReturnType<typeof declaration.prepare>>['value']>={async prepare(init,options){prepares++;const result=await declaration.prepare(init,options);return {value:result.value,async dispose(){releases++;await result.dispose?.();}};}};
 await tools.prepareAssets([depth,depth]);const rawBuffer=await g.createField({type:'f32',dimensions:[init.width,init.height,1],components:1,semantic:'depth',space:'camera',units:'metres',channels:['z'],metadata:{rangeM:[1.5,8]}},values),rawDepth=depthField(rawBuffer);
 return {async renderAt(context){const format=context.frame>=100?'rgba16float':'rgba32float',when=(d:number)=>({num:(context.frame+d)*period.num,den:period.den}),time=when(0),images=[];
  for(const [role,offset]of [[0,0],[0,-1],[0,1],[1,-1],[1,0],[1,1]])images.push(await g.run(await g.compile(fixtureSource),[],{output:{width:init.width,height:init.height,format,color:linear709,alpha:role===1?'opaque':'premultiplied'},parameters:Uint32Array.of(role,0,context.globalFrame,offset+2)}));
  const [source,previous,next,a,b,c]=images,sequence=[{time:when(-1),image:previous},{time,image:source},{time:when(1),image:next}],neighbours=[sequence[0],sequence[2]],plates=[{time:when(-1),image:a},{time,image:b},{time:when(1),image:c}],gap=[{time:{num:(context.frame*2-1)*period.num,den:period.den*2},observed:false as const},...neighbours,{time:{num:(context.frame*2+1)*period.num,den:period.den*2},observed:false as const}];
  const cases:{name:string;effect:ImageEffect;direct:ImageEffect}[]=[
   {name:'depthOfField',effect:depthOfField(depth,lens),direct:withEffects(createNativeRestorationEffects,(i,f)=>f.depthOfField(i,rawDepth,lens))},
   {name:'splitDiopter',effect:splitDiopter(depth,{...lens,secondFocusDistanceM:6}),direct:withEffects(createNativeRestorationEffects,(i,f)=>f.splitDiopter(i,rawDepth,{...lens,secondFocusDistanceM:6}))},
   {name:'depthBilateral',effect:depthBilateral(depth,{radius:1}),direct:withEffects(createNativeRestorationEffects,(i,f)=>f.depthBilateral(i,rawDepth,{radius:1}))},
   {name:'temporalDenoise',effect:temporalDenoise(sequence,denoise),direct:withEffects(createNativeTemporalEffects,(i,f)=>f.temporalDenoise(i,neighbours,{...denoise,time}))},
   {name:'missingObservation',effect:temporalDenoise(gap,denoise),direct:withEffects(createNativeTemporalEffects,(i,f)=>f.temporalDenoise(i,gap,{...denoise,time}))},
   {name:'synthesizeTemporalGrain',effect:synthesizeTemporalGrain(plates,profile,{seed:37,strength:.7}),direct:withEffects(createNativeTemporalEffects,async(i,f)=>f.synthesizeTemporalGrain(i,await f.temporalGrainProfile(plates,profile),{time,seed:37,strength:.7}))},
   {name:'temporalSpectrumView',effect:temporalSpectrumView(plates,profile,{row:'green',column:'blue',component:'real'}),direct:withEffects(createNativeTemporalEffects,async(i,f)=>f.temporalSpectrumView(i,await f.temporalGrainProfile(plates,profile),{row:'green',column:'blue',component:'real'}))},
   {name:'matchTemporalGrain',effect:matchTemporalGrain(sequence,plates,{...denoise,profile,synthesis:{seed:37,strength:.7}}),direct:withEffects(createNativeTemporalEffects,(i,f)=>f.matchTemporalGrain(i,neighbours,plates,{...denoise,profile,time,synthesis:{seed:37,strength:.7}}))},
   {name:'stabilizeSequencePath',effect:stabilizeSequencePath(sequence,stabilization),direct:withEffects(createNativeStabilizationEffects,(i,f)=>f.stabilizeSequencePath(i,sequence,{...stabilization,time}))},
  ];
  for(const row of cases){const actual=await tools.apply(source,row.effect,{context});await publish(g,row.name+'-actual',actual);const direct=await tools.apply(source,row.direct,{context});await publish(g,row.name+'-direct',direct);}
  let missing=false;try{await tools.apply(source,temporalDenoise([{time,observed:false}]),{context});}catch(error){if(error instanceof EngineError&&error.code==='E_IMAGE_OBSERVATION_MISSING')missing=true;else throw error;}if(!missing)throw Error('Missing current observation was silently discarded');
  if(prepares!==1||releases!==0||tools.stats().preparedAssets!==1)throw Error('Depth initialized more than once');
  const result=await tools.apply(source,async(i,f)=>{const value=await f.asset(depth);await g.publishBuffer('depth',value.buffer,{version:1});return i;},{context});return result;
 },async dispose(){await tools.dispose();await tools.dispose();await g.releaseBuffer(rawBuffer);if(prepares!==1||releases!==1)throw Error('Depth release count changed');}};
});
