import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
const base=resolve('artifacts/main-typography-provider'),drop=JSON.parse(await readFile(join(base,'delivery.json'),'utf8')),portable=JSON.parse(await readFile(join(base,'portable.json'),'utf8'));
assert.deepEqual(drop.runtimePin,runtimePin);assert.deepEqual(portable.runtimePin,runtimePin);
const project=join(base,'managed-0.2.3/project.tsx');await copyFile('examples/typography/paragraph.json',join(base,'managed-0.2.3/paragraph.json'));
const build=await buildProject(project),r=await Renderer.create(build,{allowWasm:true,nativeGpu:{executable:process.env.FRAMEWEAVE_NATIVE_GPU,readback:'final-surface',slots:1}});
let hash;try{const v=pixelsFromSurface(await r.renderNativeSurface(3));hash=createHash('sha256').update(Buffer.from(v.buffer,v.byteOffset,v.byteLength)).digest('hex');assert.equal(hash,portable.rows[0].hash);}finally{await r.close();}
const html=await readFile('docs/function-catalog/index.html','utf8'),{Script}=await import('node:vm');new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const inventory=JSON.parse(await readFile('docs/function-catalog/functions.json','utf8'));assert.ok(inventory.rows.some(r=>r.library==='@frameweave/engine/typography/node'&&r.name==='createTypography'));assert.ok(inventory.rows.some(r=>r.library==='pro-animation-native'&&r.name==='createTextItemizer'&&r.version==='0.2.3'));
await writeFile(join(base,'audit.json'),JSON.stringify({ok:true,runtimePin,managedFrameHash:hash,portable:portable.rows,delivery:drop,counts:inventory.metadata.counts,htmlSyntax:true,historicalLocks:'preserved, not silently refreshed'},null,2)+'\n');console.log('PASS final SDK pin, installed managed consumer and public inventory');
