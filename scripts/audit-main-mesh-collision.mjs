import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const out=resolve(process.argv[2]??'artifacts/main-mesh-collision');await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),root=resolve('.'),module=join(root,'modules/rigid-body-effects');
const record=JSON.parse(await readFile(join(module,'dist/build.json'),'utf8')),checked=[];
for(const [file,expected]of Object.entries({...record.inputs,...record.outputs})){assert.equal(hash(await readFile(join(module,file))),expected,file);checked.push(file);}
for(const [file,expected]of Object.entries(record.coreInputs)){assert.equal(hash(await readFile(join(root,file))),expected,file);}
const licenses=JSON.parse(await readFile(join(module,'licenses/dependencies.json'),'utf8'));
for(const dependency of licenses){assert.match(dependency.license,/MIT|Apache|Zlib|Unicode/);assert.ok(!/GPL|SSPL|AGPL/.test(dependency.license));for(const notice of dependency.notices)assert.equal(hash(await readFile(join(module,notice.file))),notice.sha256,notice.file);}
const compiled=new WebAssembly.Module(await readFile(join(module,'dist/module.wasm'))),imports=WebAssembly.Module.imports(compiled);assert.deepEqual(imports,[]);
const directories=['rigid-body-effects','skeletal-effects','spatial-effects'];
assert.equal(execFileSync('git',['diff','b0c8ca5e2df904df535c5678ed798b017eaab6d3','--',...directories.map(d=>'modules/'+d)],{encoding:'utf8',windowsHide:true}),'','Frozen module implementation changed');
const {runtimePin}=await import('../src/compiler/runtime-lock.ts');
const result={source:'b0c8ca5e2df904df535c5678ed798b017eaab6d3',mainBase:'a70311df31486590aa0e5fab5c58944f82328ce1',moduleSourceBytesExact:true,verifiedBuildFiles:checked.length,verifiedCoreFiles:Object.keys(record.coreInputs).length,licenses:licenses.length,spdx:[...new Set(licenses.map(d=>d.license))],wasmImports:imports,wasmExports:WebAssembly.Module.exports(compiled),runtimePin};
await writeFile(join(out,'audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,wasmExports:result.wasmExports.length}));
