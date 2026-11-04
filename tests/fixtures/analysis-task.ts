// Fault injection only. Real generality is tested with examples/analysis/brightness-task.ts.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {defineAnalysisTask,analysisHash} from '../../src/analysis/index.ts';
import {EngineError} from '../../src/core/errors.ts';

export type Input={value:number;mode?:string;delay?:number;cleanupDelay?:number;marker?:string;barrier?:string;algorithmVersion?:string;model?:string;runtime?:string;salt?:number};
export type Output={value:number};
export const task=defineAnalysisTask<Input,Output>({
  async describe(input){return {inputs:[{id:'fixture',sha256:analysisHash(input.value),bytes:1}],algorithm:{id:'test.fixture',version:input.algorithmVersion??'1',integrity:analysisHash(input.algorithmVersion??'1')},models:input.model?[{id:'model',version:input.model,integrity:analysisHash(input.model)}]:[],parameters:{salt:input.salt??0},runtime:{id:'node-test',version:'1',integrity:analysisHash(input.runtime??'1'),environment:{backend:input.runtime??'test'}}};},
  async execute(input,context){
    context.deferCleanup('fixture',async()=>{if(input.cleanupDelay)await sleep(input.cleanupDelay);if(input.mode==='cleanup-fail')throw Error('Deliberate cleanup failure');if(input.marker&&input.mode==='cleanup-marker')await writeFile(input.marker,'released');});
    if(input.mode==='crash')process.exit(17);
    if(input.mode==='hang'){
      const owned=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
      if(input.marker)await writeFile(input.marker,String(owned.pid));context.reportProgress({phase:'blocking',completed:1});
      while(true)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5000);
    }
    if(input.mode==='error')throw new EngineError('E_FIXTURE','Deliberate executor error');
    if(input.mode==='live-error')throw new EngineError('E_FIXTURE','Error with non-JSON details',{details:{callback:()=>{}}});
    if(input.mode==='fail-once'&&input.marker){let exists=false;try{await readFile(input.marker);exists=true;}catch{}if(exists){await unlink(input.marker);throw new EngineError('E_FIXTURE','First execution fails');}}
    context.reportProgress({phase:'work',completed:1,total:2});
    if(input.mode==='bad-progress')context.reportProgress({phase:'work',completed:NaN});
    if(input.barrier){while(true){try{await readFile(input.barrier);break;}catch{context.signal.throwIfAborted();await sleep(10);}}}
    await sleep(input.delay??10,undefined,{signal:context.signal});
    context.signal.throwIfAborted();await writeFile(join(context.directory,'value.json'),JSON.stringify({value:input.value}));context.reportProgress({phase:'work',completed:2,total:2});
    return {output:{value:input.mode==='invalid-output'?NaN:input.value},files:[{path:'value.json',format:'application/json'}]};
  },
  validateOutput(value){if(!value||typeof (value as any).value!=='number'||!Number.isFinite((value as any).value))throw new EngineError('E_ANALYSIS_OUTPUT','Bad fixture output');}
});
