// Test-only private R1 initializer: actual sealed Core prefix versus explicit existing PA sourceAt.
import {evaluate} from '@frameweave/engine';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {createNativeManagedTimeEffects} from '../../src/native-time/managed.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {options,type Method} from './settings.ts';
export {planTrace} from './plans.ts';

export async function initialize(init:any,prefixes:Record<string,any>,ref:string){
 if(!init.temporal)throw Error('Candidate Core temporal facade was not admitted');
 const g=init.gpu,handles:any={},managed:any={},manual:any={};
 for(const [format,module]of [['rgba32float','source'],['rgba16float','source16']] as const){
  handles[format]=await init.temporal.bind({version:1,packageRef:ref,module});
  managed[format]=createNativeManagedTimeEffects(init,handles[format]);
  // Test-only explicit source uses the identical fixed prefix bytes embedded by the fixture builder.
  const prefix=prefixes[format];
  const kernels=[];for(const step of prefix.steps)kernels.push(await g.compile(step.description.kernel));
  manual[format]=async(s:any)=>{let image:any;for(let i=0;i<prefix.steps.length;i++){
   const step=prefix.steps[i],previous=image,parameters=Float32Array.from(evaluate(step.parameters,s.context));
   image=await g.run(kernels[i],previous?[previous]:[],{parameters,output:{...step.description.output,width:init.width,height:init.height}});if(previous)await g.release(previous);
  }return image;};
 }
 const explicit=createNativeTimeEffects(init),pa=createNativePaImageEffects(init);
 return {exports:{
  renderManaged(c:any,method:Method,format:'rgba16float'|'rgba32float'){return managed[format][method](options(method,c,format),c);},
  renderExplicit(c:any,method:Method,format:'rgba16float'|'rgba32float'){const at=manual[format],o=options(method,c,format);return method==='timeCrossfade'||method==='timeDifference'?(explicit[method] as any)(at,at,o,c):(explicit[method] as any)(at,o,c);},
  async renderPreview(c:any,format:'rgba16float'|'rgba32float'){
   const image=await managed[format].shutterBlur({count:8,angleDegrees:720,format},c);
   try{return await pa.processImage(image,(i:any,fx:any)=>fx.glow(i,{radius:1.5,intensity:.25,threshold:.5,format}),{context:c});}finally{await g.release(image);}
  },
  async renderProbe(c:any,kind:'cancel'|'parameters'|'callback',format:'rgba16float'|'rgba32float'){
   const base=await manual[format]({index:0,time:c.time,weight:1,context:c}),before=g.stats(),control=init.temporal.cancellation();let observed='';
   try{
    if(kind==='parameters')await managed[format].retime({},c,{parameters:[]});
    else if(kind==='callback')await handles[format].window(c,{},async(at:any)=>{await at({index:0,time:c.time,weight:1,context:c});throw Object.assign(Error('deliberate source consumer failure'),{code:'E_PA5_CALLBACK'});});
    else{const pending=managed[format].shutterBlur({count:3,format},c,{signal:control.signal});control.abort();control.abort();await pending;}
   }catch(error:any){observed=error.code;}
   const expected=kind==='cancel'?'E_RENDER_CANCELLED':kind==='parameters'?'E_NATIVE_TEMPORAL_PARAMETERS':'E_PA5_CALLBACK';
   if(observed!==expected)throw Error('Wrong probe diagnostic '+observed+' expected '+expected);
   if(g.stats().runs!==before.runs||g.stats().pendingPasses!==before.pendingPasses)throw Error('Failed window retained GPU commands');
   // Failure is caught only by this deliberate test probe. Real adapter propagates it.
   return base;
  },
 },async dispose(){await handles.rgba32float.dispose();await handles.rgba16float.dispose();await pa.dispose();}};
}
