import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';import {resolve,join,dirname} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const source=resolve(process.argv[2]??'../..','frameweave-engine/.frameweave/native-target/release/frameweave-native-gpu.exe');
const target=resolve('.frameweave/native-library-50/bin-current/frameweave-native-gpu.exe'),out=resolve('modules/spatial-effects/validation/native-library/evidence');
const hash=b=>createHash('sha256').update(b).digest('hex'),receipt=JSON.parse(await readFile(join(dirname(source),'native-build.json'),'utf8')),inputs={};
assert.equal(receipt.profile,'release');assert.deepEqual(receipt.features,[]);assert.equal(Object.keys(receipt.inputHashes).length,12);
for(const [name,sha]of Object.entries(receipt.inputHashes)){const actual=hash(await readFile(resolve('modules/native-gpu',name)));assert.equal(actual,sha,'Frozen binary input differs: '+name);inputs[name]=actual;}
const bytes=await readFile(source);assert.equal(hash(bytes),receipt.executable.sha256);await mkdir(dirname(target),{recursive:true});await mkdir(out,{recursive:true});
await copyFile(source,target);await copyFile(join(dirname(source),'native-build.json'),join(dirname(target),'native-build.json'));assert.equal(hash(await readFile(target)),receipt.executable.sha256);
const report={version:1,source,target,provenance:'Independent byte copy after all 12 frozen inputs and executable SHA match; no cache links or other-worktree writes',inputHashes:inputs,executable:receipt.executable,profile:receipt.profile,features:receipt.features};
await writeFile(join(out,'binary-reuse.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,target,inputs:12,sha256:receipt.executable.sha256}));
