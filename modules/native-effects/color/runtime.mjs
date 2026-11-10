import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {verifyRuntime} from '../pa/runtime-proof.mjs';
const source='C:/Users/ASUS/Documents/Codex/2026-10-28/referenced-chatgpt-conversation-this-is-an/outputs/frameweave-engine/.frameweave/native-target/release/frameweave-native-gpu.exe';
const proof=await verifyRuntime(source,false);
if(proof.sha256!=='5e62f78d4c0845dae8a915a0079b24adb5865374a76982b9070fba12c6e671e2')throw Error('Not the frozen delivery explicitly offered by Main');
const dir=resolve('.frameweave/native-deliveries/b8282e8');await mkdir(dir,{recursive:true});const target=join(dir,'frameweave-native-gpu.exe');await writeFile(target,await readFile(source));await writeFile(join(dir,'native-build.json'),await readFile(join(dirname(source),'native-build.json')));await verifyRuntime(target,false);
await writeFile(join(process.env.FRAMEWEAVE_NATIVE_EFFECTS_RUN,'runtime.json'),JSON.stringify({source:proof,target,policy:'Frozen executable and receipt delivery only; no shared build cache/dependencies/outputs'},null,2)+'\n');console.log(JSON.stringify({copied:true,target}));
