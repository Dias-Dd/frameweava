import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readPackage} from '../src/packages/manifest.ts';
import {buildNativeImagePackage} from '../modules/native-effects/scripts/build-package.ts';

test('formal Native package keeps a complete typed public boundary and immutable source provenance',async()=>{
 const base=resolve('.frameweave/main-native-effects');await mkdir(base,{recursive:true});
 const path=join(await mkdtemp(join(base,'package-')),'native-image-effects');
 await buildNativeImagePackage(path);const record=await readPackage(path);
 assert.equal(record.manifest.id,'native-image-effects');assert.equal(record.manifest.version,'0.4.0');
 assert.equal(record.manifest.bindings?.schemaVersion,2);assert.equal(record.manifest.bindings?.gpuApi,'native-wgpu');
 assert.deepEqual(record.manifest.permissions,{filesystem:false,network:false,process:false});
 const entry=join(path,record.manifest.modules.bindings.path),source=await readFile(entry,'utf8');
 assert.ok(entry.endsWith('.ts'));assert.match(source,/createNativeRasterEffects/);
 assert.doesNotMatch(source,/from\s+["']node:/);assert.match(source,/from ["']@frameweave\/engine["']/);
 const inputs=JSON.parse(await readFile(join(path,'source-integrity.json'),'utf8'));
 assert.ok(inputs.sources['modules/native-effects/images.ts']);
 assert.ok(inputs.sources['modules/gpu-image-effects/resident/creative/kernels.ts']);
 assert.ok(inputs.sources['modules/gpu-image-effects/resident/blends/kernels.ts']);
 assert.ok(inputs.sources['modules/native-effects/raster/filters.ts']);
 assert.ok(inputs.sources['modules/native-effects/pa/filters.ts']);
 assert.ok(inputs.sources['modules/native-effects/pa/kernels.ts']);
 assert.ok(!Object.keys(inputs.sources).some(p=>/gpu-effects\/(?:core|pixel-scope)\.ts$/.test(p)),'device owner stays in the official SDK');
 assert.ok(Object.keys(inputs.sources).length>20);
 assert.ok((await readdir(join(path,'provenance/creative/vendor'))).includes('LICENSE-MIT'));
 await assert.rejects(buildNativeImagePackage(path),/immutable/);
 // A changed source archive must fail before any package output is admitted;
 // malformed capability claims are covered by the existing native R1 suite.
 await writeFile(entry,source+'\n// changed snapshot');
 assert.notEqual((await readPackage(path)).integrity,record.integrity);
});
