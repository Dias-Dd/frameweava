/** Example adapter, not a new engine/plugin ABI. Resource loading uses the existing whitelist. */
export interface GrayscaleResult {pixels:Uint8Array;checksum:number;liveBuffers:number}
export interface CleanupResult {remainingBuffers:number}
export interface GrayscaleClient {
  process(pixels:Uint8Array):Promise<GrayscaleResult>;
  dispose():Promise<CleanupResult>;
}
interface NativeSession {process(pixels:Uint8Array):GrayscaleResult;dispose():CleanupResult}
type GrayscaleGlobal=typeof globalThis&{createFrameWeaveGrayscale:(url:string,length:number)=>Promise<NativeSession>};

export async function createGrayscaleClient(resources:Record<string,string>,byteLength:number,workerMode=false):Promise<GrayscaleClient> {
  if(!workerMode){
    await new Promise<void>((accept,reject)=>{
      const script=document.createElement('script');script.src=resources.wasmGlue;
      script.onload=()=>{script.remove();accept();};script.onerror=()=>{script.remove();reject(Error('WASM glue resource failed to load'));};document.head.append(script);
    });
    const session=await(globalThis as GrayscaleGlobal).createFrameWeaveGrayscale(resources.wasmModule,byteLength);
    return {async process(pixels){return session.process(pixels);},async dispose(){return session.dispose();}};
  }
  const response=await fetch(resources.wasmWorker);
  if(!response.ok)throw Error(`Worker resource unavailable (${response.status})`);
  const url=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));
  let worker:Worker;
  try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
  let sequence=0,disposed=false,cleanup:Promise<CleanupResult>|undefined;
  const pending=new Map<number,{accept:(value:any)=>void;reject:(error:Error)=>void}>();
  const rejectPending=(error:Error)=>{for(const call of pending.values())call.reject(error);pending.clear();};
  worker.onmessage=({data})=>{const call=pending.get(data.id);if(!call)return;pending.delete(data.id);if(data.error)call.reject(Error(data.error));else call.accept(data.result);};
  worker.onerror=event=>{event.preventDefault();rejectPending(Error(event.message||'Grayscale Worker failed'));};
  function call<T>(method:string,data:Record<string,unknown>={},transfer:Transferable[]=[]):Promise<T>{
    if(disposed)return Promise.reject(Error('Grayscale session is disposed'));
    const id=++sequence;
    return new Promise((accept,reject)=>{pending.set(id,{accept,reject});try{worker.postMessage({id,method,...data},transfer);}catch(error){pending.delete(id);reject(error);}});
  }
  function terminate(){disposed=true;worker.terminate();URL.revokeObjectURL(url);rejectPending(Error('Grayscale Worker terminated'));}
  try{await call('init',{glueUrl:resources.wasmGlue,wasmUrl:resources.wasmModule,byteLength});}
  catch(error){terminate();throw error;}
  return {
    async process(pixels){const copy=pixels.slice();const result=await call<Omit<GrayscaleResult,'pixels'>&{pixels:ArrayBuffer}>('process',{pixels:copy.buffer},[copy.buffer]);return {...result,pixels:new Uint8Array(result.pixels)};},
    dispose(){return cleanup??=(async()=>{try{return await call<CleanupResult>('dispose');}finally{terminate();}})();}
  };
}
