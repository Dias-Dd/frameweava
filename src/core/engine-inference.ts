import {EngineError} from './errors.ts';

/** Authoring metadata, not a registry or a TVG field. No code is loaded by this descriptor. */
export interface EngineRequirement {id:string; engines:readonly string[]}
export interface StageEngineSelection {explicit?:string; requirements:EngineRequirement[]}
export const ENGINE_SELECTION=Symbol.for('@frameweave/engine.stage-engine-selection');
const REQUIREMENTS=Symbol.for('@frameweave/engine.engine-requirements');
export function resolveStageEngine(stageId:string,explicit:string|undefined,requirements:readonly EngineRequirement[]):string {
  if(explicit==='web')throw new EngineError('E_WEB_REMOVED','Web Stages were removed; use the Servo module in a Native Stage.',{stageId});
  const normalized=requirements.map(r=>{
    if(!r||typeof r.id!=='string'||!r.id||!Array.isArray(r.engines)||!r.engines.length||r.engines.some(e=>typeof e!=='string'||!e))
      throw new EngineError('E_ENGINE_REQUIREMENT','Engine requirements need an id and a nonempty Engine list.',{stageId});
    return {id:r.id,engines:[...new Set(r.engines)].sort()};
  });
  const details={requirements:normalized,...explicit===undefined?{}:{explicit}};
  if(explicit!==undefined){
    if(!explicit||normalized.some(r=>!r.engines.includes(explicit)))throw new EngineError('E_ENGINE_INCOMPATIBLE',`Stage '${stageId}' cannot use explicit Engine '${explicit}'.`,{stageId,details});
    return explicit;
  }
  if(!normalized.length)return 'native-gpu';
  const candidates=normalized[0]!.engines.filter(e=>e!=='web'&&normalized.every(r=>r.engines.includes(e)));
  if(!candidates.length&&normalized.some(r=>r.engines.every(e=>e==='web')))throw new EngineError('E_WEB_REMOVED','This component requires the removed Web Stage; migrate it to Servo.',{stageId});
  if(!candidates.length)throw new EngineError('E_ENGINE_CONFLICT',`Stage '${stageId}' has no common compatible Engine.`,{stageId,details});
  if(candidates.length===1&&candidates[0]==='web')throw new EngineError('E_WEB_REMOVED','This component requires the removed Web Stage; migrate it to Servo.',{stageId});
  if(candidates.length===1)return candidates[0]!;
  throw new EngineError('E_ENGINE_AMBIGUOUS',`Stage '${stageId}' requires an explicit Engine: ${candidates.join(', ')}.`,{stageId,details:{...details,candidates}});
}
export function engineRequirements(value:unknown,depth=0):EngineRequirement[]{
  if(depth>96)throw new EngineError('E_ENGINE_REQUIREMENT','Component nesting exceeds the authoring limit.');
  if(!value||typeof value!=='object')return [];
  if(Array.isArray(value))return [...((value as unknown as Record<symbol,EngineRequirement[]>)[REQUIREMENTS]??[]),...value.flatMap(v=>engineRequirements(v,depth+1))];
  const node=value as Record<PropertyKey,unknown>;
  return [...(node[REQUIREMENTS] as EngineRequirement[]??[]),...engineRequirements(node.children,depth+1)];
}
/** Decorate an actually called authoring component. Unused imports have no effect.
 * Native/dynamic factory internals are opaque: declare their requirements on Stage.requires.
 */
export function defineManagedComponent<P,R extends object>(component:(props:P)=>R,requirement:EngineRequirement):(props:P)=>R {
  // Validate/freeze metadata once; no global registration and no implementation execution.
  resolveStageEngine('component',requirement?.engines?.find(e=>e!=='web'),[requirement]);
  const saved={id:requirement.id,engines:[...requirement.engines]};
  return props=>{
    const node=component(props);
    return Object.assign(Array.isArray(node)?[...node]:{...node},{[REQUIREMENTS]:[...((node as Record<symbol,EngineRequirement[]>)[REQUIREMENTS]??[]),saved]}) as R;
  };
}
export function attachEngineSelection<T extends object>(target:T,selection:StageEngineSelection):T {
  return Object.assign(target,{[ENGINE_SELECTION]:selection});
}
export function stageEngineSelection(value:object):StageEngineSelection|undefined {
  return (value as Record<symbol,StageEngineSelection>)[ENGINE_SELECTION];
}
