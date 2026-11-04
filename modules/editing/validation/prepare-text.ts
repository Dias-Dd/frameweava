/** New user subtitle text -> original, explicitly authorized Rust/WASM -> existing paragraph geometry. */
import {readFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {validationTypography} from './typography-provider.ts';
import {prepareSubtitles} from '../node.ts';import {parseSubtitles} from '../subtitles.ts';
const out=resolve(process.env.EDIT_EVIDENCE!),font='.frameweave/editing/fonts/NotoSansSC.ttf';
await assert.rejects(validationTypography({allowWasm:false,width:640,height:360,font}),{code:'E_PACKAGE_PERMISSION'});
if(!process.argv.includes('--allow-wasm'))throw Error('Explicit --allow-wasm required for this local validation provider');
const provider=await validationTypography({allowWasm:true,width:640,height:360,font});
try{
 const source=await readFile('modules/editing/examples/captions.srt','utf8'),cues=parseSubtitles(source,{format:'srt'}),result=await prepareSubtitles(cues,{width:640,height:360,fps:24,services:provider.services,style:{fontSize:30}});
 const text='// Generated from the adjacent captions.srt by original font/itemization/path services. No raster pixels.\nimport type {EditTrack} from "../types.ts";\nexport const captionTracks='+JSON.stringify(result.tracks)+' as unknown as readonly EditTrack[];\n';
 await writeFile('modules/editing/examples/captions-prepared.ts',text);
 await writeFile(join(out,'preparation.json'),JSON.stringify({sourceSha256:createHash('sha256').update(source).digest('hex'),sourceFont:provider.source,cues,diagnostics:result.diagnostics,preparedSha256:createHash('sha256').update(text).digest('hex'),status:'real newly prepared user text; injected source services with explicit local WASM authorization; formal default Node provider pending'},null,2)+'\n');
}finally{await writeFile(join(out,'preparation-disposal.json'),JSON.stringify(await provider.dispose(),null,2)+'\n');}
