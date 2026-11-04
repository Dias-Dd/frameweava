import {stageDefinitions} from '../stage-orchestration/composite-types.ts';
import type {BuiltProject} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {assertNativeExecution} from '../../src/runtime/execution-policy.ts';
export type LogicEngine='spidermonkey';
export function selectedLogicEngine(requested=process.env.FRAMEWEAVE_JS_HOST??'spidermonkey'):LogicEngine {
 if(requested!=='spidermonkey')throw new EngineError('E_NATIVE_LOGIC_HOST','Only the SpiderMonkey host is supported. The Chromium/V8 host was removed.');
 return 'spidermonkey';
}
export function nativeHostPolicy(build:BuiltProject,requested=process.env.FRAMEWEAVE_JS_HOST??'spidermonkey'){
 const stages=stageDefinitions(build.manifest).map(d=>d.stage);assertNativeExecution(stages);const engine=selectedLogicEngine(requested);
 const hasLogic=stages.some(s=>s.engine==='native-gpu'&&s.entry);
 return {engine,hasLogic,needsSpiderMonkey:hasLogic};
}
