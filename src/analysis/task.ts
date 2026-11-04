import {randomUUID} from 'node:crypto';
import {EngineError,diagnostic} from '../core/errors.ts';
import {canonicalAnalysisValue} from './artifact.ts';
import type {AnalysisExecutor,AnalysisSnapshot,AnalysisResult} from './types.ts';

/** One request, one executor. No scheduling, retry policy, daemon or global registry. */
export class AnalysisTaskHandle<Input,Output> {
  readonly id=randomUUID();
  private controller=new AbortController();
  private committing=false;
  private snapshot:AnalysisSnapshot<Output>={id:this.id,state:'created',phase:'created',completed:0,executionFinished:false,cleanupFinished:false};
  private listeners=new Set<(status:AnalysisSnapshot<Output>)=>void>();
  private resolveDone!:(result:AnalysisResult<Output>)=>void;
  private rejectDone!:(error:EngineError)=>void;
  private completion=new Promise<AnalysisResult<Output>>((resolve,reject)=>{this.resolveDone=resolve;this.rejectDone=reject;});
  private readonly input:Input;
  constructor(options:{input:Input;executor:AnalysisExecutor<Input,Output>}) {
    canonicalAnalysisValue(options.input);this.input=structuredClone(options.input);this.executor=options.executor;
    void this.completion.catch(()=>{});
  }
  private readonly executor:AnalysisExecutor<Input,Output>;
  status():AnalysisSnapshot<Output>{return structuredClone(this.snapshot);}
  subscribe(listener:(status:AnalysisSnapshot<Output>)=>void):()=>void {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private emit(){for(const listener of this.listeners){try{listener(this.status());}catch{/* Observers cannot change task ownership. */}}}
  start():this {
    if(this.snapshot.state!=='created')throw new EngineError('E_ANALYSIS_STATE','AnalysisTask can only start once');
    this.snapshot.state='running';this.snapshot.phase='starting';
    this.emit();void this.run();return this;
  }
  private async run() {
    try{
      const result=await this.executor.execute(this.input,{
        signal:this.controller.signal,
        reportProgress:progress=>{
          if(!['running','cancelling'].includes(this.snapshot.state)||this.committing)return;
          if(typeof progress.phase!=='string'||!progress.phase||!Number.isFinite(progress.completed)||progress.completed<0||progress.total!==undefined&&(!Number.isFinite(progress.total)||progress.total<progress.completed))throw new EngineError('E_ANALYSIS_PROGRESS','Invalid task progress');
          this.snapshot.phase=progress.phase;this.snapshot.completed=progress.completed;this.snapshot.total=progress.total;
          this.snapshot.progress=progress.total?progress.completed/progress.total:undefined;this.emit();
        },
        executionFinished:()=>{this.snapshot.executionFinished=true;this.snapshot.phase='cleaning';this.emit();},
        beginCommit:()=>{
          if(this.controller.signal.aborted||this.snapshot.state!=='running')return false;
          this.committing=true;this.snapshot.phase='committing';this.emit();return true;
        }
      });
      this.controller.signal.throwIfAborted();
      if(!result.cleanup.complete||!result.cleanup.processExited||result.cleanup.forced)throw new EngineError('E_ANALYSIS_CLEANUP','Executor returned without verified cleanup',{details:{cleanup:result.cleanup}});
      this.snapshot.state='succeeded';this.snapshot.phase='succeeded';this.snapshot.progress=1;
      this.snapshot.executionFinished=true;this.snapshot.cleanupFinished=true;this.snapshot.cleanup=structuredClone(result.cleanup);this.snapshot.result=structuredClone(result);
      this.emit();this.resolveDone(result);
    }catch(error){
      const detail=diagnostic(error),cleanup=(detail.details as any)?.cleanup;
      this.snapshot.state=this.controller.signal.aborted?'cancelled':'failed';this.snapshot.phase=this.snapshot.state;
      this.snapshot.cleanupFinished=true;this.snapshot.cleanup=cleanup;this.snapshot.error=detail;this.emit();
      this.rejectDone(error instanceof EngineError?error:new EngineError(this.controller.signal.aborted?'E_CANCELLED':detail.code,detail.message,{details:detail.details}));
    }
  }
  wait():Promise<AnalysisResult<Output>> {return this.completion;}
  cancel():boolean {
    if(this.committing||['succeeded','failed','cancelled'].includes(this.snapshot.state))return false;
    if(this.snapshot.state==='cancelling')return true;
    const beforeStart=this.snapshot.state==='created';
    this.snapshot.state=beforeStart?'cancelled':'cancelling';this.snapshot.phase=this.snapshot.state;
    this.controller.abort(new EngineError('E_CANCELLED','AnalysisTask cancelled'));
    if(beforeStart){this.snapshot.cleanupFinished=true;this.snapshot.cleanup={complete:true,resources:{},errors:[],stagingRemoved:true,processExited:true,forced:false};this.rejectDone(new EngineError('E_CANCELLED','AnalysisTask cancelled before start',{details:{cleanup:this.snapshot.cleanup}}));}
    this.emit();return true;
  }
}
export const createAnalysisTask=<I,O>(options:{input:I;executor:AnalysisExecutor<I,O>})=>new AnalysisTaskHandle(options);
