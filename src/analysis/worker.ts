import {pathToFileURL} from 'node:url';
import {AnalysisArtifactStore,analysisCacheKey,canonicalAnalysisValue} from './artifact.ts';
import {EngineError,diagnostic} from '../core/errors.ts';
import type {AnalysisContext,AnalysisDefinition,AnalysisCleanup,AnalysisIdentity} from './types.ts';

const controller=new AbortController();
process.on('message',(message:any)=>{if(message?.kind==='cancel')controller.abort(new EngineError('E_CANCELLED','AnalysisTask cancelled'));});
process.on('disconnect',()=>controller.abort(new EngineError('E_CANCELLED','AnalysisTask owner disconnected')));
const send=(message:unknown)=>{if(process.connected)process.send?.(message);};
const transportDiagnostic=(error:unknown)=>{
  const d=diagnostic(error);
  if(d.details!==undefined)try{canonicalAnalysisValue(d.details);}catch{d.details=String(d.details);}
  return d;
};
const withExecutor=(identity:AnalysisIdentity):AnalysisIdentity=>({...identity,runtime:{...identity.runtime,executor:{id:'node-child-process',version:'1',environment:{node:process.version,platform:process.platform,arch:process.arch}}}});
process.once('message',async(message:any)=>{
  if(message?.kind!=='start')return;
  const cleanup:AnalysisCleanup={complete:true,resources:{},errors:[],stagingRemoved:false,processExited:false,forced:false};
  const releases:{name:string;release:()=>void|Promise<void>}[]=[];
  const context:AnalysisContext={signal:controller.signal,reportProgress:p=>send({kind:'progress',progress:p}),deferCleanup(name,release){if(!name||releases.some(r=>r.name===name))throw new EngineError('E_ANALYSIS_CLEANUP','Cleanup names must be unique');releases.push({name,release});cleanup.resources[name]=false;}};
  let outcome:any,prepared:any,identity:AnalysisIdentity|undefined;
  try{
    controller.signal.throwIfAborted();canonicalAnalysisValue(message.input);
    const module=await import(pathToFileURL(message.module).href);
    const definition=module[message.exportName] as AnalysisDefinition<unknown,unknown>;
    if(!definition||typeof definition.describe!=='function'||typeof definition.execute!=='function'||typeof definition.validateOutput!=='function')throw new EngineError('E_ANALYSIS_MODULE','Expected describe, execute and validateOutput in analysis module');
    const store=new AnalysisArtifactStore(message.cacheRoot,message.storeOptions);
    identity=withExecutor(await definition.describe(message.input,context));controller.signal.throwIfAborted();
    const key=analysisCacheKey(identity);context.reportProgress({phase:'cache',completed:0});
    const cached=await store.read(key);controller.signal.throwIfAborted();
    if(cached){definition.validateOutput(cached.manifest.output);prepared={key,cacheHit:true};}
    else{
      const result=await definition.execute(message.input,{...context,identity,cacheKey:key,directory:message.staging});
      send({kind:'computed'});controller.signal.throwIfAborted();definition.validateOutput(result.output);canonicalAnalysisValue(result.output);
      if(analysisCacheKey(withExecutor(await definition.describe(message.input,context)))!==key)throw new EngineError('E_ANALYSIS_INPUT_CHANGED','Analysis dependencies changed during execution; result was not published');
      prepared={key,cacheHit:false,result};
    }
  }catch(error){outcome={error:transportDiagnostic(controller.signal.aborted?new EngineError('E_CANCELLED','AnalysisTask cancelled'):error)};}
  finally{
    send({kind:'computed'});
    for(const {name,release}of releases.reverse())try{await release();cleanup.resources[name]=true;}catch(error){cleanup.complete=false;cleanup.errors.push(transportDiagnostic(error));}
  }
  if(!outcome&&controller.signal.aborted)outcome={error:diagnostic(new EngineError('E_CANCELLED','AnalysisTask cancelled'))};
  if(!cleanup.complete)outcome={error:diagnostic(new EngineError('E_ANALYSIS_CLEANUP','Analysis resource cleanup failed',{details:cleanup.errors}))};
  if(!outcome)try{
    if(!prepared.cacheHit){
      const store=new AnalysisArtifactStore(message.cacheRoot,message.storeOptions);
      await store.prepare(message.staging,identity!,prepared.result.output,prepared.result.files,controller.signal);
    }
    outcome={prepared:{key:prepared.key,cacheHit:prepared.cacheHit}};
  }catch(error){outcome={error:diagnostic(controller.signal.aborted?new EngineError('E_CANCELLED','AnalysisTask cancelled'):error)};}
  if(process.connected)await new Promise<void>(resolve=>process.send?.({kind:'finished',...outcome,cleanup},()=>resolve()));
  if(process.connected)process.disconnect();
});
