import {Composition,Stage,Layer,ref,keyframes,evaluate} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {linear709,surfaceFromPixels} from '../../../../src/media/surface.ts';
import {createCreationFinish,type CreationFinish} from '../../finish.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createProfessionalFilters} from '../../../gpu-image-effects/resident/filters.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';

// Independent authored expected recipes; deliberately do NOT read finishDefaults.
const recipes=[{},
 {exposure:.1,contrast:1.1,contrastPivot:.08,saturation:-.12,glow:{radius:3,intensity:.15,threshold:1},vignette:.18,grain:.0015},
 {contrast:.94,saturation:-.1,glow:{radius:8,intensity:.55,threshold:.6},vignette:.1},
 {contrast:1.12,saturation:.25,glow:{radius:4,intensity:.6,threshold:1.2}},
 {blackAndWhite:1,contrast:1.3,vignette:.4,grain:.012},
 {exposure:.08,tint:{white:[1.1,.95,.8],amount:.15}},
 {exposure:.04,tint:{white:[.8,.95,1.1],amount:.15}},
 {contrast:.85,saturation:-.22,brightness:.04},
 {contrast:1.1,saturation:.25,posterize:{levels:5,amount:1}},
 {tritone:{shadows:[.025,.015,.008],midtones:[.55,.32,.15],highlights:[1,.92,.72],amount:.7},contrast:1.05},
];
const names=['clean','cinema','dream','neon','noir','warm','cool','pastel','poster','sepia'] as const;
const pairs=[{glow:{radius:0,intensity:.2,threshold:.8}},{glow:{radius:.5,intensity:.1,threshold:2}}];
const signal=keyframes([{frame:0,value:0},{frame:100,value:1}]);
const toggle={enabled:keyframes([{frame:0,value:0},{frame:50,value:1,easing:'step'}]),exposure:signal};
const actualPlans:CreationFinish[]=[...names,pairs,{preset:'cinema',exposure:signal,glow:false,grain:0},[{glow:{intensity:0}}],toggle];
const expectedPlans:any[]=[...recipes,pairs,{...recipes[1],exposure:signal,glow:false,grain:0},[{glow:{intensity:0}}],toggle];
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,finish=actualPlans.map(p=>createCreationFinish(init,p)),manual=createNativePaImageEffects(init),width=16,height=12;
 const pixels=Array.from({length:width*height},(_,i)=>{const alpha=[1,.5,1e-7,0][i%4];return alpha===0?[2,-1,.5,0]:[(i%7-1)*.7*alpha,(i%5)*.6*alpha,(i%3)*.4*alpha,alpha];}).flat(),surface=surfaceFromPixels(width,height,pixels,{format:'rgba32float',alpha:'premultiplied',color:linear709});
 return {async renderAt(c){return withGpuResources(g,async a=>{
  const source=a.image(await g.upload(surface)),index=c.frame%actualPlans.length,format=c.frame%2?'rgba16float':'rgba32float';
  const input=format==='rgba32float'?source:a.image(await g.run(await g.compile({abiVersion:1,id:'finish-test/half',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'}),[source],{output:{format}}));
  const actual=await finish[index].apply(input,c);if(actual!==input)a.image(actual);
  let expected=input;const fx=createProfessionalFilters(g,c,i=>a.image(i)),plans=Array.isArray(expectedPlans[index])?expectedPlans[index]:[expectedPlans[index]];
  for(const o of plans){
   if(o.enabled!==undefined&&(evaluate(o.enabled,c) as number)<.5)continue;
   if(o.exposure!==undefined)expected=await fx.exposure(expected,{stops:o.exposure,format});
   if(o.brightness!==undefined||o.contrast!==undefined)expected=await fx.brightnessContrast(expected,{brightness:o.brightness,contrast:o.contrast,pivot:o.contrastPivot,format});
   if(o.saturation!==undefined)expected=await fx.hueSaturation(expected,{saturation:o.saturation,format});
   if(o.blackAndWhite!==undefined)expected=await fx.blackAndWhite(expected,{amount:o.blackAndWhite,format});
   if(o.tint)expected=await fx.tint(expected,{...o.tint,format});
   if(o.tritone)expected=await fx.tritone(expected,{...o.tritone,format});
   if(o.posterize)expected=await fx.posterize(expected,{...o.posterize,format});
   if(o.glow&&o.glow.intensity>0)expected=await manual.processImage(expected,(i,f)=>f.glow(i,{...o.glow,format,alpha:'premultiplied'}),{context:c});
   if(o.vignette!==undefined)expected=await fx.vignette(expected,{amount:o.vignette,format});
   if(o.grain!==undefined)expected=await fx.filmGrain(expected,{amount:o.grain,format});
  }
  for(const [id,image]of [['actual',actual],['expected',expected]] as const){const view=a.buffer(await g.imageToBuffer!(image,{version:1}));await g.publishBuffer(id,view,{version:1});}
  const stats=finish[index].stats(),state=a.buffer(await g.createBuffer({type:'f32',length:5},Float32Array.of(index,actual===input?1:0,stats.retainedCopies,format==='rgba16float'?16:32,g.stats().activeImages)));await g.publishBuffer('state',state,{version:1});
  return actual===input?a.keep(input):a.keep(actual);
 });},async dispose(){for(const f of finish)await f.dispose();await manual.dispose();}};
});
export default Composition({id:'finish-compare',width:16,height:12,fps:24,durationInFrames:101,children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
