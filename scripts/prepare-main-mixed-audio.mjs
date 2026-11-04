// Adapt frozen qualification inputs to Main's own source/cache; never run a donor SDK.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/main-mixed-audio'),work=join(root,'.frameweave/main-mixed-audio');await mkdir(out,{recursive:true});await mkdir(work,{recursive:true});
const original=join(root,'modules/native-gpu/validation/mixed-av-seal');
let long=await readFile(join(original,'long-source.mjs'),'utf8');long=long.replace("sdk=resolve('.frameweave/mixed-av-seal/core')",`sdk=${JSON.stringify(root)}`).replace("dir=resolve('.frameweave/mixed-av-seal/project')",`dir=${JSON.stringify(join(work,'project'))}`).replace("out=resolve('artifacts/mixed-av-seal')",`out=${JSON.stringify(out)}`);
let cancel=await readFile(join(original,'cancel.mjs'),'utf8');cancel=cancel.replace("root=resolve('.frameweave/mixed-av-seal/core')",`root=${JSON.stringify(root)}`).replace("dir=resolve('.frameweave/mixed-av-seal/cancel')",`dir=${JSON.stringify(join(work,'cancel'))}`);
if(long.includes("sdk=resolve('.frameweave")||cancel.includes("root=resolve('.frameweave"))throw Error('Frozen source adaptation failed');await writeFile(join(out,'long.mjs'),long);await writeFile(join(out,'cancel.mjs'),cancel);console.log(JSON.stringify({sdk:root,work}));
