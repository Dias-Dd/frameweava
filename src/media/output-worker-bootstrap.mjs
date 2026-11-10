// Trusted engine entry, never an authored Stage or a project-supplied URL.
import {workerData} from 'node:worker_threads';
if(workerData.entry.endsWith('.ts')){
  const {register}=await import('tsx/esm/api');register();
}
await import(workerData.entry);
