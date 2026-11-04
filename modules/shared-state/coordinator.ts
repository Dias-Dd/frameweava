import type {Json,PortValue} from '../../src/core/types.ts';
import {RUNTIME,OUTPUT,copy,bounded,publication,checkTotal,same,plain,fail,type Runtime,type Cell,type Value,type Variable} from './protocol.ts';
import type {SharedPlan} from './plan.ts';

/** Host data only. No Renderer, compiler, queue, browser, RPC, or permission owner. */
export interface SharedTransaction {
  readonly session:string;
  readonly transaction:number;
  readonly revision:number;
  readonly frame:number;
  readonly callStage?:string;
  readonly stageProps:Readonly<Record<string,Readonly<Record<string,Json>>>>;
}
export interface SharedCommit {session:string;transaction:number;revision:number;cells:Record<string,Cell>}
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};

/** The owning DX Session serializes begin/render/complete/read. Overlap is rejected. */
export class SharedStateCoordinator {
  private readonly plan:SharedPlan;
  private cells:Record<string,Cell>={};private revision=0;private attempts=0;
  private pending?:{token:SharedTransaction;base:Runtime};
  private invalid?:{code:string;message:string};private disposed=false;
  constructor(plan:SharedPlan,readonly session:string){
    if(typeof session!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(session))fail('E_SHARED_SESSION','Invalid host Session identity');
    this.plan=freeze(copy(plan));
    for(const v of this.plan.variables)this.cells[v.id]={value:copy(v.initial),version:0};
    checkTotal(this.cells);
  }
  private active(){if(this.disposed)fail('E_SHARED_CLOSED','Shared state was released');if(this.invalid)fail(this.invalid.code,this.invalid.message);}
  assertActive():void{this.active();}
  begin(frame:number):SharedTransaction{
    return this.start(frame);
  }
  beginCall(stageId:string,frame:number):SharedTransaction{
    this.active();if(!Object.hasOwn(this.plan.activation,stageId))fail('E_STAGE_REFERENCE','Unknown callable Stage');
    const range=this.plan.activation[stageId];if(frame<range.start||frame>=range.start+range.duration)fail('E_STAGE_INACTIVE','Stage is inactive at the selected frame');
    return this.start(frame,stageId);
  }
  private start(frame:number,callStage?:string):SharedTransaction{
    this.active();if(this.pending)fail('E_SHARED_BUSY','The Session owner must serialize frame transactions');
    if(!Number.isSafeInteger(frame)||frame<0||frame>=this.plan.durationInFrames)fail('E_FRAME_RANGE','Frame is outside the composition');
    if(this.attempts===Number.MAX_SAFE_INTEGER||this.revision===Number.MAX_SAFE_INTEGER)fail('E_SHARED_VERSION','Version budget exhausted; reopen Session');
    const base:Runtime={session:this.session,transaction:++this.attempts,revision:this.revision,frame,cells:copy(this.cells),...(callStage===undefined?{}:{callStage})};
    const stageProps:Record<string,Record<string,Json>>={};
    for(const d of this.plan.definitions.filter(d=>callStage===undefined||d.stage===callStage)){const cells=Object.fromEntries([...d.writes,...d.reads.map(b=>b.variable)].map(v=>[v.id,base.cells[v.id]]));stageProps[d.stage]={[RUNTIME]:JSON.stringify({...base,cells})};}
    const token=freeze({session:this.session,transaction:base.transaction,revision:base.revision,frame,...(callStage===undefined?{}:{callStage}),stageProps});this.pending={token,base};return token;
  }
  /** Call only after the existing Renderer has completed the whole frame (not a Stage-only render). */
  complete(token:SharedTransaction,outputs:Record<string,Record<string,PortValue>>):SharedCommit{
    this.active();const pending=this.pending;
    if(!pending||pending.token!==token)fail('E_SHARED_STALE','This frame transaction is no longer pending');
    // Any validation failure consumes the candidate. Retrying always needs a new identity.
    this.pending=undefined;
    if(token.callStage!==undefined&&(!Object.hasOwn(outputs,token.callStage)||Object.keys(outputs).some(id=>id!==token.callStage)))fail('E_SHARED_CALL_SCOPE','Call result must contain only the target Stage');
    const next=copy(this.cells),touched=new Set<string>();
    for(const d of this.plan.definitions.filter(d=>d.writes.length)){
      if(token.callStage!==undefined&&d.stage!==token.callStage)continue;
      const range=this.plan.activation[d.stage];if(token.frame<range.start||token.frame>=range.start+range.duration)continue;
      const ports=Object.hasOwn(outputs,d.stage)?outputs[d.stage]:undefined;
      if(!ports)fail('E_SHARED_PUBLICATION','An active writer did not return a publication');
      const p=publication(ports[OUTPUT],pending.base,d.stage);
      for(const [id,c]of Object.entries(p.writes)){
        const v=d.writes.find(v=>v.id===id);if(!v||touched.has(id))fail('E_SHARED_CONFLICT','Undeclared or duplicate write');
        if(!plain(c)||Object.keys(c).some(k=>!['value','version'].includes(k))||!Number.isSafeInteger(c.version)||c.version!==this.cells[id].version+1)fail('E_SHARED_STALE','Invalid publication base/version');
        next[id]={value:bounded(c.value,v.kind),version:c.version};touched.add(id);
      }
    }
    checkTotal(next);this.active();this.cells=next;if(touched.size)this.revision++;
    return {session:this.session,transaction:token.transaction,revision:this.revision,cells:copy(this.cells)};
  }
  discard(token:SharedTransaction):void{if(this.pending?.token===token)this.pending=undefined;}
  /** Internal synchronous read; the public Session read must first wait its shared queue. */
  read<T extends Value>(variable:Variable<T>):{value:T;version:number;revision:number}{
    this.active();const expected=this.plan.variables.find(v=>v.id===variable.id);if(!expected||!same(expected,variable))fail('E_SHARED_ACCESS','Unknown variable identity');
    const c=this.cells[variable.id];return {value:copy(c.value) as T,version:c.version,revision:this.revision};
  }
  invalidate(code='E_SHARED_SESSION_REOPEN',message='The execution environment changed; reopen Session'):void{if(!this.invalid)this.invalid={code,message};this.pending=undefined;}
  dispose():void{this.pending=undefined;this.cells={};this.disposed=true;}
  status(){return {session:this.session,revision:this.revision,attempts:this.attempts,pending:!!this.pending,invalidated:!!this.invalid,disposed:this.disposed};}
}
