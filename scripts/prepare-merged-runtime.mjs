import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),target=join(root,'native-bin/win32-x64');
if(process.platform!=='win32'||process.arch!=='x64')throw Error('This frozen runtime delivery qualifies Windows x64 only');
const deliveries=[
 {file:'D:/frameweave-worktrees/agent-1/outputs/deliveries/inference-outputs-9dc5017c/native/frameweave-native-gpu.exe',receipt:'native-build.json',sha256:'efdb9d77fb8243c4cb1bc5c13a3bc23e93d88949f9b6164f676b54333541c3a1'},
 {file:'D:/frameweave-worktrees/agent-1/outputs/deliveries/native-capacity-5829f044/spidermonkey/frameweave-spidermonkey-host.exe',receipt:'spidermonkey-build.json',sha256:'85bd3e4b7bc799b7ef6469d72b9d2ceb556872952b2509306e0b0c36fa560e50'},
];
await mkdir(target,{recursive:true});const files=[];
for(const d of deliveries){const bytes=await readFile(d.file),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==d.sha256)throw Error('Frozen runtime integrity mismatch: '+d.file);const receipt=await readFile(join(dirname(d.file),d.receipt));const data=JSON.parse(receipt);if(data.executable?.sha256!==hash)throw Error('Runtime build receipt does not bind executable');const name=d.file.split('/').at(-1);await writeFile(join(target,name),bytes);await writeFile(join(target,d.receipt),receipt);files.push({file:name,sha256:hash,receipt:d.receipt,source:d.file});}
const mediaRoot='D:/frameweave-worktrees/agent-1/outputs/deliveries/native-capacity-5829f044/media',media=await readFile(join(mediaRoot,'frameweave_media.dll')),mediaHash=createHash('sha256').update(media).digest('hex'),mediaReceipt=await readFile(join(mediaRoot,'media-runtime.json'));
if(mediaHash!=='387332ffad8fd18ff60b9362db6a9c76f1d0d2d3734bed5b41996837f654a4e0'||JSON.parse(mediaReceipt).files?.['frameweave_media.dll']!==mediaHash)throw Error('Frozen media helper integrity mismatch');
await mkdir(join(target,'media'),{recursive:true});await writeFile(join(target,'media/frameweave_media.dll'),media);await writeFile(join(target,'media/media-runtime.json'),mediaReceipt);files.push({file:'media/frameweave_media.dll',sha256:mediaHash,receipt:'media/media-runtime.json',source:join(mediaRoot,'frameweave_media.dll')});
const out=join(root,'outputs/main-integration-20261103');await mkdir(out,{recursive:true});
await writeFile(join(out,'runtime-delivery.json'),JSON.stringify({version:1,scope:'reviewed project-local executable provisioning; no third-party model/DLL distribution',target,files},null,2)+'\n');
console.log(JSON.stringify({target,files:files.map(x=>({file:x.file,sha256:x.sha256}))}));
