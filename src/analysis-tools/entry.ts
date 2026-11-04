import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {analysisCLI} from './cli.ts';
import {diagnostic} from '../core/errors.ts';
/** Optional lean adapter for Agent-1 packaging; no edits to the common CLI/bin. */
export async function runAnalysisCLI(args=process.argv.slice(2)){
  try{const result=await analysisCLI(args);console.log(JSON.stringify(result));return result;}
  catch(error){const result={ok:false,schemaVersion:1,diagnostics:[diagnostic(error)]};console.error(JSON.stringify(result));process.exitCode=1;return result;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runAnalysisCLI();
