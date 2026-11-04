import {diagnostic,EngineError} from '../../src/core/errors.ts';
import {validateTVG,isPortRef} from '../../src/core/graph.ts';
import {normalizeInputPort,inputTypeAccepts} from '../../src/core/ports.ts';
import type {Diagnostic,StageSpec,TVG} from '../../src/core/types.ts';
import {CONFIG} from '../../src/shared-state/protocol.ts';
import {isStageInput} from './composite-types.ts';

/** Validate each local DAG with the existing validator. Virtual boundary nodes
 * exist only during validation, never as executable or published Stages. */
export function validateComposites(tvg:TVG,options:{allowUnresolvedInputContracts?:boolean}):Diagnostic[]{
 const issues:Diagnostic[]=[],todo=tvg.stages.map(stage=>({stage,path:[stage.id]}));
 while(todo.length){const {stage,path}=todo.pop()!,c=stage.composition;if(!c)continue;
  const fail=(message:string,code='E_STAGE_COMPOSITION')=>{throw new EngineError(code,message,{stageId:stage.id,details:{path}});};
  try{
   if(c.version!==1||!['auto','explicit'].includes(c.mode)||!Array.isArray(c.stages)||Object.keys(c).some(k=>!['version','mode','stages','publish'].includes(k)))fail('Expected composite definition v1');
   if(stage.engine!=='native-gpu'||c.mode==='explicit'&&!stage.entry||c.mode==='auto'&&!!stage.entry)fail('Explicit composites need a Native factory; automatic composites have no factory');
   if(Object.hasOwn(stage.props,CONFIG)||c.stages.some(s=>s?.props&&Object.hasOwn(s.props,CONFIG)))fail('Nested V-SHARED drafts require a separate transaction-domain extension','E_STAGE_SHARED_SCOPE');
   if(c.stages.some(s=>!s||typeof s!=='object'||Array.isArray(s)||!s.inputs||!s.props))fail('Invalid child Stage definition');
   const byId=new Map(c.stages.map(s=>[s.id,s]));let boundary='so2_boundary';while(byId.has(boundary))boundary+='_';
   const ports:Record<string,import('../../src/core/types.ts').PortType>={};
   for(const [name,schema]of Object.entries(stage.inputTypes??{}))ports[name]=normalizeInputPort(schema).type;
   const virtual:StageSpec={id:boundary,engine:'native-gpu',inputs:{},inputTypes:{},outputs:{},props:{},time:{start:0,duration:stage.time.duration,offset:0,rate:{num:1,den:1}},seek:'stateless'};
   const virtuals:StageSpec[]=[];
   const boundaryPort=(type:import('../../src/core/types.ts').PortType)=>{let id=boundary+'_'+virtuals.length;while(byId.has(id))id+='_';virtuals.push({...virtual,id,outputs:{value:type}});return {$ref:id,port:'value'};};
   const children=c.stages.map(s=>{
    if(s.engine!=='native-gpu'||s.audio)fail('SO-2 v1 child execution supports Native Stages; audio retains its sample-interval API','E_STAGE_CALL_INTERVAL');
    const {composition:_nested,...rest}=s,inputs={...s.inputs};
    for(const [name,value]of Object.entries(inputs))if(isStageInput(value)){
     const type=ports[value.$input];if(!type)fail(`Unknown enclosing input '${value.$input}'`,'E_STAGE_INPUT_REFERENCE');
     inputs[name]=boundaryPort(type);
    }else if(value&&typeof value==='object'&&'$input'in value)fail('Malformed composite input reference','E_STAGE_INPUT_REFERENCE');
    if(c.mode==='explicit')for(const [name,schema]of Object.entries(s.inputTypes??{}))if(!Object.hasOwn(inputs,name)&&!normalizeInputPort(schema).optional)inputs[name]=boundaryPort(normalizeInputPort(schema).type);
    return {...rest,inputs};
   });
   const local={...tvg,composition:{...tvg.composition,durationInFrames:stage.time.duration},stages:[...virtuals,...children],layers:[]};
   issues.push(...validateTVG(local,options).map(d=>({...d,details:{path,diagnostic:d.details}})));
   if(c.mode==='auto'){
    if(!c.publish||typeof c.publish!=='object'||Array.isArray(c.publish))fail('Automatic composites declare publish mappings');
    if(Object.keys(c.publish!).some(k=>!Object.hasOwn(stage.outputs,k)))fail('Undeclared composite output');
    for(const [name,type]of Object.entries(stage.outputs)){const ref=c.publish![name],producer=ref&&byId.get(ref.$ref);if(!isPortRef(ref)||Object.keys(ref).some(k=>!['$ref','port'].includes(k))||!producer||!inputTypeAccepts(type,producer.outputs[ref.port]))fail(`Output '${name}' must reference a compatible local child port`,'E_STAGE_COMPOSITION_OUTPUT');}
   }else if(c.publish!==undefined)fail('Explicit composites return outputs from renderAt instead of declaring publish');
   for(const child of c.stages)todo.push({stage:child,path:[...path,child.id]});
  }catch(error){issues.push(diagnostic(error));}
 }
 return issues;
}
