// SPDX-License-Identifier: Apache-2.0
import {instantiateModule,ModuleError,type Session} from './session.mjs';
interface Scope {postMessage(value:unknown,transfer?:Transferable[]):void;close():void;onmessage:((event:MessageEvent)=>Promise<void>)|null}
const scope=globalThis as unknown as Scope;
let session:Session|undefined;
scope.onmessage=async({data})=>{
  const {v,id,method}=data;
  try {
    if(v!==1||!Number.isSafeInteger(id)||id<1)throw new ModuleError('E_WASM_PROTOCOL','Invalid Worker protocol version/request ID');
    if(method==='init'){
      if(session)throw new ModuleError('E_WASM_INIT','Worker already initialized');
      session=await instantiateModule(data.bytes);scope.postMessage({v:1,id,result:true});
    }else if(method==='call'){
      if(!session)throw new ModuleError('E_WASM_INIT','Worker not initialized');
      const result=session.call(data.operation,new Uint8Array(data.input),data.capacity);
      scope.postMessage({v:1,id,result:result.buffer},[result.buffer as ArrayBuffer]);
    }else if(method==='diagnostics'){
      if(!session)throw new ModuleError('E_WASM_INIT','Worker not initialized');
      scope.postMessage({v:1,id,result:session.diagnostics()});
    }else if(method==='dispose'){
      const result=session?.dispose()??{remainingBuffers:0};session=undefined;
      scope.postMessage({v:1,id,result});scope.close();
    }else throw new ModuleError('E_WASM_PROTOCOL',`Unknown Worker method ${method}`);
  }catch(error){const e=error as Error&{code?:string};scope.postMessage({v:1,id,error:{code:e.code??'E_WASM_WORKER',message:e.message}});}
};
