/** Reproduce a concrete baseline validation race with real published files, no fabricated analysis. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AnalysisArtifactStore} from '../src/analysis/artifact.ts';
const original=JSON.parse(await readFile(resolve('outputs/dx1b/cli-optimized/metrics.json'),'utf8')),parent=resolve('.frameweave/dx1b-races');await mkdir(parent,{recursive:true});
const baseline=await import(pathToFileURL(resolve('outputs/dx1b/baseline-source/src/analysis/artifact.ts')).href);
const rows=[];
for(const [label,Store]of [['merged-baseline',baseline.AnalysisArtifactStore],['current',AnalysisArtifactStore]] as const){
 const root=await mkdtemp(join(parent,'race-'));await cp(join(original.project,'.frameweave/analysis-tools/artifacts'),join(root,'artifacts'),{recursive:true});const store=new Store(join(root,'artifacts')),complete=join(root,'artifacts',original.id,'complete.json'),file=(store as any).file;let changed=false;
 (store as any).file=async function(...args:any[]){const path=await file.apply(this,args);if(!changed){changed=true;const record=JSON.parse(await readFile(complete,'utf8'));record.schemaVersion=2;await writeFile(complete,JSON.stringify(record));}return path;};
 let accepted=false,code:string|undefined;try{await store.read(original.id);accepted=true;}catch(e:any){code=e.code;}
 rows.push({label,root,accepted,code,finalCompleteSchema:JSON.parse(await readFile(complete,'utf8')).schemaVersion});
}
assert.equal(rows[0].accepted,true);assert.equal(rows[0].finalCompleteSchema,2);assert.equal(rows[1].accepted,false);assert.equal(rows[1].code,'E_ANALYSIS_CACHE');await writeFile(resolve('outputs/dx1b/integrity-race.json'),JSON.stringify({passed:true,method:'fault injection changes complete.schemaVersion after metadata parsing, while real files are being verified',rows},null,2));console.log(JSON.stringify(rows,null,2));
