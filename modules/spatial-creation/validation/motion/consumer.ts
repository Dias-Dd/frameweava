/** Current public CLI + carried declarations; not an independently packaged engine acceptance. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const pack=resolve(process.env.CREATION_PACKAGE??'.frameweave/spatial-creation/motion-package-001'),out=resolve(process.env.CREATION_EVIDENCE??'modules/spatial-creation/validation/motion/evidence'),run=resolve(process.env.CREATION_CONSUMER??'.frameweave/spatial-creation/motion-consumer-001'),exec=promisify(execFile);
await mkdir(run,{recursive:true});await copyFile(join(pack,'examples/motion-scene.tsx'),join(run,'scene.tsx'));
const cli=async(...args:string[])=>JSON.parse((await exec(process.execPath,['--import','tsx','src/cli.ts',...args],{timeout:100000,windowsHide:true,maxBuffer:6*1024**2})).stdout),entry=join(run,'scene.tsx');
const installed=await cli('packages','install',pack,'--project',entry,'--trust','local:frameweave.spatial-candidate');assert.equal(installed.roots['spatial-creation-candidate'],'spatial-creation-candidate@0.14.0');
await writeFile(join(run,'typed.ts'),`import {animateCreation,springInCreation,slideInCreation,staggerCreations,characterWave,floatCreation} from 'spatial-creation-candidate';
import {keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
export const shot=defineNativeStage(()=>animateCreation(characterWave(),{enter:{kind:'spring',duration:12,spring:{damping:18}},exit:{kind:'fade'},idle:{kind:'float',offset:[0,keyframes([{frame:0,value:2},{frame:23,value:8}])]}}));
export const sequence=defineNativeStage(()=>staggerCreations([characterWave(),characterWave()],{interval:3}));
// @ts-expect-error arbitrary time remapping is not an image entrance
springInCreation(characterWave(),{time:2});
// @ts-expect-error phase kind controls its legal fields
animateCreation(characterWave(),{enter:{kind:'fade',scale:2}});
// @ts-expect-error input must be a creator, not a GPU port name
slideInCreation('image');
// @ts-expect-error timing is immutable setup, not an animated Signal
slideInCreation(characterWave(),{duration:keyframes([{frame:0,value:12}])});
// @ts-expect-error offsets have two scalar components
floatCreation(characterWave(),{offset:[0,1,2]});
`);
const paths=Object.fromEntries(Object.entries({'@frameweave/engine':'src/index.ts','@frameweave/engine/native':'modules/native-gpu/authoring.ts','@frameweave/engine/web':'src/web/api.ts','@frameweave/engine/plugins':'src/plugins/sdk.ts','@frameweave/engine/graphics-contracts':'modules/graphics-contracts/index.ts','spatial-creation-candidate':join(pack,'api.d.ts')}).map(([key,file])=>[key,[resolve(file).replaceAll('\\','/')]]));
await writeFile(join(run,'tsconfig.json'),JSON.stringify({extends:resolve('tsconfig.json'),compilerOptions:{noEmit:true,allowImportingTsExtensions:true,paths},include:['scene.tsx','typed.ts'],exclude:[]}));await exec(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',join(run,'tsconfig.json'),'--pretty','false'],{timeout:45000,windowsHide:true,maxBuffer:2*1024**2});
const render=await cli('frame',entry,'--frame','12','--output',join(out,'consumer-12.png'),'--native',process.env.FRAMEWEAVE_NATIVE_GPU!,'--json');assert.equal(render.ok,true);const bytes=await readFile(join(out,'consumer-12.png'));assert.deepEqual(bytes,await readFile(join(out,'shot-12.png')));
await writeFile(join(out,'consumer.json'),JSON.stringify({onlyPublicEntryPoints:true,engineDistribution:'current checkout public CLI/SDK; independently packaged engine not tested',carriedDeclarationsTypeChecked:true,installed,render,identicalToVerifiedPNG:true,sha256:createHash('sha256').update(bytes).digest('hex')},null,2));console.log('PASS carried composition / public SDK types / public CLI install and frame / identical PNG');
