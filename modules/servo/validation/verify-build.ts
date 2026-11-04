import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CLOCK_SCRIPT} from '../clock.ts';
const root=process.cwd(),source=resolve('modules/servo/native'),out=resolve('artifacts/servo-module');mkdirSync(out,{recursive:true});
const metadata=JSON.parse(readFileSync(join(source,'upstream.json'),'utf8')),sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const registry=process.env.FRAMEWEAVE_CARGO_REGISTRY;if(!registry)throw Error('Explicit FRAMEWEAVE_CARGO_REGISTRY required for upstream source verification');
assert.equal(sha(readFileSync(join(source,metadata.patch.file))),metadata.patch.sha256);
const check=mkdtempSync(join(out,'patch-check-'));
for(const item of metadata.patch.changed){const file=join(check,item.file);mkdirSync(dirname(file),{recursive:true});copyFileSync(join(registry,item.file),file);assert.equal(sha(readFileSync(file)),item.upstreamSha256);}
for(const flags of [['--check'],[]])execFileSync('git',['apply',...flags,'--whitespace=nowarn','--directory='+relative(root,check).replaceAll('\\','/'),join(source,metadata.patch.file)],{cwd:root,windowsHide:true});
for(const item of metadata.patch.changed)assert.equal(sha(readFileSync(join(check,item.file))),item.patchedSha256);
assert.deepEqual(readFileSync('.frameweave/servo-kit/module/Cargo.lock'),readFileSync(join(source,'Cargo.lock')));
const build=JSON.parse(readFileSync('.frameweave/servo-kit/build.json','utf8'));
for(const [file,hash] of Object.entries(build.inputHashes))assert.equal(sha(readFileSync(join(source,file))),hash);
const runtime=process.env.FRAMEWEAVE_SERVO_RUNTIME;if(!runtime)throw Error('Explicit frozen runtime required');
const receipt=JSON.parse(readFileSync(join(runtime,'servo-runtime.json'),'utf8'));
const sizes:Record<string,number>={};for(const [file,hash]of Object.entries(receipt.files)){const bytes:Buffer=readFileSync(join(runtime,file));assert.equal(sha(bytes),hash);sizes[file]=bytes.length;}
assert.equal(receipt.files['clock.js'],sha(CLOCK_SCRIPT));
const native=[];for(const profile of ['debug','release']){const r=JSON.parse(readFileSync(`.frameweave/native-target/${profile}/native-build.json`,'utf8'));for(const [file,hash]of Object.entries(r.inputHashes))assert.equal(sha(readFileSync(resolve('modules/native-gpu',file))),hash);assert.equal(sha(readFileSync(r.executable.file)),r.executable.sha256);native.push(r);}
const result={version:1,ok:true,patchFiles:metadata.patch.changed.length,patchSha256:metadata.patch.sha256,servoBuild:build,runtimeReceipt:receipt,runtimeSizes:sizes,native};writeFileSync(join(out,'build-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,patchFiles:result.patchFiles,runtimeSizes:sizes,native:native.map(r=>r.executable.sha256)}));
