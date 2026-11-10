import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EngineError} from '../core/errors.ts';
import type {PortType} from '../core/types.ts';

const exec=promisify(execFile);
const engineRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export interface TypecheckRoot {file:string;stageId?:string;exportName?:string}
export interface TypecheckDiagnostic {
  code:'E_TYPECHECK';severity:'error';message:string;tsCode:number;
  file?:string;line?:number;column?:number;stageId?:string;stageIds?:string[];
}
export interface TypecheckOptions {timeoutMs?:number;paths?:Record<string,string[]>}
export type InferredInputTypes=Record<string,PortType|{type:PortType;optional?:boolean}>;
export interface TypecheckResult {contracts:Record<string,InferredInputTypes>;unresolvedContracts:Record<string,string[]>}
interface TypecheckResponse extends TypecheckResult {ok:boolean;code?:'E_TYPECHECK'|'E_COMPILE';diagnostics?:TypecheckDiagnostic[];message?:string}

/** A compulsory build gate for the actual input graph, independent of tsconfig include/exclude. */
export async function typecheckProject(roots:TypecheckRoot[],options:TypecheckOptions={}):Promise<TypecheckResult> {
  const sources=roots.filter(root=>/\.[cm]?[jt]sx?$/i.test(root.file)).map(root=>({...root,file:resolve(root.file)}));
  if(!sources.length)return {contracts:{},unresolvedContracts:{}}; // JSON is validated as a TVG; any native TS/JS entries are checked separately.
  let result:TypecheckResponse;
  try {
    const {stdout}=await exec(process.execPath,[
      join(engineRoot,'src/compiler/typecheck-worker.mjs'),JSON.stringify({engineRoot,roots:sources,managedPaths:options.paths??{}}),
    ],{cwd:engineRoot,timeout:options.timeoutMs??0,maxBuffer:Infinity,windowsHide:true});
    result=JSON.parse(stdout) as TypecheckResponse;
  } catch(error) {
    const failure=error as {killed?:boolean;stderr?:string;message?:string};
    throw new EngineError(failure.killed?'E_TYPECHECK_TIMEOUT':'E_TYPECHECK_WORKER',
      failure.killed?'TypeScript checking exceeded its time limit.':`TypeScript checker failed: ${failure.stderr||failure.message||String(error)}`,
      {hint:'The project must pass the TypeScript gate before evaluation/rendering; check available memory and the reported checker failure.'});
  }
  if(!result.ok) {
    const diagnostics=result.diagnostics??[];
    const first=diagnostics[0];
    const location=first?.file?`${first.file}:${first.line??1}:${first.column??1} `:'';
    const message=first?`${location}TS${first.tsCode}: ${first.message}${diagnostics.length>1?` (${diagnostics.length} errors)`:''}`:result.message??'TypeScript checking failed.';
    throw new EngineError(result.code??'E_TYPECHECK',message,{stageId:first?.stageId,details:{diagnostics},
      hint:'Fix the reported source types. Standard TS/TSX is checked before project execution and native Stage rendering.'});
  }
  return {contracts:result.contracts??{},unresolvedContracts:result.unresolvedContracts??{}};
}
