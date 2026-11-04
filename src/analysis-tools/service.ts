import {writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAnalysisTask} from '../analysis/task.ts';
import {createNodeAnalysisExecutor} from '../analysis/node-executor.ts';
import {AnalysisArtifactStore} from '../analysis/artifact.ts';
import {EngineError,diagnostic} from '../core/errors.ts';
import {AnalysisPaths,toolError} from './paths.ts';
import {inspectArtifact,sampleArtifact} from './artifacts.ts';
import {AnalysisQuerySession} from './query-session.ts';
import {sampleBatch} from './sample-batch.ts';
import {analysisToolDefinitions} from './tools.ts';
import type {AnalysisRunRequest,AnalysisJobView,LiveAnalysisHandle,AnalysisToolEvent,AnalysisQuery,AnalysisBatchQuery,AnalysisPreviewOptions} from './types.ts';

const jobPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const keyPattern=/^[a-f0-9]{64}$/;
/** One explicit foreground owner. Jobs live only in this instance, never a hidden host or scheduler. */
export class AnalysisService {
  private readonly jobs=new Map<string,{capabilityId:string;handle:LiveAnalysisHandle;done:Promise<unknown>}>();
  private closed=false;
  private readonly querySession=new AnalysisQuerySession();
  private constructor(readonly paths:AnalysisPaths){}
  static async create(options:{projectRoot:string}) {return new AnalysisService(await AnalysisPaths.create(options.projectRoot));}
  async list(){const {installedAnalysisCapabilities}=await import('./capabilities.ts');const catalog=await installedAnalysisCapabilities(this.paths);return {capabilities:catalog.capabilities.map(c=>c.description),installedModules:catalog.installedModules,tools:analysisToolDefinitions,lifecycle:{run:'foreground-wait',progress:'callback-or-stderr-jsonl',liveControl:'same-service-instance-only',crossProcessStatus:'terminal-receipts-only',backgroundHost:false}};}
  private view(jobId:string,capabilityId:string,handle:LiveAnalysisHandle):AnalysisJobView {
    const s=handle.status();return {jobId,capabilityId,state:s.state,phase:s.phase,completed:s.completed,...s.total===undefined?{}:{total:s.total},...s.progress===undefined?{}:{progress:s.progress},executionFinished:s.executionFinished,cleanupFinished:s.cleanupFinished,...s.cleanup?{cleanup:s.cleanup}:{},...s.error?{error:s.error}:{},scope:'live-service',controllable:['created','running','cancelling'].includes(s.state)&&s.phase!=='committing',...s.result?{artifactId:s.result.artifact.manifest.cacheKey}:{}};
  }
  async start(request:AnalysisRunRequest) {
    if(this.closed)toolError('E_ANALYSIS_SERVICE_CLOSED','Analysis service is closed');
    const {installedAnalysisCapabilities}=await import('./capabilities.ts');
    const {capabilities}=await installedAnalysisCapabilities(this.paths,{forExecution:request.capabilityId}),cap=capabilities.find(c=>c.description.id===request.capabilityId||c.description.aliases.includes(request.capabilityId));
    if(!cap)toolError('E_ANALYSIS_CAPABILITY','Unknown or unregistered analysis capability');
    const input=await cap.prepare(request.input,request.parameters===undefined?{}:request.parameters),cacheRoot=await this.paths.managed('artifacts');
    if(this.closed)toolError('E_ANALYSIS_SERVICE_CLOSED','Analysis service closed during preflight');
    const handle=createAnalysisTask({input,executor:createNodeAnalysisExecutor({module:cap.module,exportName:cap.exportName,cacheRoot,cwd:this.paths.root})}),id=handle.id;
    const done=handle.wait().then(async result=>{await this.receipt(this.view(id,cap.description.id,handle));return result;},async error=>{await this.receipt(this.view(id,cap.description.id,handle));throw error;});void done.catch(()=>{});
    this.jobs.set(id,{capabilityId:cap.description.id,handle,done});handle.start();return this.view(id,cap.description.id,handle);
  }
  subscribe(jobId:string,listener:(event:AnalysisToolEvent)=>void) {
    const job=this.jobs.get(jobId);if(!job)toolError('E_ANALYSIS_NOT_LIVE','Progress subscription requires the owning service instance');
    return job.handle.subscribe(()=>listener({schemaVersion:1,event:'analysis.progress',job:this.view(jobId,job.capabilityId,job.handle)}));
  }
  private async receipt(job:AnalysisJobView) {
    if(!['succeeded','failed','cancelled'].includes(job.state))toolError('E_ANALYSIS_RECEIPT','Only terminal states may be persisted');
    const root=await this.paths.managed('jobs'),path=await this.paths.check(join(root,job.jobId+'.json'));
    const temp=path+'.'+randomUUID()+'.tmp';let owned=false;try{await writeFile(temp,JSON.stringify({schemaVersion:1,...job,scope:'terminal-receipt',controllable:false},null,2),{flag:'wx'});owned=true;await rename(temp,path);}finally{if(owned)await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  async status(jobId:string):Promise<AnalysisJobView> {
    if(!jobPattern.test(jobId))toolError('E_ARGUMENT','Expected an analysis job UUID');
    const live=this.jobs.get(jobId);if(live)return this.view(jobId,live.capabilityId,live.handle);
    let saved:any;try{saved=await this.paths.json(`.frameweave/analysis-tools/jobs/${jobId}.json`);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return toolError('E_ANALYSIS_NOT_LIVE','Job is not owned by this process and has no terminal receipt; use foreground progress/SIGINT, not cross-process control');throw e;}
    if(saved.schemaVersion!==1||saved.jobId!==jobId||!['succeeded','failed','cancelled'].includes(saved.state)||saved.scope!=='terminal-receipt'||saved.controllable!==false)toolError('E_ANALYSIS_RECEIPT','Invalid terminal receipt; no live ownership is inferred');
    if(saved.state==='succeeded')await this.artifact(saved.artifactId);
    return saved;
  }
  async cancel(jobId:string) {const job=this.jobs.get(jobId);if(job)return {accepted:job.handle.cancel(),job:await this.status(jobId)};const saved=await this.status(jobId);return {accepted:false,job:saved,reason:'terminal-receipt-has-no-live-executor'};}
  async wait(jobId:string) {
    const job=this.jobs.get(jobId);if(!job)toolError('E_ANALYSIS_NOT_LIVE','wait requires a job created in this service instance');
    try{const result=await job.done as Awaited<ReturnType<LiveAnalysisHandle['wait']>>;return {job:await this.status(jobId),artifact:await this.inspect(result.artifact.manifest.cacheKey),execution:{cacheHit:result.cacheHit,publication:result.publication,elapsedMs:result.elapsedMs},diagnostics:[]};}
    catch(e){const d=diagnostic(e);throw new EngineError(d.code,d.message,{details:{jobId,job:await this.status(jobId),cause:d.details}});}
  }
  async run(request:AnalysisRunRequest,options:{signal?:AbortSignal;onProgress?:(event:AnalysisToolEvent)=>void}={}) {
    if(options.signal?.aborted)toolError('E_CANCELLED','Analysis request cancelled before start');const job=await this.start(request),live=this.jobs.get(job.jobId)!;
    const off=options.onProgress?this.subscribe(job.jobId,options.onProgress):()=>{};
    const cancel=()=>live.handle.cancel();options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
    try{return await this.wait(job.jobId);}finally{off();options.signal?.removeEventListener('abort',cancel);}
  }
  private async artifact(id:string) {
    if(typeof id!=='string'||!keyPattern.test(id))toolError('E_ARGUMENT','Artifact ID must be a C3 SHA256 key, never a path');
    try{const root=await this.paths.managed('artifacts');await this.paths.check(join(root,id));const artifact=await new AnalysisArtifactStore(root).read(id);if(!artifact)toolError('E_ANALYSIS_ARTIFACT_MISSING','Artifact is not published in this selected project');return artifact;}
    catch(error){this.querySession.clear();throw error;}
  }
  async inspect(id:string,query:AnalysisQuery={}) {return inspectArtifact(await this.artifact(id),query);}
  async sample(id:string,query:AnalysisQuery) {const artifact=await this.artifact(id);return sampleArtifact(artifact,query,await this.querySession.track(artifact));}
  async sampleBatch(id:string,query:AnalysisBatchQuery,options:{signal?:AbortSignal}={}) {
    return sampleBatch(()=>this.authenticatedTrack(id),id,query,options);
  }
  /** Batch authentication uses the same C3/Reader gates as point queries; no stat-only trust. */
  private async authenticatedTrack(id:string) {const artifact=await this.artifact(id);return {artifact,...await this.querySession.track(artifact)};}
  queryCacheStatus(){return this.querySession.status();}
  clearQueryCache(){this.querySession.clear();}
  async preview(id:string,time:number,output:string,query:AnalysisPreviewOptions={}) {
    if(query.backend!==undefined&&!['node','renderer'].includes(query.backend))toolError('E_ARGUMENT','Preview backend must be node or renderer');
    const {previewArtifact}=await import(query.backend==='renderer'?'./preview.ts':'./preview-node.ts');return previewArtifact(this.paths,await this.artifact(id),time,output,query);
  }
  async close() {this.closed=true;this.querySession.close();for(const job of this.jobs.values())job.handle.cancel();await Promise.allSettled([...this.jobs.values()].map(job=>job.done));this.jobs.clear();}
}
export const createAnalysisService=(options:{projectRoot:string})=>AnalysisService.create(options);
