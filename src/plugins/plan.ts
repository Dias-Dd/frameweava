import type {InputPortTypes,Json,PortRef} from '../core/types.ts';
import type {PluginManifest,PluginUse,PluginPort} from './sdk.ts';
import {parameters,validateUse,plain,fail,parseRef,satisfies} from './schema.ts';
import {v2Parameters} from './parameters-v2.ts';
export interface PipelineMetadata {manifest:PluginManifest;resourceIds:Record<string,string>;dependencies:Record<string,string>;packageRef?:string}
export interface PreparedNode extends PipelineMetadata {use:PluginUse}
export interface PipelineBoundary {id:string;inputs:Record<string,Json|PortRef>;inputTypes?:InputPortTypes}
function validateValues(m:PluginManifest,values:Record<string,unknown>):Record<string,unknown>{
  if(m.parameterSchemaVersion===2)return v2Parameters(m,values,'static');
  for(const [key,schema]of Object.entries(m.parameters))if(schema.required&&!Object.hasOwn(values,key))fail('E_PLUGIN_PARAM',`${m.id}.${key}: required parameter is missing`);
  for(const [key,v]of Object.entries(values)){
    if(!Object.hasOwn(m.parameters,key))fail('E_PLUGIN_PARAM',`${m.id}: unknown ${key}`);
    if(plain(v)&&Object.hasOwn(v,'$keyframes')){
      if(!Array.isArray(v.$keyframes)||!v.$keyframes.length)fail('E_PLUGIN_PARAM','Empty plugin keyframes');
      for(const k of v.$keyframes)parameters(m,{[key]:(k as {value:unknown}).value},true);
    }else if(plain(v)&&(Object.hasOwn(v,'$expr')||Object.hasOwn(v,'$spring'))){if(m.parameters[key].type!=='number')fail('E_PLUGIN_PARAM','Numeric signals need numeric parameters');}
    else parameters(m,{[key]:v},true);
  }
  return values;
}
export function planPipeline(raw:PluginUse[],metadata:(ref:string)=>PipelineMetadata,stage:PipelineBoundary):PreparedNode[]{
const nodes:PreparedNode[]=[];
function expand(use:PluginUse,parents:string[]=[]){
  validateUse(use);if(parents.includes(use.plugin))fail('E_PLUGIN_CYCLE',`Preset cycle: ${[...parents,use.plugin].join(' -> ')}`);if(parents.length>8)fail('E_PLUGIN_BUDGET','Preset depth exceeds 8');
  const meta=metadata(use.plugin),m=meta.manifest;
  const validatedParams=validateValues(m,use.params??{});
  if(m.parameterSchemaVersion===2)use={...use,params:validatedParams};
  if(m.kind==='preset'){
    const first=nodes.length;
    const defaults=Object.fromEntries(Object.entries(m.parameters).filter(([,p])=>Object.hasOwn(p,'default')).map(([k,p])=>[k,p.default])),params=m.parameterSchemaVersion===2?validatedParams:{...defaults,...use.params};
    for(const key of Object.keys(params))if(!Object.hasOwn(m.parameters,key))fail('E_PLUGIN_PARAM',`Unknown preset parameter ${key}`);
    const substitute=(v:unknown):unknown=>{
      if(plain(v)&&Object.hasOwn(v,'$param')){if(typeof v.$param!=='string'||Object.keys(v).length!==1||!Object.hasOwn(params,v.$param))fail('E_PLUGIN_PARAM',`${m.id}: invalid preset parameter reference`);return params[v.$param];}
      return Array.isArray(v)?v.map(substitute):plain(v)?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,substitute(x)])):v;
    };
    if(use.inputs)fail('E_PLUGIN_PIPELINE','Preset input remapping belongs on its first concrete step');
    for(const [i,child]of m.pipeline!.entries()){
      const p=parseRef(child.plugin),range=m.dependencies?.[p.id];if(!range||!satisfies(p.version,range)||meta.dependencies[p.id]!==child.plugin)fail('E_PLUGIN_DEPENDENCY',`${m.id} must lock its actual preset dependency ${child.plugin}`);
      expand({...child,params:substitute(child.params??{}) as Record<string,unknown>,...(use.as&&i===m.pipeline!.length-1?{as:use.as}:{})},[...parents,use.plugin]);
    }
    const ports={...m.inputs},produced=new Set<string>(),named:Record<string,Record<string,PluginPort>>={};
    for(let i=first;i<nodes.length;i++){
      const child=nodes[i];
      for(const [port,type]of Object.entries(child.manifest.inputs)){
        const binding=child.use.inputs?.[port]?.split('.'),actual=binding?named[binding[0]]?.[binding[1]]:ports[port];
        if(actual!==type&&!(type==='json'&&actual&&actual!=='image'))fail('E_PLUGIN_IO',`${m.id} preset input contract disagrees at ${child.manifest.id}.${port}`);
      }
      named[child.use.as??`step${i}`]=child.manifest.outputs;
      for(const [port,type]of Object.entries(child.manifest.outputs)){ports[port]=type;produced.add(port);}
    }
    for(const [port,type]of Object.entries(m.outputs))if(ports[port]!==type)fail('E_PLUGIN_IO',`${m.id} preset output ${port} disagrees with expansion`);
    for(const port of produced)if(!Object.hasOwn(m.outputs,port))fail('E_PLUGIN_IO',`${m.id} must declare produced output ${port}`);
    return;
  }
  if(nodes.length>=16)fail('E_PLUGIN_BUDGET','A Stage pipeline is limited to 16 concrete steps');
  nodes.push({use,...meta});
}
raw.forEach(use=>expand(use as PluginUse));
const current:Record<string,PluginPort>={},named:Record<string,Record<string,PluginPort>>={stage:current},aliases=new Set(['stage']);
stage.inputTypes??={};
for(const name of Object.keys(stage.inputs)){
  const contract=stage.inputTypes[name];if(!contract)fail('E_INPUT_SCHEMA',`Plugin Stage ${stage.id}: declare inputTypes.${name}`);
  const type=typeof contract==='string'?contract:contract.type;
  if(type==='audio')fail('E_PLUGIN_IO','P4 visual pipelines do not implement audio ports; use an Audio Stage');
  current[name]=type==='surface'?'image':type;
}
for(const [index,node]of nodes.entries()){
  const m=node.manifest,bindings=node.use.inputs??{};
  for(const port of Object.keys(bindings))if(!Object.hasOwn(m.inputs,port))fail('E_PLUGIN_IO',`${m.id} has no input ${port}`);
  for(const [port,expected]of Object.entries(m.inputs)){
    const ref=bindings[port],parts=ref?.split('.'),actual=parts?named[parts[0]]?.[parts[1]]:current[port];
    if(!actual||expected!==actual&&!(expected==='json'&&actual!=='image'))fail('E_PLUGIN_IO',`${stage.id}/${m.id}.${port}: expected ${expected}, received ${actual??'missing'}`);
  }
  if(m.temporal&&(!nodes.slice(0,index).some(n=>n.manifest.kind==='generator')||Object.values(stage.inputTypes).some(s=>(typeof s==='string'?s:s.type)==='surface')))fail('E_PLUGIN_TEMPORAL','Temporal resampling requires a Stage-local upstream generator, without external frozen surfaces');
  const alias=node.use.as??`step${index}`;if(aliases.has(alias))fail('E_PLUGIN_PIPELINE',`Duplicate step alias ${alias}`);aliases.add(alias);named[alias]={...m.outputs};Object.assign(current,m.outputs);
}
if(current.image!=='image')fail('E_PLUGIN_IO',`${stage.id} pipeline must produce image output`);
  return nodes;
}
