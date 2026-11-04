import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAnalysisTask,createNodeAnalysisExecutor} from '../../src/node.ts';
import type {BrightnessInput,BrightnessOutput} from './brightness-task.ts';

if(!process.argv[2])throw Error('Usage: node --import tsx examples/analysis/run.ts image.ppm [cache-directory]');
const job=createAnalysisTask({input:{imagePath:resolve(process.argv[2])},executor:createNodeAnalysisExecutor<BrightnessInput,BrightnessOutput>({module:fileURLToPath(new URL('./brightness-task.ts',import.meta.url)),exportName:'brightnessTask',cacheRoot:resolve(process.argv[3]??'.frameweave/analysis-c3/brightness')})});
job.subscribe(status=>console.log(JSON.stringify(status)));
process.once('SIGINT',()=>job.cancel());job.start();
await job.wait();
