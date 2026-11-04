import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
import {groupedCases} from '../../../tools/glsl-library-to-wgsl/grouped-cases.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),root=resolve('modules/spatial-effects'),work=resolve('.frameweave/native-noise-translation');await mkdir(work,{recursive:true});
const bytes=await readFile(join(root,'vendor/fastnoise-lite/FastNoiseLite.glsl'));assert.equal(sha(bytes),'71c9af239e4f75617c74f74a9266fd944550edfa4ddc31920703e2cdb836cef2');
const fixes=[];const primes={X:501125321,Y:1136930381,Z:1720413743};
// GLSL GPU arithmetic wraps signed integer lattice hashes. Naga's constant
// evaluator instead rejects signed overflow; write these SAME fixed bit patterns
// as signed literals. Runtime arithmetic and all sampled positions are unchanged.
const normalized=groupedCases(bytes.toString('utf8').replace(/(-?)PRIME_([XYZ])\s*(?:<<\s*1|\*\s*2)/g,(source,negative,axis)=>{const value=((negative?-1:1)*primes[axis]*2)|0;fixes.push({source,value});return '('+value+')';}).replace(/const float (GRADIENTS_[23]D|RAND_VECS_[23]D)\[\](\s*=\s*\{([^}]+)\})/g,(_all,name,body,items)=>{const count=items.split(',').filter(s=>s.trim()).length;fixes.push({source:name+'[]',arrayLength:count});return 'const float '+name+'['+count+']'+body;}));
const input=join(work,'fnl-normalized.glsl'),output=join(work,'fnl.wgsl');await writeFile(input,normalized);
const executable=resolve('.frameweave/naga-library-target/debug/frameweave-glsl-library-to-wgsl.exe'),result=spawnSync(executable,[input,output],{encoding:'utf8',windowsHide:true});
if(result.status!==0){process.stderr.write(result.stderr??'');process.exit(result.status??1);}
const translated=await readFile(output,'utf8');assert.ok(!/@(group|binding|vertex|fragment|compute)\b/.test(translated),'Library must not declare GPU IO or entry points');
const license=await readFile(join(root,'vendor/fastnoise-lite/LICENSE-MIT'),'utf8'),header='// Generated from fixed FastNoiseLite1.1.1/MIT with Naga30.0.1.\n'+license.split(/\r?\n/).map(l=>l?'// '+l:'//').join('\n')+'\n';
await writeFile(join(root,'src/noise-wgsl.ts'),header+'export const noiseWgsl='+JSON.stringify(translated)+';\n');
await writeFile(join(root,'vendor/fastnoise-lite/NATIVE-WGSL.json'),JSON.stringify({upstream:'FastNoiseLite v1.1.1 / 7ccfbc16eb1c932568f177d63a9ba51d89bbe516',sourceSha256:sha(bytes),normalizedSha256:sha(Buffer.from(normalized)),wgslSha256:sha(Buffer.from(translated)),fixes,translator:{name:'naga',version:'30.0.1',license:'MIT OR Apache-2.0',exeSha256:sha(await readFile(executable)),lockSha256:sha(await readFile('tools/glsl-library-to-wgsl/Cargo.lock'))},entries:['fnlGetNoise2D','fnlGetNoise3D','fnlDomainWarp2D','fnlDomainWarp3D']},null,2)+'\n');console.log(JSON.stringify({ok:true,fixes:fixes.length,bytes:translated.length}));
