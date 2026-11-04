import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {exportProject} from '../src/compiler/export.ts';
import {buildProject} from '../src/compiler/build.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';

const base=resolve('artifacts/main-editing-round1'),out=join(base,'boundaries-'+Date.now()),origin=join(out,'origin');await mkdir(origin,{recursive:true});
const source=await readFile('modules/editing/examples/cuts.tsx','utf8');
for(const name of ['footage.mp4','badge.png'])await copyFile(join('modules/editing/examples',name),join(origin,name));
await writeFile(join(out,'outside.ts'),'export const outsideFps=24;\n');
const entry=join(origin,'private-neighbour.tsx');await writeFile(entry,"import {outsideFps} from '../outside.ts';\n"+source.replace('fps:24','fps:outsideFps'));
await assert.rejects(exportProject(entry,{output:join(out,'should-not-export')}),e=>e.code==='E_EXPORT_DEPENDENCY'&&e.message.includes('outside.ts'));
const tampered=join(origin,'wrong-sdk.tsx');await writeFile(tampered,'export const frameweaveRuntime='+JSON.stringify({schemaVersion:1,runtime:{...runtimePin,integrity:'0'.repeat(64)},packages:{}})+' as const;\n'+source);
await assert.rejects(buildProject(tampered),{code:'E_RUNTIME_LOCK'});
const nodeStage=join(origin,'node-in-stage.tsx');await writeFile(nodeStage,`import{Composition,Stage,Layer,ref}from'@frameweave/engine';import{defineNativeStage}from'@frameweave/engine/native';import{inspectFootage}from'@frameweave/engine/editing/node';export const invalid=defineNativeStage(async()=>{const value=await inspectFootage('forbidden','./footage.mp4');return{renderAt(){throw Error(String(value.asset.width))}}});export default <Composition width={16} height={8} fps={24} durationInFrames={1}><Stage id="bad" factory={invalid}/><Layer source={ref('bad')}/></Composition>;`);
await assert.rejects(buildProject(nodeStage),e=>e.code==='E_COMPILE'&&/node:|Could not resolve|builtin/i.test(e.message));
await writeFile(join(base,'boundaries.json'),JSON.stringify({ok:true,runtimePin,checks:['private neighbouring source remains outside export authority','incorrect runtime pin rejected before evaluation','Node-only editing entry rejected in Native Stage']},null,2)+'\n');console.log('PASS 3 SDK/export permission boundaries');
