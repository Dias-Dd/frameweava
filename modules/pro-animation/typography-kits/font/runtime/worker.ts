// SPDX-License-Identifier: Apache-2.0
import {createBinding} from '../dist/binding.mjs';
import {createSession,BindgenError,type Session} from './session.mjs';
import {cloneData} from './wire.ts';
interface Scope {postMessage(data:unknown,transfer?:Transferable[]):void;close():void;onmessage:((event:MessageEvent)=>Promise<void>)|null}
const scope=globalThis as unknown as Scope;let session:Session|undefined,initializationMs=0;
scope.onmessage=async({data})=>{
  const {v,id,method}=data;
  try{
    if(v!==1||!Number.isSafeInteger(id)||id<1)throw new BindgenError('E_BINDGEN_PROTOCOL','Unsupported Worker protocol');
    if(method==='init'){
      if(session)throw new BindgenError('E_BINDGEN_INIT','Already initialized');
      const start=performance.now();session=await createSession(data.bytes,data.profile,createBinding);initializationMs=performance.now()-start;
      scope.postMessage({v:1,id,result:true});
    }else if(method==='invoke'){
      if(!session)throw new BindgenError('E_BINDGEN_INIT','Not initialized');
      const result=session.invoke(data.name,data.args),transfer:ArrayBuffer[]=[];scope.postMessage({v:1,id,result:cloneData(result,transfer)},transfer);
    }else if(method==='diagnostics')scope.postMessage({v:1,id,result:{...session?.diagnostics(),initializationMs}});
    else if(method==='dispose'){const result=session?.dispose()??{remainingSessions:0};session=undefined;scope.postMessage({v:1,id,result});scope.close();}
    else throw new BindgenError('E_BINDGEN_PROTOCOL','Unknown Worker method');
  }catch(error){const e=error as Error&{code?:string};scope.postMessage({v:1,id,error:{code:e.code??'E_BINDGEN_WORKER',message:String(e.message??error)}});}
};
