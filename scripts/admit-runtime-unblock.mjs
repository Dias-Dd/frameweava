import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
const root=resolve(import.meta.dirname,'..'),source='D:/frameweave-worktrees/agent-1/outputs/deliveries/servo-authoring-745f722c',out=join(root,'artifacts/main-runtime-unblock');await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),receipt=JSON.parse(await readFile(join(source,'native/native-build.json'),'utf8'));
if(receipt.profile!=='release'||receipt.features.length||receipt.executable.sha256!=='13b568f7f4e6af89320297b94bce5896da94084215187103765a2c8eca29115c')throw Error('Unexpected frozen Native runtime identity');
for(const [name,expected]of Object.entries(receipt.inputHashes)){const file=resolve(root,'modules/native-gpu',name),rel=relative(join(root,'modules'),file);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Runtime source receipt escapes modules');if(hash(await readFile(file))!==expected)throw Error('Frozen Native source mismatch: '+name);}
const nativeBytes=await readFile(join(source,'native/frameweave-native-gpu.exe'));if(hash(nativeBytes)!==receipt.executable.sha256)throw Error('Native executable integrity mismatch');
const runtime=JSON.parse(await readFile(join(source,'servo/servo-runtime.json'),'utf8'));if(runtime.files['frameweave_servo.dll']!=='f5cea7eeb9da349753af109e00b804ed8e0bf1203d538f9aba8f847f30db769b')throw Error('Servo identity mismatch');
for(const [file,expected]of Object.entries(runtime.files)){if(file.includes('/')||file.includes('\\')||hash(await readFile(join(source,'servo',file)))!==expected)throw Error('Servo runtime integrity mismatch');}
const backup=join(out,'runtime-backup-'+Date.now());
for(const dest of ['native-bin/win32-x64','.frameweave/native-target/release']){await mkdir(join(root,dest),{recursive:true});for(const file of ['frameweave-native-gpu.exe','native-build.json']){const target=join(root,dest,file);try{const prior=await readFile(target);await mkdir(join(backup,dest),{recursive:true});await writeFile(join(backup,dest,file),prior);}catch(e){if(e.code!=='ENOENT')throw e;}await copyFile(join(source,'native',file),target);}}
const servo=join(root,'native-bin/win32-x64/servo');await mkdir(servo,{recursive:true});for(const file of [...Object.keys(runtime.files),'servo-runtime.json'])await copyFile(join(source,'servo',file),join(servo,file));
await writeFile(join(out,'runtime.json'),JSON.stringify({source,nativeSha256:receipt.executable.sha256,servo,servoSha256:runtime.files['frameweave_servo.dll'],backup,inputHashes:receipt.inputHashes},null,2)+'\n');console.log(JSON.stringify({nativeSha256:receipt.executable.sha256,servo}));
