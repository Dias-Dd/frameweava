import {randomUUID} from 'node:crypto';
import {EngineError} from '../../src/core/errors.ts';
import type {BuiltProject,RenderedFrame,StageSpec} from '../../src/core/types.ts';
import {Renderer,type RendererOptions} from '../../src/render/renderer.ts';
import {buildProject} from '../../src/compiler/build.ts';
import {runtimeCachePath} from '../../src/runtime/paths.ts';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {RUNTIME,OUTPUT,checkTotal,bounded,publication,copy,same,fail,plain,type Variable,type Value,type Cell,type Runtime} from './protocol.ts';
import {sharedPlan,type SharedPlan} from './plan.ts';
export {sharedPlan,type SharedPlan} from './plan.ts';
export interface SharedFrameResult extends RenderedFrame {shared:{session:string;transaction:number;revision:number;cells:Record<string,Cell>}}
/** Opt-in experiment: one state coordinator, one existing Renderer. No new Stage IPC.
 * No automatic rebuild/restart: close/reopen explicitly after source/policy/backend changes.
 */
export class SharedRenderSession {
  readonly id=randomUUID();private tail:Promise<unknown>=Promise.resolve();private closing?:Promise<void>;
  private accepting=true;private cancelled=false;private transaction=0;private revision=0;
  private cells:Record<string,Cell>={};private readonly stages=new Map<string,StageSpec>();
  private constructor(private build:BuiltProject,private plan:SharedPlan,private renderer:Renderer){
    for(const v of plan.variables)this.cells[v.id]={value:copy(v.initial),version:0};
    for(const s of build.manifest.stages)this.stages.set(s.id,s);
  }
  /** @deprecated Use the public DX RenderSession. This compatibility entry delegates. */
  static async create(project:string,options:RendererOptions={}){
    const {openRenderSession}=await import('../render-session/index.ts');
    return openRenderSession(project,{width:options.width,height:options.height,cache:options.cache,allowWasm:options.allowWasm,timeoutMs:options.timeoutMs,onProfile:options.onProfile,media:options.media,mode:options.preview?'preview':'accurate'});
  }
  /** @deprecated Test-only unsealed historical fixture; excluded from npm distribution. */
  static async fromBuilt(original:BuiltProject,options:RendererOptions={}):Promise<SharedRenderSession>{
    const build:BuiltProject={...original,manifest:structuredClone(original.manifest),assets:{...original.assets},stageBundles:{...original.stageBundles}};
    const plan=sharedPlan(build),renderer=await Renderer.create(build,{...options});return new SharedRenderSession(build,plan,renderer);
  }
  private active(){if(this.cancelled)fail('E_SHARED_CANCELLED','Session cancelled; open a new instance');}
  private enqueue<T>(operation:()=>Promise<T>):Promise<T>{
    if(!this.accepting)return Promise.reject(new EngineError(this.cancelled?'E_SHARED_CANCELLED':'E_SHARED_CLOSED','Session no longer accepts requests'));
    const task=this.tail.then(async()=>{this.active();return operation();});this.tail=task.catch(()=>{});return task;
  }
  renderFrame(frame:number,options:{signal?:AbortSignal}={}):Promise<SharedFrameResult>{
    if(!plain(options)||Object.keys(options).some(k=>k!=='signal'))return Promise.reject(new EngineError('E_SHARED_ARGUMENT','Requests cannot change rendering policy'));
    if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))return Promise.reject(new EngineError('E_SHARED_ARGUMENT','signal must be AbortSignal'));
    const abort=()=>{void this.cancel().catch(()=>{});};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const task=this.enqueue(async()=>{
      if(!Number.isInteger(frame)||frame<0||frame>=this.build.manifest.composition.durationInFrames)fail('E_FRAME_RANGE','Frame is outside the composition');
      if(!this.renderer.status().connected)fail('E_SHARED_BACKEND','Backend disconnected; no replay/recovery is automatic');
      if(this.transaction===Number.MAX_SAFE_INTEGER||this.revision===Number.MAX_SAFE_INTEGER)fail('E_SHARED_VERSION','Version budget exhausted; open a new session');
      const r:Runtime={session:this.id,transaction:++this.transaction,revision:this.revision,frame,cells:copy(this.cells)};
      const stageProps:Record<string,Record<string,string>>={};
      for(const d of this.plan.definitions){const subset=Object.fromEntries([...d.writes,...d.reads.map(b=>b.variable)].map(v=>[v.id,r.cells[v.id]]));stageProps[d.stage]={[RUNTIME]:JSON.stringify({...r,cells:subset})};}
      // The existing cache key includes these props; shared writers/readers get a fresh
      // transaction nonce even on repeated frames or after a failed attempt. Unrelated
      // Stages can still hit the ordinary cache. No cache bypass is mislabelled a hit.
      let result:RenderedFrame;try{result=await this.renderer.renderFrame(frame,undefined,{stageProps});}catch(error){this.active();throw error;}this.active();options.signal?.throwIfAborted();
      const next=copy(this.cells),touched=new Set<string>();
      for(const d of this.plan.definitions.filter(d=>d.writes.length)){
        // Inactive writers publish nothing; TVG already prevents active readers of them.
        const ports=result.stageOutputs[d.stage];if(!ports)continue;
        const p=publication(ports[OUTPUT],r,d.stage);
        for(const [id,c]of Object.entries(p.writes)){
          const v=d.writes.find(v=>v.id===id);if(!v||touched.has(id))fail('E_SHARED_CONFLICT','Undeclared or duplicate write');
          if(!plain(c)||Object.keys(c).some(k=>!['value','version'].includes(k))||!Number.isSafeInteger(c.version)||c.version!==this.cells[id].version+1)fail('E_SHARED_STALE','Invalid publication base/version');
          next[id]={value:bounded(c.value,v.kind),version:c.version};touched.add(id);
        }
      }
      checkTotal(next);this.active();
      // No await between the final cancellation check and this atomic logical commit.
      this.cells=next;if(touched.size)this.revision++;
      return {...result,shared:{session:this.id,transaction:r.transaction,revision:this.revision,cells:copy(this.cells)}};
    });
    return task.finally(()=>options.signal?.removeEventListener('abort',abort));
  }
  /** Enqueued asynchronous read: observes all earlier accepted frame transactions. */
  read<T extends Value>(variable:Variable<T>):Promise<{value:T;version:number;revision:number}>{return this.enqueue(async()=>{
    const expected=this.plan.variables.find(v=>v.id===variable.id);if(!expected||!same(expected,variable))fail('E_SHARED_ACCESS','Unknown variable identity');const c=this.cells[variable.id];return {value:copy(c.value) as T,version:c.version,revision:this.revision};
  });}
  status(){return {session:this.id,accepting:this.accepting,cancelled:this.cancelled,lastCommittedRevision:this.revision,attempts:this.transaction};}
  /** Graceful close drains already accepted work. It does not cancel an active frame. */
  close():Promise<void>{
    if(this.closing)return this.closing;this.accepting=false;
    this.closing=(async()=>{await this.tail;try{await this.renderer.close();}finally{this.cells={};}})();return this.closing;
  }
  /** Cancellation is terminal for this session. Closing the existing backend interrupts
   * pending IPC; it does not roll back arbitrary JS/Worker/file side effects. */
  cancel():Promise<void>{
    this.cancelled=true;this.accepting=false;
    const stop=this.renderer.close();void stop.catch(()=>{});
    if(!this.closing)this.closing=(async()=>{try{await stop;}finally{await this.tail;this.cells={};}})();
    return this.closing;
  }
}
