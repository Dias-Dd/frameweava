import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {discoverPlugins,builtinRoot,type Lock} from '../src/plugins/registry.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';

const root=resolve('.'),registry=await discoverPlugins([builtinRoot,join(root,'plugins/shared'),join(root,'plugins/packages')]);
const files=execFileSync('git',['ls-files','--','**/frameweave.plugins.lock.json'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
const rows=[];
// Validate every old content/dependency pin before writing any SDK-only update.
for(const file of files){
 const before=JSON.parse(await readFile(file,'utf8')) as Lock,after={...before,runtime:runtimePin};
 for(const ref of Object.keys(before.plugins))registry.verify(ref,after);
 assert.deepEqual(after.plugins,before.plugins);
 rows.push({file,oldRuntime:before.runtime,newRuntime:runtimePin,plugins:Object.keys(before.plugins),pluginContentAndDependenciesUnchanged:true});
}
for(const row of rows){const before=JSON.parse(await readFile(row.file,'utf8'));await writeFile(row.file,JSON.stringify({...before,runtime:runtimePin},null,2)+'\n');}
const output=process.argv[2]??'artifacts/main-pa1/sdk-lock-audit.json';await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({runtimePin,verificationCatalogs:['plugins/builtin','plugins/shared','plugins/packages'],rows},null,2));
console.log(JSON.stringify({runtimePin,reviewedLocks:rows.length}));
