import {resolve} from 'node:path';
import {createAnalysisTask,createNodeAnalysisExecutor} from '../../src/analysis/index.ts';
import type {Input,Output} from './analysis-task.ts';
const result=await createAnalysisTask({input:{value:42},executor:createNodeAnalysisExecutor<Input,Output>({module:resolve('tests/fixtures/analysis-task.ts'),cacheRoot:process.argv[2]})}).start().wait();
console.log(JSON.stringify({cacheHit:result.cacheHit,value:result.output.value,key:result.artifact.manifest.cacheKey,cleanup:result.cleanup}));
