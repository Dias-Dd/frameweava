import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import type {BuiltProject,TVG} from '../../src/core/types.ts';
import {hashAnalysisFile} from '../../src/analysis/artifact.ts';
import {projectPlugins} from '../../src/plugins/registry.ts';
import {engineRoot} from '../../src/compiler/build.ts';
import {hash} from '../render-inspection/common.ts';

// Match buildProject's package: resolution origin, not the caller's node_modules.
const require=createRequire(join(engineRoot,'src/compiler/build.ts'));
export async function optionalHash(file:string){try{return(await hashAnalysisFile(file)).sha256;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return 'missing';throw e;}}
export async function catalog(project:string){
  const p=await projectPlugins(dirname(project));
  return {signature:hash(JSON.stringify({config:p.config,lock:await optionalHash(p.lockfile),packages:p.packages.lock,
    records:p.registry.list().map(r=>({directory:r.directory,integrity:r.integrity}))})),
    trust:JSON.stringify(p.packages.config.trustedSources)};
}
export async function dependencies(project:string,build:BuiltProject){
  // Compiler-produced manifest has already passed TVG validation. Never accept this from an Agent.
  const graph=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8')) as {entry:string;files:string[];manifest:TVG};
  const files=new Set([project,...graph.files]);
  for(const r of graph.manifest.resources)if(!r.src.startsWith('data:'))files.add(r.src.startsWith('package:')?require.resolve(r.src.slice(8)):resolve(dirname(graph.entry),r.src));
  for(const name of ['frameweave.plugins.json','frameweave.packages.json','frameweave.packages.lock.json'])files.add(join(dirname(project),name));
  for(const name of ['tsconfig.json','package.json','package-lock.json','npm-shrinkwrap.json']){files.add(join(dirname(project),name));files.add(join(engineRoot,name));}
  // Seal the actual files served to Chromium, including split plugin chunks and copied resources.
  for(const file of [...Object.values(build.assets),...Object.values(build.stageBundles).map(p=>join(build.dir,p)),...['sources.json','tvg.json','build.json'].map(p=>join(build.dir,p))])files.add(file);
  return [...files].sort();
}
export async function fingerprint(files:string[],catalogSignature:string){
  // Bound concurrent full reads; do not replace content identity with timestamps.
  // Assemble in input order so digest bytes and the first native error stay stable.
  const results:PromiseSettledResult<string>[]=new Array(files.length);let next=0;
  await Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{
    for(;;){const index=next++;if(index>=files.length)return;
      try{results[index]={status:'fulfilled',value:await optionalHash(files[index])};}
      catch(reason){results[index]={status:'rejected',reason};}
    }
  }));
  const values:Record<string,string>={};
  for(let index=0;index<files.length;index++){
    const result=results[index];if(result.status==='rejected')throw result.reason;
    values[files[index]]=result.value;
  }
  return hash(JSON.stringify([catalogSignature,values]));
}
