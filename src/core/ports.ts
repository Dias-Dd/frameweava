import {isProfessionalSurface,assertProfessionalSurface} from '../media/surface.ts';
import {isAudioBlock,isAudioDescriptor,assertAudioBlock} from '../audio/block.ts';
import type { Diagnostic, PortRef, PortType, StageSpec, Surface } from './types.js';
import { EngineError, diagnostic } from './errors.js';

export interface InputValidationOptions { allowUnresolvedInputContracts?:boolean; frame?:number }
export interface NormalizedInputPort { type:PortType; optional:boolean }
type InputStage=Pick<StageSpec,'id'|'inputs'|'inputTypes'>;
const portTypes:readonly string[]=['surface','audio','number','string','boolean','json'];
const own=(object:object,key:string)=>Object.prototype.hasOwnProperty.call(object,key);
const plain=(value:unknown):value is Record<string,unknown>=>Boolean(value && typeof value==='object' && !Array.isArray(value) && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null));
const reference=(value:unknown):value is PortRef=>plain(value) && typeof value.$ref==='string' && typeof value.port==='string';

/** Normalize a wire descriptor without casting arbitrary values into a schema. */
export function normalizeInputPort(schema:unknown):NormalizedInputPort {
  if(typeof schema==='string' && portTypes.includes(schema))return {type:schema as PortType,optional:false};
  if(!plain(schema) || typeof schema.type!=='string' || !portTypes.includes(schema.type) ||
    own(schema,'optional') && typeof schema.optional!=='boolean' || Object.keys(schema).some(key=>key!=='type' && key!=='optional'))
    throw new EngineError('E_INPUT_SCHEMA','An input contract must be a port type or {type: portType, optional?: boolean}.');
  return {type:schema.type as PortType,optional:schema.optional===true};
}

/** Producer promises must fit the consumer's executable coarse contract. */
export function inputTypeAccepts(expected:PortType,producer:PortType):boolean {
  return expected===producer || expected==='json' && ['number','string','boolean','json'].includes(producer);
}

function finiteJson(value:unknown,ancestors=new Set<object>(),depth=0):boolean {
  if(value===null || typeof value==='string' || typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(depth>96 || !value || typeof value!=='object' || ancestors.has(value) || !Array.isArray(value) && !plain(value))return false;
  ancestors.add(value);
  const valid=Object.values(value).every(child=>finiteJson(child,ancestors,depth+1));
  ancestors.delete(value);return valid;
}
function surface(value:unknown):value is Surface {
  return plain(value) && value.kind==='surface' && value.format==='png' && Number.isInteger(value.width) && Number(value.width)>0 &&
    Number.isInteger(value.height) && Number(value.height)>0 && typeof value.dataUrl==='string' && value.dataUrl.startsWith('data:image/png;base64,') && finiteJson(value);
}
/** JSON-shaped Surface descriptors remain a distinct port category. No coercion. */
export function inputValueMatches(type:PortType,value:unknown):boolean {
  if(type==='audio'){if(!isAudioBlock(value))return false;try{assertAudioBlock(value);return true;}catch{return false;}}
  if(type==='surface'){if(isProfessionalSurface(value)){try{assertProfessionalSurface(value);return true;}catch{return false;}}return surface(value);}
  if(type==='json')return !(plain(value) && value.kind==='surface')&&!isAudioDescriptor(value)&&finiteJson(value);
  if(type==='number')return typeof value==='number' && Number.isFinite(value);
  return typeof value===type;
}
function actualType(value:unknown):string {
  if(isAudioBlock(value))return 'audio';
  if(plain(value) && value.kind==='surface')return 'surface';
  if(value===null)return 'null';
  if(Array.isArray(value))return 'array';
  return typeof value;
}

/** Validate binding/schema shape and literal values; refs are checked against producer types by TVG validation. */
export function validateInputSchema(stage:InputStage,options:InputValidationOptions={}):Diagnostic[] {
  const issues:Diagnostic[]=[];
  const context={stageId:stage.id,...(options.frame===undefined?{}:{frame:options.frame})};
  const fail=(code:string,message:string,details?:unknown)=>issues.push({code,severity:'error',message,...context,...(details===undefined?{}:{details})});
  if(!plain(stage.inputs)){fail('E_INPUT_SCHEMA',`Stage '${stage.id}' input bindings must be a plain object.`);return issues;}
  const names=Object.keys(stage.inputs);
  if(stage.inputTypes===undefined){
    if(names.length && !options.allowUnresolvedInputContracts)fail('E_INPUT_SCHEMA',`Stage '${stage.id}' requires an inputTypes contract for every bound input.`,{inputs:names});
    return issues;
  }
  if(!plain(stage.inputTypes)){fail('E_INPUT_SCHEMA',`Stage '${stage.id}' inputTypes must be a plain object.`);return issues;}
  const normalized=new Map<string,NormalizedInputPort>();
  for(const [name,schema]of Object.entries(stage.inputTypes)){
    if(!name){fail('E_INPUT_SCHEMA',`Stage '${stage.id}' has an empty input contract name.`);continue;}
    try{normalized.set(name,normalizeInputPort(schema));}
    catch(error){issues.push({...diagnostic(error),...context,details:{input:name}});}
  }
  for(const name of names){
    if(!name || !own(stage.inputTypes,name)){fail('E_INPUT_SCHEMA',`Stage '${stage.id}' bound input '${name}' has no declared consumer contract.`,{input:name});continue;}
    const contract=normalized.get(name),value=stage.inputs[name];
    if(contract && !reference(value) && !inputValueMatches(contract.type,value))
      fail('E_INPUT_TYPE',`Stage '${stage.id}' input '${name}' expects ${contract.type}; received ${actualType(value)}.`,{input:name,expected:contract.type,actual:actualType(value)});
  }
  for(const [name,contract]of normalized)if(!contract.optional && !own(stage.inputs,name))
    fail('E_INPUT_MISSING',`Stage '${stage.id}' required input '${name}' has no binding.`,{input:name,expected:contract.type});
  return issues;
}

/** Backstop for resolved values, including cache hits. Values are checked before cloning or user rendering. */
export function assertStageInputs(stage:InputStage,inputs:Record<string,unknown>,context:{frame?:number}={}):void {
  const issues=validateInputSchema(stage,context);
  if(issues.length){const first=issues[0];throw new EngineError(first.code,first.message,{stageId:stage.id,...context,details:issues});}
  if(!plain(inputs))throw new EngineError('E_INPUT_SCHEMA',`Stage '${stage.id}' resolved inputs must be a plain object.`,{stageId:stage.id,...context});
  const schemas=stage.inputTypes ?? {};
  for(const name of Object.keys(inputs))if(!own(schemas,name))
    throw new EngineError('E_INPUT_SCHEMA',`Stage '${stage.id}' received undeclared input '${name}'.`,{stageId:stage.id,...context,details:{input:name}});
  for(const [name,schema]of Object.entries(schemas)){
    const contract=normalizeInputPort(schema);
    if(!own(inputs,name)){
      if(contract.optional)continue;
      throw new EngineError('E_INPUT_MISSING',`Stage '${stage.id}' required input '${name}' is unavailable.`,{stageId:stage.id,...context,details:{input:name}});
    }
    if(!inputValueMatches(contract.type,inputs[name]))
      throw new EngineError('E_INPUT_TYPE',`Stage '${stage.id}' input '${name}' expects ${contract.type}; received ${actualType(inputs[name])}.`,{stageId:stage.id,...context,details:{input:name,expected:contract.type,actual:actualType(inputs[name])}});
  }
}
