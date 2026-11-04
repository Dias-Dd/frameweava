import {EngineError} from '../core/errors.ts';
/** Native SpiderMonkey WASM authorization. Never authorizes Servo content. */
export function assertWasmOption(value:unknown):asserts value is boolean|undefined {
 if(value!==undefined&&typeof value!=='boolean')throw new EngineError('E_ARGUMENT','allowWasm must be a boolean.');
}
/** Fail closed at every public/raw-TVG boundary; there is no browser fallback. */
export function assertNativeExecution(stages:readonly {id:string;engine:string}[]){
 for(const stage of stages)if(stage.engine==='web')throw new EngineError('E_WEB_REMOVED','Web Stages were removed. Use a Native Stage and the Servo module for HTML/CSS content.',{stageId:stage.id});
}
