import {EngineError} from '../core/errors.ts';
import {validateKeyframes,spring} from '../core/animation.ts';
import {checkSignals} from '../core/graph.ts';
import {plain,fields} from './schema.ts';
import type {ParameterV2,ParameterValue,PluginManifestV2} from './sdk.ts';

export const PARAMETER_LIMITS={depth:16,arrayLength:1024,properties:256,nodes:8192,stringLength:65536} as const;
const missing=Symbol('missing parameter');
type Mode='static'|'resolved';
interface Budget {nodes:number;active:Set<object>}
const budget=():Budget=>({nodes:0,active:new Set()});
function fail(code:string,path:string,message:string):never{throw new EngineError(code,`${path}: ${message}`);}
function enter(value:object,depth:number,b:Budget,path:string){
  if(depth>PARAMETER_LIMITS.depth||++b.nodes>PARAMETER_LIMITS.nodes)fail('E_PLUGIN_PARAM_BUDGET',path,'parameter depth/node budget exceeded');
  if(b.active.has(value))fail('E_PLUGIN_PARAM_BUDGET',path,'cyclic parameter data');b.active.add(value);
}
/** Bound arbitrary authored/default data before delegating signal syntax to the existing core. */
function bounded(value:unknown,path:string,depth=0,b=budget()):void {
  if(depth>PARAMETER_LIMITS.depth+8||++b.nodes>PARAMETER_LIMITS.nodes)fail('E_PLUGIN_PARAM_BUDGET',path,'parameter depth/node budget exceeded');
  if(typeof value==='string'&&value.length>PARAMETER_LIMITS.stringLength)fail('E_PLUGIN_PARAM_BUDGET',path,'string exceeds 65536 UTF-16 code units');
  if(!value||typeof value!=='object')return;
  if(b.active.has(value))fail('E_PLUGIN_PARAM_BUDGET',path,'cyclic parameter data');b.active.add(value);
  if(Array.isArray(value)){
    if(value.length>PARAMETER_LIMITS.arrayLength)fail('E_PLUGIN_PARAM_BUDGET',path,'array exceeds 1024 entries');
    for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i))fail('E_PLUGIN_PARAM',`${path}[${i}]`,'sparse arrays are unsupported');bounded(value[i],`${path}[${i}]`,depth+1,b);}
  }else{
    if(!plain(value))fail('E_PLUGIN_PARAM',path,'expected plain JSON data');
    const entries=Object.entries(value);if(entries.length>PARAMETER_LIMITS.properties)fail('E_PLUGIN_PARAM_BUDGET',path,'object exceeds 256 properties');
    for(const [key,item]of entries)bounded(item,`${path}.${key}`,depth+1,b);
  }
  b.active.delete(value);
}
function scalar(schema:Exclude<ParameterV2,{type:'object'|'array'}>,value:unknown,path:string):number|string|boolean {
  if(typeof value!==schema.type||value===null)fail('E_PLUGIN_PARAM',path,`expected ${schema.type}`);
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail('E_PLUGIN_PARAM',path,'expected a finite number');
    if(schema.type==='number'&&(schema.integer&&!Number.isInteger(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum))fail('E_PLUGIN_PARAM',path,'number violates integer/range constraint');
  }
  if(typeof value==='string'&&schema.type==='string'&&(schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength))fail('E_PLUGIN_PARAM',path,'string length constraint failed');
  if(schema.enum&&!schema.enum.some(item=>item===value))fail('E_PLUGIN_PARAM',path,'value is not in enum');
  return value as number|string|boolean;
}
function isRequired(schema:ParameterV2):boolean{return !Object.hasOwn(schema,'default')&&!(schema.type!=='object'&&schema.required===false);}
function node(schema:ParameterV2,input:unknown,path:string,mode:Mode,required:boolean,depth:number,b:Budget):unknown {
  let value=input;
  if(value===missing){
    if(Object.hasOwn(schema,'default'))value=schema.default;
    else if(required)fail('E_PLUGIN_PARAM',path,'required parameter is missing');else return missing;
  }
  if(depth>PARAMETER_LIMITS.depth||++b.nodes>PARAMETER_LIMITS.nodes)fail('E_PLUGIN_PARAM_BUDGET',path,'expanded parameter depth/node budget exceeded');
  if(plain(value)&&['$keyframes','$expr','$spring'].some(key=>Object.hasOwn(value,key))){
    if(mode!=='static'||schema.type==='object'||schema.type==='array'||schema.type==='boolean')fail('E_PLUGIN_PARAM',path,'animation is allowed only at number/string leaves');
    const signalFields=Object.hasOwn(value,'$expr')?['$expr','args']:Object.hasOwn(value,'$keyframes')?['$keyframes']:['$spring'];
    if(Object.keys(value).some(key=>!signalFields.includes(key)))fail('E_PLUGIN_PARAM',path,'unexpected signal wrapper field');
    checkSignals(value);
    if(Object.hasOwn(value,'$keyframes')){
      validateKeyframes(value.$keyframes);for(const key of value.$keyframes)scalar(schema,key.value,path);
    }else{
      if(schema.type!=='number')fail('E_PLUGIN_PARAM',path,'expressions and springs require number leaves');
      if(Object.hasOwn(value,'$spring')){
        if(!plain(value.$spring)||typeof value.$spring.from!=='number'||typeof value.$spring.to!=='number')fail('E_PLUGIN_PARAM',path,'spring needs numeric from/to');
        spring({from:value.$spring.from,to:value.$spring.to});
        scalar(schema,value.$spring.from,path);scalar(schema,value.$spring.to,path);
      }
    }
    return value;
  }
  if(schema.type==='object'){
    if(!plain(value))fail('E_PLUGIN_PARAM',path,'expected object');
    for(const key of Object.keys(value))if(!Object.hasOwn(schema.properties,key))fail('E_PLUGIN_PARAM',`${path}.${key}`,'unknown field');
    const entries:[string,unknown][]=[];
    for(const [key,child]of Object.entries(schema.properties)){
      const needed=schema.required?.includes(key)||child.type!=='object'&&child.required===true;
      const result=node(child,Object.hasOwn(value,key)?value[key]:missing,`${path}.${key}`,mode,!!needed,depth+1,b);
      if(result!==missing)entries.push([key,result]);
    }
    return Object.fromEntries(entries);
  }
  if(schema.type==='array'){
    if(!Array.isArray(value))fail('E_PLUGIN_PARAM',path,'expected array');
    if(value.length>PARAMETER_LIMITS.arrayLength||value.length<(schema.minItems??0)||value.length>(schema.maxItems??PARAMETER_LIMITS.arrayLength))fail('E_PLUGIN_PARAM',path,'array length constraint failed');
    return value.map((item,index)=>node(schema.items,item,`${path}[${index}]`,mode,true,depth+1,b));
  }
  return scalar(schema,value,path);
}
function definition(raw:unknown,path:string,depth:number,b:Budget):asserts raw is ParameterV2 {
  if(!plain(raw))fail('E_PLUGIN_SCHEMA',path,'expected parameter schema');enter(raw,depth,b,path);
  const common=['type','default'];
  if(raw.type==='object'){
    fields(raw,[...common,'properties','required','additionalProperties'],path);
    if(!plain(raw.properties)||Object.keys(raw.properties).length>PARAMETER_LIMITS.properties)fail('E_PLUGIN_SCHEMA',path,'object requires at most 256 declared properties');
    if(raw.additionalProperties!==undefined&&raw.additionalProperties!==false)fail('E_PLUGIN_SCHEMA',path,'unknown fields are always rejected');
    if(raw.required!==undefined&&(!Array.isArray(raw.required)||raw.required.length>PARAMETER_LIMITS.properties||!raw.required.every(key=>typeof key==='string'&&plain(raw.properties)&&Object.hasOwn(raw.properties,key))||new Set(raw.required).size!==raw.required.length))fail('E_PLUGIN_SCHEMA',path,'required must list unique declared property names');
    for(const [key,child]of Object.entries(raw.properties)){if(!/^[A-Za-z]\w*$/.test(key))fail('E_PLUGIN_SCHEMA',path,'invalid property name');definition(child,`${path}.${key}`,depth+1,b);}
  }else if(raw.type==='array'){
    fields(raw,[...common,'items','minItems','maxItems','required'],path);
    for(const key of ['minItems','maxItems'])if(raw[key]!==undefined&&(!Number.isSafeInteger(raw[key])||Number(raw[key])<0||Number(raw[key])>PARAMETER_LIMITS.arrayLength))fail('E_PLUGIN_SCHEMA',path,`${key} must be 0–1024`);
    if(Number(raw.minItems??0)>Number(raw.maxItems??PARAMETER_LIMITS.arrayLength))fail('E_PLUGIN_SCHEMA',path,'inverted array length limits');
    definition(raw.items,`${path}[]`,depth+1,b);
  }else{
    const allowed=raw.type==='number'?['minimum','maximum','integer']:raw.type==='string'?['minLength','maxLength']:[];
    fields(raw,[...common,...allowed,'enum','required'],path);
    if(!['number','string','boolean'].includes(String(raw.type)))fail('E_PLUGIN_SCHEMA',path,'unknown parameter type');
    if(raw.type==='number'){
      for(const key of ['minimum','maximum'])if(raw[key]!==undefined&&(typeof raw[key]!=='number'||!Number.isFinite(raw[key])))fail('E_PLUGIN_SCHEMA',path,`invalid ${key}`);
      if(Number(raw.minimum??-Infinity)>Number(raw.maximum??Infinity)||raw.integer!==undefined&&typeof raw.integer!=='boolean')fail('E_PLUGIN_SCHEMA',path,'invalid numeric constraints');
    }
    if(raw.type==='string'){
      for(const key of ['minLength','maxLength'])if(raw[key]!==undefined&&(!Number.isSafeInteger(raw[key])||Number(raw[key])<0||Number(raw[key])>PARAMETER_LIMITS.stringLength))fail('E_PLUGIN_SCHEMA',path,`invalid ${key}`);
      if(Number(raw.minLength??0)>Number(raw.maxLength??PARAMETER_LIMITS.stringLength))fail('E_PLUGIN_SCHEMA',path,'inverted string length limits');
    }
    if(raw.enum!==undefined&&(!Array.isArray(raw.enum)||!raw.enum.length||raw.enum.length>PARAMETER_LIMITS.arrayLength||!raw.enum.every(v=>typeof v===raw.type&&(typeof v!=='number'||Number.isFinite(v))&&(typeof v!=='string'||v.length<=PARAMETER_LIMITS.stringLength))))fail('E_PLUGIN_SCHEMA',path,'invalid scalar enum');
  }
  if(raw.type!=='object'){
    if(raw.required!==undefined&&typeof raw.required!=='boolean')fail('E_PLUGIN_SCHEMA',path,'required must be boolean');
    if(raw.required===true&&Object.hasOwn(raw,'default'))fail('E_PLUGIN_SCHEMA',path,'required:true cannot also declare a default');
  }
  if(Object.hasOwn(raw,'default')){
    bounded(raw.default,`${path}.default`);
    node(raw as ParameterV2,raw.default,`${path}.default`,'resolved',true,depth,budget());
  }
  b.active.delete(raw);
}
export function validateV2Definitions(value:unknown):asserts value is Record<string,ParameterV2>{
  if(!plain(value)||Object.keys(value).length>PARAMETER_LIMITS.properties)fail('E_PLUGIN_SCHEMA','parameters','expected at most 256 parameter schemas');
  const b=budget();for(const [name,raw]of Object.entries(value)){if(!/^[A-Za-z]\w*$/.test(name))fail('E_PLUGIN_SCHEMA',name,'invalid parameter name');definition(raw,name,0,b);}
}
export function v2Parameters(manifest:PluginManifestV2,values:Record<string,unknown>,mode:'resolved'):Record<string,ParameterValue>;
export function v2Parameters(manifest:PluginManifestV2,values:Record<string,unknown>,mode:'static'):Record<string,unknown>;
export function v2Parameters(manifest:PluginManifestV2,values:Record<string,unknown>,mode:Mode):Record<string,unknown>{
  bounded(values,manifest.id,-1);if(!plain(values))fail('E_PLUGIN_PARAM',manifest.id,'parameters must be an object');
  for(const key of Object.keys(values))if(!Object.hasOwn(manifest.parameters,key))fail('E_PLUGIN_PARAM',`${manifest.id}.${key}`,'unknown parameter');
  const entries:[string,unknown][]=[],b=budget();
  for(const [key,schema]of Object.entries(manifest.parameters)){
    const result=node(schema,Object.hasOwn(values,key)?values[key]:missing,`${manifest.id}.${key}`,mode,isRequired(schema),0,b);
    if(result!==missing)entries.push([key,result]);
  }
  return Object.fromEntries(entries);
}
