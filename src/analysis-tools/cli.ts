import {resolve,dirname} from 'node:path';
import {stat} from 'node:fs/promises';
import {createAnalysisService} from './service.ts';
import {executeAnalysisTool,type AnalysisToolName} from './tools.ts';
import {toolError} from './paths.ts';

/** Minimal main-CLI integration point; all execution/query logic remains in the shared service. */
export async function analysisCLI(args:string[]) {
  const [name='list',...rest]=args,positionals:string[]=[],flags:Record<string,string|boolean>={};
  const boolean=['json','events'],valued=['project','input','parameters','start','end','fps','width','batch-rows','time','times','from','to','limit','offset','mode','max-gap','output','backend'];
  for(let i=0;i<rest.length;i++){
    const arg=rest[i];if(!arg.startsWith('--')){positionals.push(arg);continue;}const key=arg.slice(2);
    if(Object.hasOwn(flags,key)||![...boolean,...valued].includes(key))toolError('E_ARGUMENT',`Unknown or repeated analyze flag ${arg}`);
    if(boolean.includes(key))flags[key]=true;else{const value=rest[++i];if(value===undefined||value.startsWith('--'))toolError('E_ARGUMENT',`${arg} needs a value`);flags[key]=value;}
  }
  const valid:Record<string,string[]>={list:[],run:['input','parameters','start','end','fps','width','batch-rows','events'],status:[],cancel:[],inspect:['from','to'],sample:['time','from','to','limit','offset','mode','max-gap'],'sample-batch':['times','mode','max-gap'],preview:['time','output','mode','max-gap','backend']};
  if(!Object.hasOwn(valid,name))toolError('E_ARGUMENT',`Unknown analyze operation ${name}`);
  for(const flag of Object.keys(flags))if(!['project','json',...valid[name]].includes(flag))toolError('E_ARGUMENT',`--${flag} is not supported by analyze ${name}`);
  if(positionals.length!==(name==='list'?0:1))toolError('E_ARGUMENT',`analyze ${name} has an invalid positional argument count`);
  const input:Record<string,any>={};
  if(name==='run'){
    input.capabilityId=positionals[0];if(typeof flags.input!=='string')toolError('E_ARGUMENT','analyze run requires --input');input.input=flags.input;
    if(flags.parameters!==undefined)try{input.parameters=JSON.parse(String(flags.parameters));}catch{toolError('E_ARGUMENT','--parameters must be a JSON object');}
    if(input.parameters!==undefined&&(!input.parameters||typeof input.parameters!=='object'||Array.isArray(input.parameters)))toolError('E_ARGUMENT','--parameters must be a JSON object');
    for(const [flag,key]of Object.entries({start:'startSeconds',end:'endSeconds',fps:'sampleRate',width:'analysisWidth','batch-rows':'batchRows'}))if(flags[flag]!==undefined){input.parameters??={};if(Object.hasOwn(input.parameters,key))toolError('E_ARGUMENT',`${key} is supplied twice`);input.parameters[key]=Number(flags[flag]);}
  }else if(name==='status'||name==='cancel')input.jobId=positionals[0];else if(name!=='list')input.artifactId=positionals[0];
  for(const key of ['time','from','to','limit','offset'])if(flags[key]!==undefined)input[key]=Number(flags[key]);
  if(flags.times!==undefined){const parts=String(flags.times).split(',');if(parts.some(p=>!p.trim())||parts.length>1024)toolError('E_ARGUMENT','--times needs 1..1024 comma-separated times');input.times=parts.map(Number);}
  if(flags.backend!==undefined)input.backend=flags.backend;
  if(flags['max-gap']!==undefined)input.maxGapSeconds=Number(flags['max-gap']);if(flags.mode!==undefined)input.mode=flags.mode;if(flags.output!==undefined)input.output=flags.output;
  let project=resolve(String(flags.project??process.cwd()));if(!(await stat(project)).isDirectory())project=dirname(project);
  const service=await createAnalysisService({projectRoot:project}),controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);
  try{return await executeAnalysisTool(service,(name==='sample-batch'?'sampleBatch':name) as AnalysisToolName,input,{signal:controller.signal,onProgress:flags.events?event=>console.error(JSON.stringify(event)):undefined});}
  finally{process.removeListener('SIGINT',cancel);await service.close();}
}
