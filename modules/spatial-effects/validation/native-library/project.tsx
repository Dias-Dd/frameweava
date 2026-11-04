import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {linear709} from '../../../../src/media/surface.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {uploadSpatialField,releaseSpatialField} from '../../../spatial-fields/index.ts';
import * as library from '../../native-library.ts';
import {fieldCases,meshCases,computeCases,fieldEnd,meshEnd,computeEnd,caseCount,vfxNames} from './fixtures.ts';
// Validation-only clear/visualization. Numerical results travel through the
// public host buffer exporter; they are never encoded into RGBA for transport.
export const verification=defineNativeStage(async init=>{
 const g=init.gpu,imageToBuffer=g.imageToBuffer?.bind(g);if(!imageToBuffer)throw Object.assign(new Error('Native image-to-buffer capability required for explicit validation exports'),{code:'E_NATIVE_CAPABILITY'});
 const clear=await g.compile({abiVersion:1,id:'frameweave/validation/native-library-clear',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(.01,.02,.04,1.);}'});
 return {async renderAt(c){return withGpuResources(g,async a=>{
  if(c.frame<fieldEnd){const f=fieldCases[c.frame],inputs=[];for(const input of f.inputs)inputs.push(a.adopt(await uploadSpatialField(g,input.kind,Float32Array.from(input.data),f.width,f.height,c,{camera:input.camera}),v=>releaseSpatialField(g,v)));
   const options=structuredClone(f.options);if(options.reference)options.reference.context.fps=c.fps;
   const result=await (library[f.name as keyof typeof library] as Function)(g,...inputs,c,options),outputs=f.name==='surfaceTangentFrame'?[result.tangent,result.bitangent]:[result];
   for(let i=0;i<outputs.length;i++){a.adopt(outputs[i],v=>releaseSpatialField(g,v));await g.publishBuffer('value-'+i,outputs[i].data,{version:1});await g.publishBuffer('validity-'+i,outputs[i].validity,{version:1});}
  }else if(c.frame<meshEnd){const f=meshCases[c.frame-fieldEnd],inputs=[];for(let i=0;i<f.inputs.length;i++){const normal=f.name==='noiseDisplacePositions'&&i===1;inputs.push(a.buffer(await g.createField({type:'f32',dimensions:[f.inputs[i].length/3,1,1],components:3,semantic:normal?'normal':'position',space:'world-rh-y-up',units:normal?'dimensionless':'meter'},Float32Array.from(f.inputs[i]))));}
   // The last fixture's expected phase is authored at frame zero. Other
   // fixtures are constant; make that explicit through the existing Signal.
   const options=structuredClone(f.options);if(f.name==='wavePositions'&&options.phase&&typeof options.phase==='object')options.phase=0;
   const result=a.buffer(await (library[f.name as keyof typeof library] as Function)(g,...inputs,c,options));await g.publishBuffer('value-0',result,{version:1});
  }else if(c.frame<computeEnd){const f=computeCases[c.frame-meshEnd];let input;
   if(f.name==='splatParticles')input=a.buffer(await g.createField({type:'f32',dimensions:[2,1,1],components:3,semantic:'position',space:'world-rh-y-up',units:'meter',metadata:{grid:{origin:[0,0,0],spacing:[1,1,1]}}},Float32Array.from([-.5,0,.5,.25,.5,-.25])));
   if(f.name==='renderVolume')input=a.buffer(await g.createField({type:'f32',dimensions:[4,4,4],components:1,semantic:'density',space:'world-rh-y-up',units:'1/meter',metadata:{grid:{origin:[-1.5,-1.5,-1.5],spacing:[1,1,1]}}},new Float32Array(64).fill(.25)));
   const result=await (library[f.name as keyof typeof library] as Function)(g,...input?[input]:[],c,f.options);
   if(f.name==='renderVolume'){const image=a.image(result),view=a.buffer(await imageToBuffer(image,{version:1}));await g.publishBuffer('value-0',view,{version:1});return a.keep(image);}
   const buffer=a.buffer(result);await g.publishBuffer('value-0',buffer,{version:1});
  }else{const i=c.frame-computeEnd,name=vfxNames[i%15],o={width:init.width,height:init.height,format:i<15?'rgba32float' as const:'rgba16float' as const,time:.5,rotation:0,seed:17,steps:name==='terrainRaymarch'?512:48,exposure:name==='flameVolume'?.25:1};let image;
   if(name==='heightFog'||name==='gravitationalLensing'){const source=a.image(await library.starfield(g,c,{...o,starRadius:.09})),sourceView=a.buffer(await imageToBuffer(source,{version:1}));await g.publishBuffer('input-0',sourceView,{version:1});image=a.image(await library[name](g,source,c,o));}
   else image=a.image(await (library[name] as Function)(g,c,o));
   const view=a.buffer(await imageToBuffer(image,{version:1}));await g.publishBuffer('value-0',view,{version:1});return a.keep(image);
  }
  return a.keep(a.image(await g.run(clear,[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}})));
 });}};
});
export default Composition({id:'native-library-50-verification',width:128,height:72,fps:60,durationInFrames:caseCount,background:'transparent',children:[Stage({id:'verification',factory:verification,outputs:{surface:'surface'}}),Layer({source:ref('verification')})]});
