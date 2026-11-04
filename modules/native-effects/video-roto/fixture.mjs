/** Development QA only. Copies verified derived assets within THIS worktree. */
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]),out=resolve('modules/native-effects/video-roto/model'),bundle=JSON.parse(await readFile(join(source,'bundle.json'),'utf8'));await mkdir(out,{recursive:true});
// Explicit descriptor correction for development export-3: ONNX graph inspection
// proves that unused high0/high1 seed inputs are pruned. Model bytes unchanged.
bundle.seed.inputs=bundle.seed.inputs.filter(t=>['features','authored'].includes(t.name));
for(const role of ['vision','seed','track']){const bytes=await readFile(join(source,role+'.onnx')),pin=bundle[role].model;if(bytes.length!==pin.bytes||createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw Error('Derived content identity differs');await copyFile(join(source,role+'.onnx'),join(out,role+'.onnx'));}
await writeFile(join(out,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');await copyFile(resolve('.frameweave/source-intake/slimsam/corgi.jpg'),join(out,'corgi.jpg'));
await writeFile(join(out,'fixture-only.json'),JSON.stringify({runtimeVerified:false,source,photo:'QA only, inherited pinned SlimSAM source intake; never part of a distributable module'},null,2)+'\n');console.log(JSON.stringify({prepared:true,runtimeVerified:false}));
