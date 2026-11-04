import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {EngineError} from '../core/errors.ts';

/** Renderer-owned fixed-operation OCIO process. Not an Analysis scheduler or server. */
export class OcioWorker {
 private child?:ChildProcessWithoutNullStreams;private closed=false;private seq=0;private tail:Promise<unknown>=Promise.resolve();
 private termination?:Promise<void>;private closing?:Promise<void>;private stopping=false;
 private waiting?:{id:number;resolve:(data:string)=>void;reject:(error:Error)=>void};private text='';private stderr='';private starts=0;
 private failure(message:string){
  const e=new EngineError('E_MEDIA_OCIO_WORKER',message),waiting=this.waiting,child=this.child;this.waiting=undefined;this.child=undefined;
  if(child?.pid&&child.exitCode===null&&child.signalCode===null){
   this.stopping=true;
   this.termination=new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new EngineError('E_MEDIA_OCIO_WORKER_CLEANUP','OCIO process did not confirm exit within 5000 ms')),5000);
    child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();
   }).finally(()=>{this.stopping=false;});
  }
  // Callers remove their temporary files after rejection. First confirm native
  // exit, so a cancelled NumPy/OCIO write cannot race that cleanup on Windows.
  (this.termination??Promise.resolve()).then(()=>waiting?.reject(e),cleanup=>waiting?.reject(cleanup));return e;
 }
 private acquire(){
  if(this.closed)throw new EngineError('E_MEDIA_OCIO_WORKER_CLOSED','OCIO worker closed');if(this.child)return this.child;
  const python=process.env.FRAMEWEAVE_MEDIA_PYTHON;if(!python)throw new EngineError('E_MEDIA_OCIO_UNAVAILABLE','Explicit FRAMEWEAVE_MEDIA_PYTHON is required; no runtime downloads');
  const child=spawn(resolve(python),[fileURLToPath(new URL('./ocio_bridge.py',import.meta.url)),'--worker'],{windowsHide:true,stdio:'pipe'});this.child=child;this.starts++;this.text='';this.stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{
   if(this.child!==child)return;this.text+=chunk;if(this.text.length>1024*1024){this.failure('OCIO reply exceeds 1 MiB');return;}
   let at:number;while((at=this.text.indexOf('\n'))>=0){const line=this.text.slice(0,at);this.text=this.text.slice(at+1);try{const reply=JSON.parse(line),w=this.waiting;if(!w||reply.id!==w.id)throw Error('OCIO response identity mismatch');this.waiting=undefined;w.resolve(JSON.stringify(reply.result));}catch(e){this.failure(String(e));}}
  });
  child.stderr.on('data',(s:string)=>{this.stderr=(this.stderr+s).slice(-8192);});
  child.on('error',e=>{if(this.child===child)this.failure(e.message);});child.on('exit',code=>{if(this.child===child)this.failure(`OCIO process exited (${code}): ${this.stderr}`);});return child;
 }
 run(requestFile:string):Promise<string>{
  if(this.closed)return Promise.reject(new EngineError('E_MEDIA_OCIO_WORKER_CLOSED','OCIO worker closed'));
  const job=this.tail.then(async()=>{
   const child=this.acquire(),id=++this.seq;let timer:ReturnType<typeof setTimeout>|undefined;
   try{return await new Promise<string>((resolve,reject)=>{this.waiting={id,resolve,reject};timer=setTimeout(()=>this.failure('OCIO job exceeded 120000 ms'),120000);child.stdin.write(JSON.stringify({id,requestFile})+'\n',e=>{if(e&&this.child===child)this.failure(e.message);});});}finally{if(timer)clearTimeout(timer);}
  });this.tail=job.catch(()=>{});return job;
 }
 status(){return {starts:this.starts,pending:!!this.waiting,running:!!this.child,stopping:this.stopping,closed:this.closed};}
 close():Promise<void>{if(this.closing)return this.closing;this.closed=true;this.failure('OCIO worker closed');this.closing=(async()=>{await this.termination;await this.tail;})();return this.closing;}
}
