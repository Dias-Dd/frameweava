import {EngineError} from '../core/errors.ts';
import {agentResult,emitAgentResult,type AgentIO} from '../agent/result.ts';
import {searchCapabilities,inspectCapability,capabilityExamples} from './service.ts';
import type {CapabilityQuery,CapabilitySearch} from './types.ts';

/** Standalone wiring for CLI/MCP integration; this function has no console/process side effects. */
export async function capabilitiesCLI(args:string[]){return agentResult(async()=>{
  const [command,...rest]=args,positionals:string[]=[],flags:Record<string,string>={},catalogs:string[]=[];
  if(!['search','inspect','examples'].includes(command))throw new EngineError('E_ARGUMENT','capabilities search <query> | inspect <id@version> | examples <id@version> [--json]');
  const allowed=command==='search'?['project','catalog','platform','mode','limit','offset','kind','engine','input','output','compatible']:command==='examples'?['project','catalog','platform','integrity','limit']:['project','catalog','platform','integrity'];
  for(let i=0;i<rest.length;i++){
    const arg=rest[i];if(!arg.startsWith('--')){positionals.push(arg);continue;}const key=arg.slice(2);
    if(key==='json'||command==='search'&&['offline','include-low-level'].includes(key)){if(flags[key]!==undefined)throw new EngineError('E_ARGUMENT',`Duplicate --${key}`);flags[key]='true';continue;}
    if(!allowed.includes(key)||!rest[i+1]||rest[i+1].startsWith('--')||key!=='catalog'&&flags[key]!==undefined)throw new EngineError('E_ARGUMENT',`Invalid capabilities option ${arg}`);
    const value=rest[++i];if(key==='catalog')catalogs.push(value);else flags[key]=value;
  }
  if(positionals.length!==1)throw new EngineError('E_ARGUMENT',`${command} requires one quoted query or exact id@version`);
  let limit:number|undefined;if(flags.limit!==undefined){if(!/^\d+$/.test(flags.limit))throw new EngineError('E_ARGUMENT','limit must be an integer');limit=Number(flags.limit);}
  const options:CapabilityQuery={project:flags.project,catalogs,platform:flags.platform as CapabilityQuery['platform'],expectedIntegrity:flags.integrity};
  if(command==='inspect')return inspectCapability(positionals[0],options);
  if(command==='examples')return capabilityExamples(positionals[0],{...options,limit});
  const filters=Object.fromEntries(['kind','engine','input','output','compatible'].filter(k=>flags[k]!==undefined).map(k=>[k,flags[k]])) as CapabilitySearch['filters'];
  if(flags.offset!==undefined&&!/^\d+$/.test(flags.offset))throw new EngineError('E_ARGUMENT','offset must be a nonnegative integer');
  return searchCapabilities({...options,query:positionals[0],mode:flags.mode as CapabilitySearch['mode'],limit,offset:flags.offset===undefined?undefined:Number(flags.offset),filters,includeLowLevel:flags['include-low-level']==='true'});
});}
export async function runCapabilitiesCLI(args:string[],io?:AgentIO){return emitAgentResult(await capabilitiesCLI(args),io);}
