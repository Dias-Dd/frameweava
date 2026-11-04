import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {defineAnalysisTask,hashAnalysisFile} from '../../src/analysis/index.ts';
import * as ordinary from './scope-module.mjs';
export const task=defineAnalysisTask<{frame:number;nonce:number},{frame:number;before:number;after:number;calls:number;pid:number}>({
  async describe(input,context){return {inputs:[{id:'scope-source',...await hashAnalysisFile(fileURLToPath(new URL('./scope-module.mjs',import.meta.url)),context.signal)}],algorithm:{id:'v-shared.scope',version:'1.0.0',integrity:(await hashAnalysisFile(fileURLToPath(import.meta.url),context.signal)).sha256},models:[],parameters:input,runtime:{id:'node',version:process.version,integrity:(await hashAnalysisFile(process.execPath,context.signal)).sha256,environment:{platform:process.platform,arch:process.arch}}};},
  async execute(input,context){const before=ordinary.get();ordinary.set(input.frame);const output={frame:input.frame,before,after:ordinary.get(),calls:ordinary.tick(),pid:process.pid};await writeFile(join(context.directory,'scope.json'),JSON.stringify(output));return {output,files:[{path:'scope.json',format:'application/json'}]};},
  validateOutput(v){if(!v||typeof v!=='object'||!Object.values(v).every(x=>typeof x==='number'&&Number.isFinite(x)))throw Error('Invalid scope observation');},
});
