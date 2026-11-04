import {Stage,ref,type StageNode,type StageProps} from '../core/authoring.ts';
import {CONFIG,RUNTIME,OUTPUT,sharedVariable,definition,fail,type Variable} from './protocol.ts';
/** Ordinary Stage props/JSON ports only. No new TVG property, edge type or message bus. */
export function SharedStage({writes=[],reads=[],...options}:StageProps&{writes?:readonly Variable[];reads?:readonly Variable[]}):StageNode{
  if(!writes.length&&!reads.length)fail('E_SHARED_DECLARATION','SharedStage must declare reads or writes');
  const inputs={...options.inputs},inputTypes={...options.inputTypes},outputs={...(options.outputs??{surface:'surface' as const})},props={...options.props};
  if(Object.hasOwn(props,CONFIG)||Object.hasOwn(props,RUNTIME)||Object.hasOwn(outputs,OUTPUT))fail('E_SHARED_DECLARATION','Reserved shared-state field collision');
  const bindings=reads.map((variable,index)=>{
    const input=`vSharedInput${index}`;if(Object.hasOwn(inputs,input)||Object.hasOwn(inputTypes,input))fail('E_SHARED_DECLARATION','Reserved shared input collision');
    inputs[input]=ref(variable.writer,OUTPUT);inputTypes[input]='json';return {variable:sharedVariable(variable),input};
  });
  const encoded=JSON.stringify({stage:options.id,writes:writes.map(v=>sharedVariable(v)),reads:bindings});definition(encoded);
  props[CONFIG]=encoded;if(writes.length)outputs[OUTPUT]='json';return Stage({...options,inputs,inputTypes,outputs,props});
}
export {sharedVariable,sharedFrame,LIMITS} from './protocol.ts';
export type {Variable,Value,Kind} from './protocol.ts';
