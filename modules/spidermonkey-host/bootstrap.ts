import {CompositeController} from '../stage-orchestration/composite-controller.ts';
import {TemporalExchange} from '../native-gpu/temporal-exchange.ts';
import {NativeTemporalController} from '../native-gpu/temporal.ts';
import {NativeRecordingScope} from '../native-gpu/scope.ts';
import {NativeGraphEncoder} from '../native-gpu/graph-template.ts';
import type {NativeStageFactory,NativeStageInstance} from '../native-gpu/authoring.ts';
import type {FrameContext} from '../../src/core/types.ts';
import {decodeHostValue,encodeHostValue} from './codec.ts';
import {moduleResourceReader} from './module-resources.ts';

/** Same recorder and capabilities as Chromium. This only replaces its RPC shell. */
export function nativeDispatcher(factory:NativeStageFactory<any,any,any>,setFrame:(ctx:FrameContext)=>void,stopFrame:()=>void=()=>{}){
 let instance:NativeStageInstance<any,any,any>|undefined,scope:NativeRecordingScope|undefined,temporal:NativeTemporalController|undefined,busy=false,closed=false;const exchange=new TemporalExchange();
 let children:CompositeController|undefined;
 let graphEncoder:NativeGraphEncoder|undefined;
 let modules:Awaited<ReturnType<typeof moduleResourceReader>>|undefined;
 return async(method:string,payload:any)=>{
  if(method==='native.temporal.cancel'){try{await exchange.cancel(payload?.continuation,Object.assign(new Error('Temporal frame cancelled'),{code:'E_RENDER_CANCELLED'}));return true;}finally{if(!exchange.active){busy=false;stopFrame();}}}
  if(method==='native.temporal.resume'){try{return await exchange.resume(payload);}finally{if(!exchange.active){busy=false;stopFrame();}}}
  if(method==='dispose'&&busy){await exchange.abort(Object.assign(new Error('Stage closed during temporal recording'),{code:'E_NATIVE_TEMPORAL_CLOSED'}));busy=false;}
  if(busy)throw Object.assign(new Error('Native calls must be ordered'),{code:'E_STAGE_BUSY'});
  if(closed)throw Object.assign(new Error('Stage was disposed'),{code:'E_NATIVE_LOGIC_CLOSED'});
  busy=true;
  try{
   if(method==='native.init'){
    if(scope)throw Object.assign(new Error('Stage already initialized'),{code:'E_STAGE_INIT'});
    const {nativeScopeEvidence,moduleResources,moduleResourceLimits,temporalPolicy,stageCalls,residentPolicy,graphTemplateBudget,...init}=payload;modules=moduleResources?await moduleResourceReader(moduleResources,moduleResourceLimits):undefined;scope=new NativeRecordingScope(nativeScopeEvidence,packet=>exchange.segment(packet),residentPolicy?.version===1?residentPolicy.maxBytes:undefined);
    temporal=new NativeTemporalController(scope,init.width,init.height,moduleResources,modules?.read,temporalPolicy?.version===1&&temporalPolicy.seek==='stateless'?'stateless':'fixed-step',{resources:Object.keys(init.resources),inputs:temporalPolicy?.inputs??[],request:(input,clock,context)=>exchange.request(input,clock,context)});
    if(stageCalls?.version===1)children=new CompositeController(scope,exchange);
    if(Number.isSafeInteger(graphTemplateBudget)&&graphTemplateBudget>0)graphEncoder=new NativeGraphEncoder(graphTemplateBudget);
    instance=await factory({...init,...children?{stages:children.api}:{},gpu:scope.api,temporal:temporal.api,...modules?{readModuleBytes:modules.read}:{}});scope.sealInitialization();return {seedScope:{version:1,initialData:scope.initialSeedCount()},previewCheckpoint:!children&&instance.checkpoint?.version===1&&typeof instance.checkpoint.capture==='function'&&typeof instance.checkpoint.restore==='function',temporalSeek:instance.temporal?.version===1&&instance.temporal.profile==='isolated-seek-v1'&&typeof instance.temporal.sampleAt==='function'};
   }
   if(method==='native.render'||method==='native.temporal.sample'){
    if(!scope||!instance)throw Object.assign(new Error('Stage not initialized'),{code:'E_STAGE_INIT'});
    if(method==='native.temporal.sample'&&(!scope.temporalBranchCompatible()||!instance.temporal||instance.temporal.version!==1||instance.temporal.profile!=='isolated-seek-v1'||typeof instance.temporal.sampleAt!=='function'))throw Object.assign(new Error('Producer needs an explicit isolated seek hook; stateless does not prove JS purity'),{code:'E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED'});
    return await exchange.start(async()=>{setFrame(payload.context);scope!.beginFrame();temporal!.openFrame(payload.context);children?.begin();const inputs={...payload.inputs.values};
    for(const [key,value] of Object.entries(payload.inputs.images) as [string,any][])inputs[key]=scope!.importImage(value.info,value.image);
    try{const output=method==='native.temporal.sample'?await instance!.temporal!.sampleAt(payload.context,inputs,payload.props):await instance!.renderAt(payload.context,inputs,payload.props);await children?.finish();await temporal!.finishFrame();if(method==='native.temporal.sample'&&!scope!.temporalBranchCompatible())throw Object.assign(new Error('GPU history and publications require a qualified fork profile'),{code:'E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED'});const packet=scope!.packet(false,scope!.outputPorts(output));
     return graphEncoder&&method==='native.render'?graphEncoder.pack(packet):packet;}catch(error){children?.abort();await temporal!.abortFrame();throw error;}},payload.continuation);
   }
   if(method==='native.preview.capture'||method==='native.preview.restore'){
    const hooks=instance?.checkpoint;
    if(hooks?.version!==1||!scope||children)
     throw Object.assign(new Error('The Stage has no restorable preview state'),{code:'E_NATIVE_PREVIEW_CHECKPOINT_UNSUPPORTED'});
    return await scope.previewCheckpoint(async()=>{
     if(method==='native.preview.restore'){
      await hooks.restore(decodeHostValue(payload));
      return true;
     }
     const snapshot=await hooks.capture();
     try{return encodeHostValue(snapshot,payload.bytes);}
     catch(error){throw Object.assign(new Error(String(error)),{code:'E_NATIVE_PREVIEW_CHECKPOINT_DATA'});}
    });
   }
   if(method==='native.reset'){
    const reset=(instance as any)?.reset;
    if(typeof reset!=='function')throw Object.assign(new Error('Stage must provide an explicit reset; ordinary JS/module/external state is not rewindable'),{code:'E_NATIVE_RESET_UNSUPPORTED'});
    await reset.call(instance);return true;
   }
   if(method==='native.diagnostics')return {initialized:!!instance,scope:scope?.api.stats()??null};
   if(method==='dispose'){closed=true;children?.dispose();try{await temporal?.dispose();await instance?.dispose?.();}finally{try{await scope?.api.dispose();}finally{modules?.dispose();instance=undefined;}}return true;}
   throw Object.assign(new Error('Unsupported native method'),{code:'E_NATIVE_PROTOCOL'});
  }finally{if(!exchange.active){busy=false;stopFrame();}}
 };
}
