// Private fixture: the actual declared-input binding and unchanged public PA time reducers.
import {evaluate,keyframes} from '@frameweave/engine';
import {createNativeManagedTimeEffects} from '../../src/native-time/managed.ts';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {methods,options} from '../upstream-scene/settings.ts';
const sourceCode='fn pixel(p:vec2u)->vec4f{let hit=abs(f32(p.x)+.5-(8.+2.*paramF32(0u)))<1.75&&abs(f32(p.y)+.5-f32(outputSize().y)*.5)<10.;return select(vec4f(0.),vec4f(2.+paramF32(1u)*.03125,-.25,8.+paramF32(2u)*.25,.5),hit);}';
const gainCode='fn pixel(p:vec2u)->vec4f{return read0(vec2i(p))*paramF32(0u);}';
export async function initialize(init:any){
 if(!init.temporal?.bindSource)throw Object.assign(Error('Requires frozen Core general source seam'),{code:'E_PA_TIME_BINDING'});
 const g=init.gpu,source=await init.temporal.bindSource({version:1,profile:'declared-input-v1',input:'image',clock:'consumer-local'}),composition=await init.temporal.bindSource({version:1,profile:'declared-input-v1',input:'image',clock:'composition'}),auto=createNativeManagedTimeEffects(init,source),comp=createNativeManagedTimeEffects(init,composition),manual=createNativeTimeEffects(init),pa=createNativePaImageEffects(init),first=await g.compile({abiVersion:1,id:'test/general-time/source',version:'1.0.0',inputCount:0,parameterWords:3,code:sourceCode}),second=await g.compile({abiVersion:1,id:'test/general-time/gain',version:'1.0.0',inputCount:1,parameterWords:1,code:gainCode}),curve=keyframes([{frame:0,value:1},{frame:40,value:.5,easing:'easeIn'}]);
 let latest:any;
 async function at(sample:any,format:'rgba16float'|'rgba32float'){
  // Independent affine reference: consumer start=2 offset=4 rate=2; source start=1 offset=8 rate=.5.
  const global=2+(sample.context.time*24-4)/2,frame=8+(global-1)*.5,gainContext={...sample.context,globalFrame:global,globalTime:global/24,frame:2+1.5*(global-1),time:(2+1.5*(global-1))/24,progress:global/23},output={width:init.width,height:init.height,format,alpha:'premultiplied',color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}};
  const a=await g.run(first,[],{parameters:Float32Array.of(frame,global,(global-1)/22),output});try{return await g.run(second,[a],{parameters:Float32Array.of(evaluate(curve,gainContext)),output});}finally{await g.release(a);}
 }
 async function publish(name:string,image:any){const b=await g.imageToBuffer(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}}
 return {exports:{async renderManaged(c:any,p:{format:'rgba16float'|'rgba32float';mode:string}){
  const format=p.format;
  if(p.mode==='preview'){const image=await auto.shutterBlur({count:8,angleDegrees:720,format},c);try{return await pa.processImage(image,(i:any,fx:any)=>fx.glow(i,{radius:1.5,intensity:.25,threshold:.5,format}),{context:c});}finally{await g.release(image);}}
  let result:any;
  for(const method of methods){const o=options(method,c,format),a=await (auto[method]as Function)(o,c),b=await (method==='timeCrossfade'||method==='timeDifference'?(manual[method]as Function)((s:any)=>at(s,format),(s:any)=>at(s,format),o,c):(manual[method]as Function)((s:any)=>at(s,format),o,c));await publish('auto-'+method,a);await publish('manual-'+method,b);if(result)await g.release(result);result=a;await g.release(b);}
  const compositionBlur=await comp.shutterBlur({count:3,angleDegrees:360,format},c);await publish('composition-shutter',compositionBlur);await g.release(compositionBlur);
  const errors:any={};for(const kind of ['parameters','callback','cancel','range']){const before=g.stats();try{if(kind==='parameters')await auto.retime({},c,{parameters:[]});else if(kind==='range')await auto.retime({time:100},c);else if(kind==='callback')await source.window(c,{},async(s:any)=>{await s({index:0,time:c.time,weight:1,context:c});throw Object.assign(Error('deliberate consumer failure'),{code:'E_TEST_CONSUMER'});});else{const control=init.temporal.cancellation(),pending=auto.shutterBlur({count:3,format},c,{signal:control.signal});control.abort();await pending;}}catch(e:any){errors[kind]=e.code;}const expected=kind==='parameters'?'E_NATIVE_TEMPORAL_PARAMETERS':kind==='range'?'E_NATIVE_TEMPORAL_RANGE':kind==='callback'?'E_TEST_CONSUMER':'E_RENDER_CANCELLED';if(errors[kind]!==expected||g.stats().runs!==before.runs||g.stats().pendingPasses!==before.pendingPasses)throw Error('Rollback/diagnostic mismatch '+JSON.stringify({kind,errors,before,after:g.stats()}));}
  latest={source:source.info,composition:composition.info,errors,methods:methods.length,context:c};const text=JSON.stringify(latest),b=await g.createBuffer({type:'u32',length:text.length},Uint32Array.from(text,x=>x.charCodeAt(0)));await g.publishBuffer('trace',b,{version:1});await g.releaseBuffer(b);return result;
 }},async dispose(){await source.dispose();await composition.dispose();await pa.dispose();}};
}
