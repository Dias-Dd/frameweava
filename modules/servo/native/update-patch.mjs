// Maintainer-only: explicitly freeze reviewed changes in an owned Servo fork.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const [registryArg,forkArg,accept]=process.argv.slice(2);
if(!registryArg||!forkArg||accept!=='--accept-reviewed-source-revision')throw Error('Explicit registry, owned fork and --accept-reviewed-source-revision required');
const registry=resolve(registryArg),fork=resolve(forkArg),inside=relative(root,fork);if(inside.startsWith('..')||isAbsolute(inside))throw Error('Fork must be inside this worktree');
const metadata=JSON.parse(readFileSync(resolve(here,'upstream.json'),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
let patch='';const changed=[];
for(const item of metadata.patch.changed){
 const a=resolve(registry,item.file),b=resolve(fork,item.file),base=readFileSync(a);if(sha(base)!==item.upstreamSha256)throw Error('Upstream bytes changed; perform an upstream source audit: '+item.file);
 let diff;try{diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',a,b],{encoding:'utf8',maxBuffer:8*1024**2});}catch(error){if(error.status!==1)throw error;diff=error.stdout;}
 if(!diff)throw Error('Tracked patch unexpectedly disappeared: '+item.file);
 patch+=diff.replace(/^diff --git .*$/m,`diff --git a/${item.file} b/${item.file}`).replace(/^--- .*$/m,`--- a/${item.file}`).replace(/^\+\+\+ .*$/m,`+++ b/${item.file}`);
 changed.push({...item,patchedSha256:sha(readFileSync(b))});
}
writeFileSync(resolve(here,metadata.patch.file),patch);metadata.patch={...metadata.patch,sha256:sha(Buffer.from(patch)),changed};writeFileSync(resolve(here,'upstream.json'),JSON.stringify(metadata,null,2)+'\n');
// The developer deliberately revised an existing prepared source tree. Preserve
// the previous receipt hash rather than treating modified bytes as old inputs.
const work=resolve(fork,'..'),receipt=resolve(work,'prepared.json'),old=readFileSync(receipt),prepared=JSON.parse(old);
function files(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Source links forbidden');return e.isDirectory()?files(resolve(dir,e.name),prefix+e.name+'/'):[prefix+e.name];});}
prepared.sourceRevision=(prepared.sourceRevision??1)+1;prepared.previousPreparedSha256=sha(old);prepared.upstream=metadata;
prepared.sourceHashes=Object.fromEntries(files(fork).map(file=>[file,sha(readFileSync(resolve(fork,file)))]));
writeFileSync(receipt,JSON.stringify(prepared,null,2)+'\n');console.log(JSON.stringify({ok:true,sourceRevision:prepared.sourceRevision,patchSha256:metadata.patch.sha256}));
