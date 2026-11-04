// SPDX-License-Identifier: Apache-2.0
// Narrow repair for an erased type-only Core change. This is not a Rust build.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';

const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=join(workspace,'modules/rigid-body-effects');
const baseline=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(baseline??'')||process.argv.length!==3)throw Error('Use an explicitly reviewed full baseline commit');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=file=>execFileSync('git',['show',`${baseline}:${file}`],{cwd:workspace,windowsHide:true,maxBuffer:16*1024**2});
const recordPath='modules/rigid-body-effects/dist/build.json',original=git(recordPath);
if(!(await readFile(join(workspace,recordPath))).equals(original))throw Error('Worker record differs from the reviewed baseline');
const record=JSON.parse(original);
for(const [name,hash]of Object.entries({...record.inputs,...record.outputs})){
  if(sha(await readFile(join(root,name)))!==hash||sha(git('modules/rigid-body-effects/'+name))!==hash)throw Error('Changed solver/Worker input or artifact: '+name);
}
const changes=[];
for(const [name,hash]of Object.entries(record.coreInputs)){
  if(sha(git(name))!==hash)throw Error('Baseline Core seal mismatch: '+name);
  const current=await readFile(join(workspace,name));
  if(sha(current)===hash)continue;
  if(name!=='src/core/native-source.ts')throw Error('Requires a full separately reviewed Worker build: '+name);
  const emit=b=>ts.transpileModule(b.toString('utf8'),{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText;
  const before=emit(git(name)),after=emit(current);
  if(before!==after)throw Error('Changed emitted JavaScript; type-only repair refused: '+name);
  changes.push({file:name,beforeSha256:hash,afterSha256:sha(current),emittedJavaScriptSha256:sha(after)});
}
if(changes.length!==1)throw Error('Expected exactly the reviewed erased type-only Core change');
// Match the unchanged canonical build-solver.mjs Worker build options exactly.
const worker=await build({absWorkingDir:root,entryPoints:['runtime/worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,legalComments:'inline',metafile:true});
const bytes=worker.outputFiles[0].contents;
if(sha(bytes)!==record.outputs['dist/worker.js'])throw Error('Actual rebuilt Worker bytes changed; full review required');
const coreInputs={};
for(const name of Object.keys(worker.metafile.inputs)){
  const file=resolve(root,name),rel=relative(workspace,file).replaceAll('\\','/');
  if(rel.startsWith('src/'))coreInputs[rel]=sha(await readFile(file));
}
if(JSON.stringify(Object.keys(coreInputs).sort())!==JSON.stringify(Object.keys(record.coreInputs).sort()))throw Error('Worker Core dependency graph changed');
const wasm=await readFile(join(root,'dist/module.wasm'));
if(JSON.stringify(WebAssembly.Module.imports(await WebAssembly.compile(wasm)))!==JSON.stringify(record.hostImports))throw Error('WASM host import contract changed');
record.coreInputs=coreInputs;
record.workerRebuild={version:1,baselineCommit:baseline,baselineRecordSha256:sha(original),generatorSha256:sha(await readFile(fileURLToPath(import.meta.url))),changes,workerSha256:sha(bytes),wasmSha256:sha(wasm),rustRebuilt:false,wasmReused:true,note:'WASM/compiler/dependency provenance retained from the verified baseline. Current Worker actually rebundled; byte-identical output and identical emitted Core JavaScript are required.'};
await writeFile(join(root,'dist/worker.js'),bytes);
await writeFile(join(root,'dist/build.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify({ok:true,...record.workerRebuild}));
