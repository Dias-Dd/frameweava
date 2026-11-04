import {diagnostic} from '../core/errors.ts';
import {cliHumanOutput,writeCLIResult} from '../cli-output.ts';
import type {Diagnostic} from '../core/types.ts';

/** ACL-1/2/3 transport envelope. Services still throw EngineError; transports serialize once. */
export type AgentResult<T> =
  | {schemaVersion:1;ok:true;data:T;diagnostics:Diagnostic[]}
  | {schemaVersion:1;ok:false;data:null;diagnostics:Diagnostic[]};
export async function agentResult<T>(operation:()=>Promise<T>):Promise<AgentResult<T>>{
  try{return {schemaVersion:1,ok:true,data:await operation(),diagnostics:[]};}
  catch(error){const d=diagnostic(error);return {schemaVersion:1,ok:false,data:null,diagnostics:[{...d,details:d.details??null}]};}
}
export interface AgentIO {stdout(text:string):void;stderr(text:string):void;setExitCode(code:number):void}
export function emitAgentResult<T>(result:AgentResult<T>,io?:AgentIO){
  const target=io??{stdout:(t:string)=>{process.stdout.write(t);},stderr:(t:string)=>{process.stderr.write(t);},setExitCode:(code:number)=>{process.exitCode=code;}};
  // Explicit AgentIO always retains its original machine transport contract.
  if(!io&&cliHumanOutput())writeCLIResult(result);
  else{target.stdout(JSON.stringify(result)+'\n');if(!result.ok)for(const d of result.diagnostics)target.stderr(`${d.code}: ${d.message}\n`);}
  target.setExitCode(result.ok?0:1);return result;
}
