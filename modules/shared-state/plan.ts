import type {BuiltProject} from '../../src/core/types.ts';
import {assertValidTVG} from '../../src/core/graph.ts';
import {CONFIG,RUNTIME,OUTPUT,LIMITS,definition,sharedVariable,checkTotal,same,fail,type Definition,type Variable} from './protocol.ts';

export interface SharedPlan {
  definitions:Definition[];
  variables:Variable[];
  durationInFrames:number;
  activation:Record<string,{start:number;duration:number}>;
}
export const hasSharedState=(build:BuiltProject)=>build.manifest.stages.some(s=>Object.hasOwn(s.props,CONFIG)||Object.hasOwn(s.props,RUNTIME));

/** Reuses existing Stage declarations and TVG validation, not another registry. */
export function sharedPlan(build:BuiltProject):SharedPlan{
  const definitions:Definition[]=[],variables=new Map<string,Variable>(),writers=new Map<string,string>();
  for(const s of build.manifest.stages){
    if(Object.hasOwn(s.props,RUNTIME))fail('E_SHARED_DECLARATION','Runtime snapshots cannot be authored in project props');
    if(!Object.hasOwn(s.props,CONFIG))continue;
    if(s.engine!=='native-gpu')fail('E_SHARED_DECLARATION','Shared variables require a Native Stage; Audio intervals have their own execution contract');
    const d=definition(s.props[CONFIG]);if(d.stage!==s.id)fail('E_SHARED_DECLARATION','Stage identity differs from its declaration');definitions.push(d);
    for(const v of [...d.writes,...d.reads.map(b=>b.variable)]){
      const canonical=sharedVariable(v),previous=variables.get(v.id);if(previous&&!same(previous,canonical))fail('E_SHARED_CONFLICT',`Conflicting declarations for ${v.id}`);variables.set(v.id,canonical);
    }
    for(const v of d.writes){if(writers.has(v.id))fail('E_SHARED_CONFLICT','Multiple writers are unsupported');writers.set(v.id,s.id);if(s.outputs[OUTPUT]!=='json')fail('E_SHARED_DECLARATION','Writer must have its declared JSON publication port');}
    for(const b of d.reads){const input=s.inputs[b.input];if(!input||typeof input!=='object'||Array.isArray(input)||!('$ref' in input)||input.$ref!==b.variable.writer||!('port' in input)||input.port!==OUTPUT||s.inputTypes?.[b.input]!=='json')fail('E_SHARED_DEPENDENCY','Reader must have an explicit matching JSON dependency edge');}
  }
  if(!definitions.length||!variables.size||variables.size>LIMITS.cells)fail('E_SHARED_BUDGET','Expected 1..32 explicitly declared shared variables');
  for(const v of variables.values())if(writers.get(v.id)!==v.writer)fail('E_SHARED_DECLARATION',`No declared writer for ${v.id}`);
  assertValidTVG(build.manifest);
  checkTotal(Object.fromEntries([...variables].map(([id,v])=>[id,{value:v.initial,version:0}])));
  return {definitions,variables:[...variables.values()],durationInFrames:build.manifest.composition.durationInFrames,activation:Object.fromEntries(build.manifest.stages.map(s=>[s.id,{start:s.time.start,duration:s.time.duration}]))};
}
