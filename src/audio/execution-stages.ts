import type {StageSpec,TVG} from '../core/types.ts';
import {EngineError} from '../core/errors.ts';
import {isPortRef} from '../core/graph.ts';

/** Execution selection only. Never replace the authenticated BuiltProject/TVG.
 * Frame-only CPU producers remain valid explicit dependencies of an Audio Stage.
 * Native resident media requires its own bridge, not implicit materialization. */
export function audioExecutionStages(tvg:TVG,stageId?:string):StageSpec[]{
 const byId=new Map(tvg.stages.map(stage=>[stage.id,stage]));
 const roots=stageId===undefined?tvg.stages.filter(s=>s.engine==='audio'||Object.values(s.outputs).includes('audio')):[byId.get(stageId)];
 if(roots.some(s=>!s))throw new EngineError('E_STAGE_REFERENCE',`Unknown Stage ${stageId}`,{stageId});
 if(stageId!==undefined&&roots[0]!.engine==='native-gpu')throw new EngineError('E_AUDIO_CAPABILITY','Native image targets do not support CPU sample-interval execution',{stageId});
 const needed=new Set<string>(),pending=roots as StageSpec[];
 while(pending.length){const stage=pending.pop()!;if(needed.has(stage.id))continue;
  if(stage.engine==='native-gpu')throw new EngineError('E_AUDIO_DEPENDENCY','Audio intervals cannot implicitly execute Native image dependencies',{stageId:stage.id});
  needed.add(stage.id);for(const input of Object.values(stage.inputs))if(isPortRef(input)){const producer=byId.get(input.$ref);if(!producer)throw new EngineError('E_STAGE_REF','Missing audio dependency',{stageId:stage.id});pending.push(producer);}
 }
 return tvg.stages.filter(s=>needed.has(s.id));
}
