import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,access,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {installPackages,uninstallPackages,uninstallPackage,installedPackages} from '../src/packages/manager.ts';
import {validateRegistry} from '../src/packages/remote-registry.ts';

test('bulk removal protects shared dependencies, collects upgrade orphans and releases all snapshots',async()=>{
 const base=resolve('.frameweave/remote-tests');await mkdir(base,{recursive:true});const run=await mkdtemp(join(base,'run-'));
 const catalog=join(run,'catalog'),project=join(run,'project');await mkdir(catalog);await mkdir(project);
 const make=async(id:string,version:string,dependencies:Record<string,string>={})=>{
  const dir=join(catalog,id+'-'+version);await mkdir(dir);
  await writeFile(join(dir,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id,version,name:id,description:'test',source:{kind:'local',authority:'unit'},compatible:'0.1.0',platforms:['web'],capabilities:[],permissions:{filesystem:false,network:false,process:false},modules:{main:{format:'javascript',path:'./index.js'}},entry:'main',dependencies}));
  await writeFile(join(dir,'index.js'),'export const value='+JSON.stringify(version));
 };
 await make('shared','1.0.0');await make('suite-a','1.0.0',{shared:'1.0.0'});await make('suite-b','1.0.0',{shared:'1.0.0'});
 await make('old','1.0.0');await make('old','2.0.0');
 await installPackages(project,[catalog],{add:['suite-a@1.0.0','suite-b@1.0.0','old@1.0.0'],trust:['local:unit']});
 await installPackages(project,[catalog],{add:['old@2.0.0']});
 await assert.rejects(uninstallPackage(project,'shared'),{code:'E_PACKAGE_DEPENDENT'});
 const first=await uninstallPackage(project,'suite-a');assert.ok(first.remaining.includes('shared@1.0.0'));assert.ok(first.garbageCollected.includes('old@1.0.0'));
 assert.equal((await installedPackages(project)).records.length,3);
 const last=await uninstallPackages(project,'all');assert.deepEqual(last.remaining,[]);assert.ok(last.freedBytes>0);
 assert.equal((await installedPackages(project)).records.length,0);
 await assert.rejects(access(join(project,'.frameweave/packages/shared@1.0.0')));
});

test('registry rejects nonpublisher URLs, identity changes and duplicate records before installation',async()=>{
 const config={schemaVersion:1 as const,repository:'Dias-Dd/frameweava',channel:'dev',indexUrl:'https://raw.githubusercontent.com/Dias-Dd/frameweava/dev/registry/index.json'};
 assert.throws(()=>validateRegistry({schemaVersion:1,packages:[{}],api:[]} as never,config));
 assert.throws(()=>validateRegistry({schemaVersion:2,packages:[],api:[]} as never,config));
 assert.deepEqual(validateRegistry({schemaVersion:1,packages:[],api:[]},config).packages,[]);
 const index=JSON.parse(await readFile('registry/index.json','utf8'));
 const first=structuredClone(index.packages[0]);
 assert.throws(()=>validateRegistry({schemaVersion:1,packages:[first,first],api:[]},config));
 const foreign=structuredClone(first);foreign.archive.url=foreign.archive.url.replace('/Dias-Dd/frameweava/','/someone/other/');
 assert.throws(()=>validateRegistry({schemaVersion:1,packages:[foreign],api:[]},config));
 const changed=structuredClone(first);changed.integrity='0'.repeat(64);
 assert.throws(()=>validateRegistry({schemaVersion:1,packages:[changed],api:[]},config));
});
