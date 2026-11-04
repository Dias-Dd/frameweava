// SPDX-License-Identifier: Apache-2.0
// Run only after the independent ACL-1 tests pass. Uses public CLI operations for the workflow.
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const root=process.cwd(),proof=join(root,'artifacts/acl-1'),exec=promisify(execFile),launcher=[process.execPath,'--import','tsx',join(root,'src/cli.ts')],commands=[];
await mkdir(proof,{recursive:true});const directory=await mkdtemp(join(proof,'workflow-'));
async function command(args,expectedExit=0){
  let stdout,stderr,exit=0;try{({stdout,stderr}=await exec(launcher[0],[...launcher.slice(1),...args],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:2*1024*1024}));}catch(e){({stdout,stderr}=e);exit=e.code;}
  const result=JSON.parse(stdout||stderr);commands.push({args,exit,result,stderr});assert.equal(exit,expectedExit,stderr);return result;
}
const outputs={};
for(const name of ['lyon','bindings']){
  const project=join(directory,name);await mkdir(project);const entry=join(project,'project.tsx'),catalog=join(root,'examples/rust-bindgen',name);
  const consumer=await exec(process.execPath,[join(root,'scripts/acl-1-consumer.mjs'),project,catalog,name,entry],{cwd:root,env:{...process.env,FRAMEWEAVE_CLI_JSON:JSON.stringify(launcher)},windowsHide:true,timeout:90000,maxBuffer:2*1024*1024});
  const acquired=JSON.parse(consumer.stdout);assert.equal(acquired.ok,true);assert.equal(acquired.availability.installed,false);assert.equal(acquired.parameterSchemaVersion,2);
  const install=acquired.commands.install;assert.equal(install.executable,'frameweave');assert.ok(install.requiresSourceApproval);
  // The test explicitly approves only our known checked-in examples, never arbitrary search results.
  assert.ok(install.args.includes('local:frameweave.examples'));assert.ok(install.args.includes(resolve(catalog)));
  await command(install.args);await command(['effects','lock','--project',entry]);await command(['packages','verify','--project',entry]);
  const inspected=await command(['capabilities','inspect',acquired.identity.reference,'--integrity',acquired.identity.integrity,'--project',entry,'--json']);assert.equal(inspected.data.locks.plugin,'verified');assert.equal(inspected.data.locks.package,'verified');assert.equal(inspected.data.availability.installed,true);assert.equal(inspected.data.availability.runtimeVerified,false);
  const before=await readFile(join(project,'frameweave.plugins.lock.json'));await command(['capabilities','examples',acquired.identity.reference,'--project',entry,'--json']);assert.deepEqual(await readFile(join(project,'frameweave.plugins.lock.json')),before);
  await command(['frame',entry,'--frame','0','--output',join(directory,`${name}-denied.png`),'--json'],1);
  const png=join(directory,`${name}-6.png`),storyboard=join(directory,`${name}-storyboard.png`),video=join(directory,`${name}.mp4`);
  await command(['frame',entry,'--frame','6','--allow-wasm','--no-cache','--output',png,'--json']);
  await command(['storyboard',entry,'--frames','0,6,11,3','--allow-wasm','--no-cache','--output',storyboard,'--json']);
  const rendered=await command(['render',entry,'--allow-wasm','--no-cache','--output',video,'--json']);assert.equal(rendered.metadata.frames,12);assert.equal(rendered.metadata.decodable,true);
  const repeats=join(directory,`${name}-repeat.png`);await command(['frame',entry,'--frame','6','--allow-wasm','--no-cache','--output',repeats,'--json']);assert.deepEqual(await sharp(png).raw().toBuffer(),await sharp(repeats).raw().toBuffer());
  outputs[name]={identity:acquired.identity,consumer:acquired,inspected,png,storyboard,video,metadata:rendered.metadata,repeatPixelsEqual:true};
}
await writeFile(join(proof,'workflow.json'),JSON.stringify({passed:true,directory,outputs,commands},null,2));console.log(JSON.stringify({passed:true,directory,modules:Object.keys(outputs),commands:commands.length}));
