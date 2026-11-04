import type {BuiltProject,PortValue} from '../../src/core/types.ts';
import type {FrameExecution} from '../../src/render/frame-execution.ts';
import {EngineError} from '../../src/core/errors.ts';
import {hasSharedState,sharedPlan} from './plan.ts';
import {SharedStateCoordinator,type SharedCommit} from './coordinator.ts';
import {fail,type Value,type Variable} from './protocol.ts';

export interface SharedSessionOwner {
  /** Must throw when cancelled/invalid. Owner, not this adapter, owns queue/cleanup. */
  assertActive():void;
}
/** Integration component for the EXISTING DX Session. Not a second Session. */
export class SharedSessionAdapter {
  private state?:SharedStateCoordinator;private seal?:string;
  constructor(private readonly session:string){}
  /** Called after DX prepare has verified source/resource/lock/trust fingerprints. */
  bind(build:BuiltProject,verifiedSeal:string):boolean{
    if(typeof verifiedSeal!=='string'||!verifiedSeal)fail('E_SHARED_SESSION','DX must supply its verified generation seal');
    if(this.state){if(verifiedSeal!==this.seal)this.state.invalidate();this.check();return true;}
    if(!hasSharedState(build))return false;
    this.state=new SharedStateCoordinator(sharedPlan(build),this.session);this.seal=verifiedSeal;return true;
  }
  private check(){this.state?.assertActive();}
  /** Call only inside DX's queue. execute is its existing common Renderer path. */
  async render<T extends {stageOutputs:Record<string,Record<string,PortValue>>}>(frame:number,execute:(input:FrameExecution|undefined)=>Promise<T>,owner:SharedSessionOwner,stageId?:string):Promise<T&{shared?:SharedCommit}>{
    owner.assertActive();this.check();
    if(!this.state)return execute(undefined);
    if(stageId!==undefined)fail('E_SHARED_PARTIAL_RENDER','Stage-only inspection cannot commit a whole-frame shared transaction; inspect the composition');
    return this.transact(this.state.begin(frame),execute,owner);
  }
  /** Explicit single-Stage boundary, distinct from partial composition rendering. */
  async call<T extends {stageOutputs:Record<string,Record<string,PortValue>>}>(stageId:string,frame:number,execute:(input:FrameExecution|undefined)=>Promise<T>,owner:SharedSessionOwner):Promise<T&{shared?:SharedCommit}>{
    owner.assertActive();this.check();if(!this.state)return execute(undefined);
    return this.transact(this.state.beginCall(stageId,frame),execute,owner);
  }
  private async transact<T extends {stageOutputs:Record<string,Record<string,PortValue>>}>(tx:import('./coordinator.ts').SharedTransaction,execute:(input:FrameExecution|undefined)=>Promise<T>,owner:SharedSessionOwner):Promise<T&{shared?:SharedCommit}>{
    const state=this.state!;
    try{
      const result=await execute({stageProps:tx.stageProps});owner.assertActive();
      // No await after the last lifecycle check or inside state.complete.
      const shared=state.complete(tx,result.stageOutputs);return {...result,shared};
    }catch(error){
      state.discard(tx);
      owner.assertActive();this.check();
      if(error instanceof EngineError&&['E_STAGE_TIMEOUT','E_CHROMIUM_DISCONNECTED','E_RENDERER_DISCONNECTED','E_NATIVE_LOGIC_CLOSED','E_SPIDERMONKEY_EXIT','E_NATIVE_PROCESS','E_RENDERER_CLOSED','E_STAGE_INIT','E_STAGE_IMPORT'].includes(error.code))state.invalidate();
      throw error;
    }
  }
  /** Internal only: public DX readShared must enqueue and validate its seal first. */
  read<T extends Value>(variable:Variable<T>){this.check();if(!this.state)fail('E_SHARED_HOST_REQUIRED','This project has no explicit shared declarations');return this.state.read(variable);}
  invalidate(code?:string,message?:string){this.state?.invalidate(code,message);}
  dispose(){this.state?.dispose();}
  status(){return this.state?{enabled:true as const,...this.state.status()}:{session:this.session,enabled:false as const};}
}
