import assert from 'node:assert/strict';import {readFile,access,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {prepareImageAsset} from './node.ts';
const out=resolve(process.env.FRAMEWEAVE_AUTHORING_RUN!),base=resolve('modules/native-effects/authoring/examples/assets'),existing=join(base,'input.f32'),before=await readFile(existing);
await assert.rejects(prepareImageAsset(join(base,'input.surface.json'),existing),{code:'E_IMAGE_ASSET_EXISTS'});assert.deepEqual(await readFile(existing),before);
const impossible=join(out,'lossy-alpha.f32');await assert.rejects(prepareImageAsset(join(base,'input.surface.json'),impossible,{alpha:'straight'}),{code:'E_IMAGE_ASSET_ALPHA'});await assert.rejects(access(impossible),{code:'ENOENT'});
await writeFile(join(out,'result.json'),JSON.stringify({ok:true,existingAssetUnchanged:true,lossyAlphaConversionRejected:true,noFailedOutput:true},null,2)+'\n');
