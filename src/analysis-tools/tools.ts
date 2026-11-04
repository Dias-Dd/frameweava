import type {AnalysisService} from './service.ts';
import type {AnalysisToolEvent} from './types.ts';
import {toolError} from './paths.ts';

const fields={list:[],run:['capabilityId','input','parameters'],status:['jobId'],cancel:['jobId'],inspect:['artifactId','from','to'],sample:['artifactId','time','from','to','limit','offset','mode','maxGapSeconds'],sampleBatch:['artifactId','times','mode','maxGapSeconds'],preview:['artifactId','time','output','mode','maxGapSeconds','backend']} as const;
export type AnalysisToolName=keyof typeof fields;
const property=(name:string):Record<string,unknown>=>name==='times'?{type:'array',items:{type:'number'},minItems:1,maxItems:1024}:name==='backend'?{type:'string',enum:['node','renderer']}:['time','from','to','maxGapSeconds'].includes(name)?{type:'number'}:['limit','offset'].includes(name)?{type:'integer',minimum:name==='limit'?1:0,maximum:name==='limit'?128:600}:name==='parameters'?{type:'object'}:name==='mode'?{type:'string',enum:['linear','nearest']}:{type:'string',minLength:1};
const required:Record<AnalysisToolName,string[]>={list:[],run:['capabilityId','input'],status:['jobId'],cancel:['jobId'],inspect:['artifactId'],sample:['artifactId'],sampleBatch:['artifactId','times'],preview:['artifactId','time','output']};
/** Declarative adapters for ACL-1/3 or future MCP. These are not a server or an execution registry. */
export const analysisToolDefinitions=Object.entries(fields).map(([name,names])=>({name:`frameweave.analysis.${name}`,serviceMethod:name,inputSchema:{type:'object',properties:Object.fromEntries(names.map(n=>[n,property(n)])),required:required[name as AnalysisToolName],additionalProperties:false,...name==='sample'?{oneOf:[{required:['time'],not:{anyOf:[{required:['from']},{required:['to']},{required:['limit']},{required:['offset']}]}},{required:['from','to'],not:{required:['time']}}]}:{}},lifecycle:name==='run'?'foreground-wait':name==='status'?'live-service-or-terminal-receipt':name==='cancel'?'live-service-only':'bounded-query'}));
export async function executeAnalysisTool(service:AnalysisService,name:AnalysisToolName,input:Record<string,any>,options:{signal?:AbortSignal;onProgress?:(event:AnalysisToolEvent)=>void}={}) {
  if(!Object.hasOwn(fields,name)||!input||typeof input!=='object'||Array.isArray(input))toolError('E_ARGUMENT','Invalid analysis tool request');
  const allowed:readonly string[]=fields[name];for(const key of Object.keys(input))if(!allowed.includes(key))toolError('E_ARGUMENT',`Unknown ${name} argument ${key}`);
  for(const key of required[name])if(input[key]===undefined)toolError('E_ARGUMENT',`${name} requires ${key}`);
  for(const key of Object.keys(input)){
    if(['time','from','to','maxGapSeconds','limit','offset'].includes(key)){if(typeof input[key]!=='number'||!Number.isFinite(input[key]))toolError('E_ARGUMENT',`${key} must be a finite number`);}
    else if(key==='times'){if(!Array.isArray(input[key])||input[key].some((t:unknown)=>typeof t!=='number'||!Number.isFinite(t)))toolError('E_ARGUMENT','times must contain finite numbers');}
    else if(key==='parameters'){if(!input[key]||typeof input[key]!=='object'||Array.isArray(input[key]))toolError('E_ARGUMENT','parameters must be an object');}
    else if(typeof input[key]!=='string'||!input[key])toolError('E_ARGUMENT',`${key} must be a nonempty string`);
  }
  const {artifactId,...query}=input;let value:any;
  switch(name){
    case 'list':value=await service.list();break;
    case 'run':value=await service.run(input as any,options);break;
    case 'status':value={job:await service.status(input.jobId)};break;
    case 'cancel':value=await service.cancel(input.jobId);break;
    case 'inspect':value=await service.inspect(artifactId,query);break;
    case 'sample':value=await service.sample(artifactId,query);break;
    case 'sampleBatch':value=await service.sampleBatch(artifactId,query as any,{signal:options.signal});break;
    case 'preview':value=await service.preview(artifactId,input.time,input.output,{mode:input.mode,maxGapSeconds:input.maxGapSeconds,backend:input.backend});break;
  }
  return {ok:true,schemaVersion:1,operation:`analysis.${name}`,...value,diagnostics:value.diagnostics??[]};
}
