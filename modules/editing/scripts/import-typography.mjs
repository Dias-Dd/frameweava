// Copies reviewed BUILD INPUTS into this worktree; never an R1 install or runtime cross-worktree import.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join,dirname,relative,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]??''),target=resolve('.frameweave/editing/typography-v2'),sha=b=>createHash('sha256').update(b).digest('hex');
if(!process.argv[2])throw Error('Pass the explicit reviewed typography delivery directory');
const receiptBytes=await readFile(join(source,'receipt.json')),receipt=JSON.parse(receiptBytes),rows=[];
const safe=(base,path)=>{const file=resolve(base,path),rel=relative(base,file);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Unsafe delivered path');return file;};
for(const kit of receipt.kits){if(!['font','itemizer','paths'].includes(kit.id))throw Error('Unexpected provider component');for(const row of kit.sourceChecks){if(sha(await readFile(resolve(row.path)))!==row.sha256)throw Error('Frozen source mismatch: '+row.path);}
 for(const [file,expected]of Object.entries(kit.files)){const bytes=await readFile(safe(join(source,kit.id),file));if(sha(bytes)!==expected)throw Error('Delivered component mismatch: '+file);const dest=safe(join(target,kit.id),file);await mkdir(dirname(dest),{recursive:true});try{const existing=await readFile(dest);if(!existing.equals(bytes))throw Error('Refusing to replace a different local provider artifact');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(dest,bytes,{flag:'wx'});}rows.push({kit:kit.id,path:file,sha256:expected});}
 const descriptor=await readFile(join(source,kit.id,'bundle.json'));await writeFile(join(target,kit.id,'bundle.json'),descriptor);
}
await writeFile(join(target,'receipt.json'),receiptBytes);await writeFile(join(target,'copied.json'),JSON.stringify({sourceReceiptSha256:sha(receiptBytes),status:'build inputs only; explicit local Node validation, not installed/trusted R1 identity',files:rows},null,2)+'\n');console.log(JSON.stringify({files:rows.length,target,receiptSha256:sha(receiptBytes)}));
