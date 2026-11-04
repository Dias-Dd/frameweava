import {RenderSession,type RenderSessionOptions,type SessionFrame} from '../../modules/render-session/index.ts';
import {EngineError} from '../core/errors.ts';
import type {MediaPolicy} from './compositor.ts';

export type MediaPreviewOptions=Omit<RenderSessionOptions,'mode'|'media'>&{media:MediaPolicy};
type Request={frame:number;resolve:(value:SessionFrame)=>void;reject:(error:unknown)=>void;stale:boolean};
/** One existing Session, at most one active and one latest queued frame.
 * An active Shared transaction completes normally; only its obsolete display is suppressed.
 */
export class MediaPreviewSession {
 private session:RenderSession;private active?:Request;private pending?:Request;private running?:Promise<void>;private accepting=true;private closing?:Promise<void>;
 constructor(project:string,options:MediaPreviewOptions){
  if(!options?.media?.preview)throw new EngineError('E_MEDIA_PREVIEW','Preview needs an explicit display transform');
  this.session=new RenderSession(project,{...options,mode:'preview',media:{...options.media,transport:'buffer-v1',previewCompute:true}});
 }
 requestFrame(frame:number):Promise<SessionFrame>{
  if(!this.accepting)return Promise.reject(new EngineError('E_MEDIA_PREVIEW_CLOSED','Preview is closed'));
  if(!Number.isInteger(frame)||frame<0)return Promise.reject(new EngineError('E_ARGUMENT','Preview frame must be a non-negative integer'));
  const result=new Promise<SessionFrame>((resolve,reject)=>{
   const request:Request={frame,resolve,reject,stale:false};
   if(this.active){this.active.stale=true;this.pending?.reject(this.superseded(this.pending.frame));this.pending=request;}else this.start(request);
  });return result;
 }
 private superseded(frame:number){return new EngineError('E_MEDIA_PREVIEW_SUPERSEDED','A newer preview request replaced this display',{frame});}
 private start(request:Request){
  this.active=request;
  this.running=(async()=>{
   try{const result=await this.session.renderFrame(request.frame);if(request.stale)request.reject(this.superseded(request.frame));else request.resolve(result);}catch(e){request.reject(e);}
   finally{this.active=undefined;const next=this.pending;this.pending=undefined;if(next)this.start(next);}
  })();
 }
 status(){return {version:1 as const,accepting:this.accepting,activeFrame:this.active?.frame??null,pendingFrame:this.pending?.frame??null,session:this.session.status()};}
 /** Drains the active transaction, discards queued display work and closes all resources. */
 close(){
  if(this.closing)return this.closing;this.accepting=false;this.pending?.reject(new EngineError('E_MEDIA_PREVIEW_CLOSED','Preview closed before queued frame execution'));this.pending=undefined;
  this.closing=(async()=>{await this.running;await this.session.close();})();return this.closing;
 }
 /** Terminal interruption uses the existing Session cancellation contract. */
 async cancel(){this.accepting=false;this.pending?.reject(new EngineError('E_MEDIA_PREVIEW_CLOSED','Preview cancelled'));this.pending=undefined;await this.session.cancel();await this.close();}
}
export function openMediaPreview(project:string,options:MediaPreviewOptions){return new MediaPreviewSession(project,options);}
