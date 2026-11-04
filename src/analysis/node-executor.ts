import {fork,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {EngineError,diagnostic} from '../core/errors.ts';
import {AnalysisArtifactStore,type AnalysisStoreOptions} from './artifact.ts';
import type {AnalysisExecutor,AnalysisCleanup,AnalysisResult} from './types.ts';

export interface NodeAnalysisOptions {
  module:string;
  exportName?:string;
  cacheRoot:string;
  cwd?:string;
  cancelGraceMs?:number;
  exitGraceMs?:number;
  store?:AnalysisStoreOptions;
}
/** The module is trusted local code. This is an ownership/IPC adapter, not a security sandbox. */
export function createNodeAnalysisExecutor<Input,Output>(options:NodeAnalysisOptions):AnalysisExecutor<Input,Output> {
  const module=options.module.startsWith('file:')?fileURLToPath(options.module):resolve(options.module);
  for(const ms of [options.cancelGraceMs??10000,options.exitGraceMs??2000])if(!Number.isFinite(ms)||ms<1)throw new EngineError('E_ANALYSIS_CONFIG','Executor grace periods must be positive');
  return {async execute(input,context):Promise<AnalysisResult<Output>>{
    const store=new AnalysisArtifactStore(options.cacheRoot,options.store),began=performance.now();
    let staging:string|undefined;
    const cleanup:AnalysisCleanup={complete:true,resources:{},errors:[],stagingRemoved:true,processExited:true,forced:false};
    let result:Omit<AnalysisResult<Output>,'cleanup'>|undefined,error:unknown;
    try{
      context.signal.throwIfAborted();staging=await store.begin();cleanup.stagingRemoved=false;context.signal.throwIfAborted();
      const outcome=await new Promise<any>((resolveDone,reject)=>{
        const child=fork(fileURLToPath(new URL('./worker.ts',import.meta.url)),[],{cwd:options.cwd??process.cwd(),execArgv:['--import',import.meta.resolve('tsx/esm')],silent:true,windowsHide:true,detached:process.platform!=='win32',serialization:'advanced'});
        cleanup.processExited=false;
        let finish:any,processError:unknown,stderr='',timer:ReturnType<typeof setTimeout>|undefined;
        const terminate=()=>{
          cleanup.forced=true;cleanup.complete=false;
          if(!child.pid)return;
          if(process.platform==='win32'){
            const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>child.kill('SIGKILL'));killer.once('close',code=>{if(code!==0)child.kill('SIGKILL');});
          }else try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}
        };
        const cancel=()=>{
          if(child.connected)child.send({kind:'cancel'},()=>{});
          if(!timer)timer=setTimeout(terminate,options.cancelGraceMs??10000);
        };
        context.signal.addEventListener('abort',cancel,{once:true});
        child.stdout?.resume();child.stderr?.on('data',b=>{stderr=(stderr+b.toString()).slice(-12000);});
        child.on('message',(m:any)=>{
          try{
            if(m?.kind==='progress')context.reportProgress(m.progress);
            if(m?.kind==='computed')context.executionFinished();
            if(m?.kind==='finished'){
              finish=m;
              if(!m.cleanup?.complete)terminate();
              else if(!timer)timer=setTimeout(terminate,options.exitGraceMs??2000);
            }
          }catch(e){processError=e;cancel();}
        });
        child.once('error',e=>{processError=e;});
        child.once('close',(code,signal)=>{
          clearTimeout(timer);context.signal.removeEventListener('abort',cancel);cleanup.processExited=true;
          if(finish?.cleanup){cleanup.resources=finish.cleanup.resources;cleanup.errors=finish.cleanup.errors;cleanup.complete=finish.cleanup.complete&&!cleanup.forced;}
          if(cleanup.forced){reject(new EngineError(finish?.error?.code==='E_ANALYSIS_CLEANUP'?'E_ANALYSIS_CLEANUP':'E_ANALYSIS_TERMINATED',finish?.error?.code==='E_ANALYSIS_CLEANUP'?finish.error.message:'Owned analysis process tree required forced termination',{details:{code,signal,stderr}}));return;}
          if(processError||code!==0||!finish){cleanup.complete=false;reject(processError??new EngineError('E_ANALYSIS_PROCESS','Analysis child exited without a successful completion protocol',{details:{code,signal,stderr}}));return;}
          resolveDone(finish);
        });
        child.send({kind:'start',input,module,exportName:options.exportName??'task',cacheRoot:store.root,storeOptions:options.store,staging},e=>{if(e){processError=e;cancel();}});
        if(context.signal.aborted)cancel();
      });
      if(outcome.error)throw new EngineError(outcome.error.code,outcome.error.message,{details:outcome.error.details});
      context.signal.throwIfAborted();
      // Host publication happens only after the owned process has closed and cleanup succeeded.
      if(!context.beginCommit())throw new EngineError('E_CANCELLED','AnalysisTask cancelled before publication');
      const key=outcome.prepared?.key;
      if(outcome.prepared?.cacheHit){const cached=await store.read<Output>(key);if(!cached)throw new EngineError('E_ANALYSIS_CACHE','Artifact disappeared before cache return');result={artifact:cached,output:cached.manifest.output,cacheHit:true,publication:'cache',elapsedMs:performance.now()-began};}
      else{const published=await store.publish<Output>(staging,key);result={artifact:{directory:published.directory,manifest:published.manifest},output:published.manifest.output,cacheHit:false,publication:published.publication,elapsedMs:performance.now()-began};}
    }catch(e){error=e;}
    finally{
      if(staging)try{await store.discard(staging);cleanup.stagingRemoved=true;}catch(e){cleanup.complete=false;cleanup.errors.push(diagnostic(e));error??=new EngineError('E_ANALYSIS_CLEANUP','Could not remove owned analysis staging directory');}
    }
    if(error){const d=diagnostic(context.signal.aborted&&!cleanup.forced?new EngineError('E_CANCELLED','AnalysisTask cancelled'):error);throw new EngineError(d.code,d.message,{details:{cause:d.details,cleanup}});}
    return {...result!,cleanup};
  }};
}
