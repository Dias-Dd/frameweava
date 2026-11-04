import {resolve,join} from 'node:path';import {writeFile,readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {prepareRotoAssets} from './model-assets.ts';import {prepareImageAsset} from './node.ts';import {parseRotoBundle} from '../roto-authoring/neural.ts';
const root=resolve('.frameweave/roto-models/slimsam-c16'),out=resolve('modules/native-effects/authoring/examples/.generated-roto');
const result=await prepareRotoAssets({bundle:join(root,'bundle.json'),encoder:join(root,'encoder.onnx'),decoder:join(root,'decoder.onnx')},out);
assert.deepEqual(parseRotoBundle(JSON.parse(await readFile(result.bundle,'utf8'))),parseRotoBundle(JSON.parse(await readFile('modules/native-effects/authoring/examples/assets/slimsam-bundle.json','utf8'))));
// Existing local private QA image only, never downloaded/shipped by this entry.
const photo=resolve('.frameweave/frozen-native-inference/sdk-bd188034/modules/native-effects/roto-authoring/model/corgi.jpg'),image=await prepareImageAsset(photo,join(out,'photo.f32'));
await writeFile(join(process.env.FRAMEWEAVE_AUTHORING_RUN!,'result.json'),JSON.stringify({ok:true,models:result,image,policy:'Own-worktree model DATA and QA photograph only. No frozen SDK/runtime code copied; current native-bin GPU/JS hosts used.'},null,2)+'\n');
