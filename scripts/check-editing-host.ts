import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {alias} from '../src/compiler/build.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
const out=resolve('artifacts/main-editing-round1');await mkdir(out,{recursive:true});
const target=join(out,'node-entry.mjs');
const bundled=await build({stdin:{contents:`import {inspectFootage} from '@frameweave/engine/editing/node';export const result=await inspectFootage('source','footage.mp4',{baseDirectory:${JSON.stringify(resolve('modules/editing/examples'))}});`,resolveDir:resolve('.')},outfile:target,alias,bundle:true,format:'esm',platform:'node',packages:'external',metafile:true});
const {result}=await import(pathToFileURL(target).href);assert.equal(result.asset.width,320);assert.equal(result.asset.height,180);assert.equal(result.asset.decoder,'cpu');
const pkg=JSON.parse(await readFile('package.json','utf8'));for(const name of ['editing','editing/node'])assert.ok(pkg.exports['./'+name]);
const inventory=JSON.parse(await readFile('docs/function-catalog/functions.json','utf8'));
for(const [library,names] of [['@frameweave/engine/editing',['video','image','clip','splitClip','sequence','at','frames','timeline','editComposition','editingStage','createEditingStage']],['@frameweave/engine/editing/node',['inspectFootage']]] as const)for(const name of names)assert.ok(inventory.rows.some((r:any)=>r.library===library&&r.name===name),name);
const distribution={qualified:false,reason:'not rebuilt in this focused integration'};
try{const receipt=JSON.parse(await readFile('.frameweave/native-target/release/native-build.json','utf8'));const {createHash}=await import('node:crypto');for(const [path,expected]of Object.entries(receipt.inputHashes))assert.equal(createHash('sha256').update(await readFile(join('modules/native-gpu',path))).digest('hex'),expected);distribution.reason='release source receipt matches; full npm packaging not run';}catch(e){distribution.reason=String(e);}
await writeFile(join(out,'host.json'),JSON.stringify({ok:true,runtimePin,asset:result.asset,publicExports:['editing','editing/node'],hostInputs:Object.keys(bundled.metafile!.inputs),distribution},null,2)+'\n');console.log(JSON.stringify({ok:true,host:true,inventory:true,distribution}));
