import {Worker} from 'node:worker_threads';
import {EngineError} from '../core/errors.ts';
import {pixelsFromSurface,type ProfessionalSurface} from './surface.ts';
import type {ProfessionalEncodeOptions,ProfessionalVideoEncoder} from './encoding.ts';

type Report=Awaited<ReturnType<ProfessionalVideoEncoder['finish']>>;
/** Engine-owned CPU output work. GPU owners and authored Stage execution stay
 * on their existing paths; only value-owned pixels cross this Worker boundary. */
export class ProfessionalOutputWorker{
  private worker:Worker;private next=0;private closed=false;private busy=false;
  private exited:Promise<void>;private exitError?:Error;private ended=false;private aborting?:Promise<void>;
  private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private constructor(output:string,options:ProfessionalEncodeOptions,private timeoutMs:number){
    this.worker=new Worker(new URL('./output-worker-bootstrap.mjs',import.meta.url),{
      workerData:{entry:new URL('./output-worker-entry.ts',import.meta.url).href,output,options},
    });
    const fail=(e:Error)=>{this.exitError=e;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();};
    this.worker.on('message',reply=>{
      const p=this.pending.get(reply.id);if(!p)return;
      clearTimeout(p.timer);this.pending.delete(reply.id);
      if(reply.version!==1)p.reject(new EngineError('E_MEDIA_OUTPUT_WORKER','Invalid output response version'));
      else if(reply.ok)p.resolve(reply.result);
      else p.reject(new EngineError(reply.error.code,reply.error.message,{details:reply.error.details}));
    });
    this.worker.on('error',fail);
    this.exited=new Promise(resolve=>this.worker.once('exit',code=>{
      this.ended=true;
      if(code!==0||this.pending.size)fail(new EngineError('E_MEDIA_OUTPUT_WORKER',`Output worker exited (${code})`));resolve();
    }));
  }
  static async create(output:string,options:ProfessionalEncodeOptions,limits:{timeoutMs?:number}={}){
    const worker=new ProfessionalOutputWorker(output,options,limits.timeoutMs??120000);
    try{await worker.request('init');return worker;}catch(error){await worker.abort();throw error;}
  }
  private request(op:string,payload:Record<string,unknown>={},transfer:ArrayBuffer[]=[]):Promise<any>{
    if(this.exitError)return Promise.reject(this.exitError);
    if(this.ended)return Promise.reject(new EngineError('E_MEDIA_ENCODER_CLOSED','Output worker exited'));
    const id=++this.next;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new EngineError('E_MEDIA_OUTPUT_TIMEOUT','Professional output exceeded its configured timeout'));},this.timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.worker.postMessage({version:1,id,op,...payload},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
    });
  }
  async write(surface:ProfessionalSurface):Promise<void>{
    if(this.closed)throw new EngineError('E_MEDIA_ENCODER_CLOSED','Encoder is closed');
    if(this.busy)throw new EngineError('E_MEDIA_ENCODER_BUSY','Await the previous frame write');
    this.busy=true;
    try{
      // pixelsFromSurface returns an owned copy. Transferring it cannot detach
      // the caller's Surface or a sibling output's pixels.
      const pixels=pixelsFromSurface(surface);
      await this.request('write',{surface:{width:surface.width,height:surface.height,format:surface.format,color:surface.color,alpha:surface.alpha},pixels},[pixels.buffer as ArrayBuffer]);
    }finally{this.busy=false;}
  }
  async finish():Promise<Report>{
    if(this.closed)throw new EngineError('E_MEDIA_ENCODER_CLOSED','Encoder is closed');
    if(this.busy)throw new EngineError('E_MEDIA_ENCODER_BUSY','Await frame write');
    this.closed=true;
    try{const result=await this.request('finish');await this.exited;return result;}
    catch(error){await this.abort();throw error;}
  }
  abort():Promise<void>{
    return this.aborting??=(async()=>{
      this.closed=true;if(this.ended)return;
      try{if(!this.exitError)await this.request('abort');}catch{}
      await this.worker.terminate();await this.exited;
    })();
  }
}
