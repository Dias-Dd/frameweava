import {renderTimeDifference,timeDifferenceAlphaModes,renderTimewarp,managedTemporalSource,resolveWarpTime} from '../../src/temporal-controls/index.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {warpOptions,temporalCases} from '../temporal-fixture.ts';
export async function initialize(init:any,ref:string){
 const g=init.gpu,bindings:any={};for(const role of ['source','target','warp','matte','straight','zero'])bindings[role]=await init.temporal.bind({version:1,packageRef:ref,module:role});
 const fx=createGpuPixelEffects(g);
 const exports:any={async renderCase(c:any,p:any){
  if(p.mode==='sweep')p={...p,mode:temporalCases[c.globalFrame],sweep:true};
  const samples:any[]=[],source=(role:string,options:any={})=>{const at=managedTemporalSource(init,bindings[role],c,options);return async(s:any)=>{samples.push({role,time:s.time,context:s.context});const value=await at(s);if(role!=='straight')return value;try{return await g.run(await g.compile({abiVersion:1,id:'test/straight-copy',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'}),[value],{output:{...value.info,alpha:'straight'}});}finally{await g.release(value);}};};
  const from=source('source'),target=source('target');let result:any,observed='',cleanup:any;
  if(p.mode==='cancel'||p.mode==='callback-error'){
   const before=g.stats();let held:any,released='';if(p.mode==='cancel'){const control=init.temporal.cancellation();control.abort();try{await renderTimeDifference(init,source('source',{signal:control.signal}),target,{},c);}catch(e:any){observed=e.code;}if(observed!=='E_RENDER_CANCELLED')throw Error('Missing cancellation '+observed);}
   else{try{await renderTimeDifference(init,async(s:any)=>held=await from(s),async()=>{throw Object.assign(Error('deliberate target failure'),{code:'E_TEST_SOURCE'});},{},c);}catch(e:any){observed=e.code;}if(observed!=='E_TEST_SOURCE')throw Error('Missing source error '+observed);try{const unexpected=await g.imageToBuffer(held,{version:1});await g.releaseBuffer(unexpected);}catch(e:any){released=e.code;}if(released!=='E_NATIVE_SCOPE')throw Error('Failed task left a usable image capability');}
   const after=g.stats();cleanup={logicalBefore:{images:before.activeImages,buffers:before.activeDataBuffers},logicalAfter:{images:after.activeImages,buffers:after.activeDataBuffers},releasedCapability:released,note:'Core stats count recorded logical allocations, not live tokens. Failed task image is explicitly unusable; commands retire with the existing frame.'};if(p.mode==='cancel'&&(before.activeImages!==after.activeImages||before.activeDataBuffers!==after.activeDataBuffers))throw Error('Pre-cancelled window retained allocations');
   // Reenter both distinct authenticated windows after the failure.
   result=await renderTimeDifference(init,from,target,{alpha:'full-on',format:p.format},c);
  }else if(p.mode.startsWith('diff:')){
   const kind=p.mode.slice(5),opts:any={alpha:timeDifferenceAlphaModes.includes(kind)?kind:'original',format:p.format};if(kind==='signed')opts.absolute=false;if(kind==='raw-pm'||kind==='zero-alpha')opts.comparison='premultiplied';if(kind==='opacity')opts.opacity=.25;
   result=await renderTimeDifference(init,source(kind==='straight'?'straight':kind==='zero-alpha'?'zero':'source'),target,opts,c);
  }else{
   const o:any={...warpOptions(p.mode),format:p.format},useMatte=['foreground','background','matte','flow','confidence'].includes(p.mode);
   if(p.sweep&&!['key-speed','expression-speed','shutter','combined'].includes(p.mode)){o.speed=undefined;o.adjustBy='source-frame';o.sourceFrame=2.25;}
   result=await renderTimewarp(init,{image:from,warp:p.mode==='warp-layer'?source('warp'):undefined,matte:useMatte?source('matte'):undefined},o as any,c);
   if(p.mode==='combined'){const original=result;try{result=await fx.glow(original,{radius:1.5,threshold:1,intensity:p.gain??.2,format:p.format});}finally{await g.release(original);}}
  }
  const pixels=await g.imageToBuffer(result,{version:1});try{await g.publishBuffer((p.prefix??'')+'pixels',pixels,{version:1});}finally{await g.releaseBuffer(pixels);}
  const timing:any=warpOptions(p.mode);if(p.sweep&&!p.mode.startsWith('diff:')&&!['key-speed','expression-speed','shutter','combined'].includes(p.mode)){timing.speed=undefined;timing.adjustBy='source-frame';timing.sourceFrame=2.25;}
  const trace={context:c,samples,observed,cleanup,timing,warpTime:resolveWarpTime(timing,c)},text=JSON.stringify(trace),data=await g.createBuffer({type:'u32',length:text.length},Uint32Array.from(text.split('').map(x=>x.charCodeAt(0))));try{await g.publishBuffer('trace',data,{version:1});}finally{await g.releaseBuffer(data);}return result;
 }};
 return {exports,async dispose(){for(const binding of Object.values(bindings)as any[])await binding.dispose();}};
}
