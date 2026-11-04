/** Additional official colorimetric display profile. The ACES2 failure stays
 * in the original strict verifier/campaign, never replaced or relabelled. */
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {prepareOcio,type OcioRequest} from '../closure-filters/ocio/prepare.ts';
const requests=JSON.parse(await readFile('modules/native-effects/closure-filters/fixtures/requests.json','utf8')) as OcioRequest[];
const request={...requests[1],view:'Video (colorimetric)'};
const value=await prepareOcio(request,{projectRoot:resolve('.'),outputDirectory:process.env.FRAMEWEAVE_CLOSURE_IMAGE_RUN!,python:process.env.FRAMEWEAVE_MEDIA_PYTHON!,compiler:resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe')});
await writeFile('modules/native-effects/closure-images/display-profile.json',JSON.stringify({request,processor:value}));
