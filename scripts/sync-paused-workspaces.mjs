// Explicit human-authorized, one-time synchronization. No reset, link or delete.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,copyFile,rename,stat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:16*1024**2}).trim();
const worktrees=git(root,'worktree','list','--porcelain').split(/\r?\n\r?\n/);const agentDirectory=n=>{const record=worktrees.find(s=>s.includes('branch refs/heads/agents/agent-'+n+'\n')||s.endsWith('branch refs/heads/agents/agent-'+n));if(!record)throw Error('Missing agent worktree '+n);return record.split(/\r?\n/).find(s=>s.startsWith('worktree ')).slice(9);};
const target=git(root,'rev-parse','HEAD'),stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),backup=join(dirname(agentDirectory(1)),'.main-sync-backups',stamp);await mkdir(backup,{recursive:true});
const inside=(base,file)=>{const p=resolve(file),r=relative(resolve(base),p);if(r==='..'||r.startsWith('..\\')||r.startsWith('../')||isAbsolute(r))throw Error('Path escapes intended directory: '+p);return p;};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function inventory(base){const paths=[];async function walk(dir,modules){for(const e of await readdir(join(base,dir),{withFileTypes:true})){if(modules&&['tests','validation','node_modules','target'].includes(e.name))continue;const p=dir+'/'+e.name;if(e.isDirectory())await walk(p,modules);else if(!modules||/\.(?:tsx?|m?js|json|wasm|wgsl|glsl)$/.test(e.name)&&p!=='modules/shared-state/node.ts')paths.push(p);}}
 for(const dir of ['src','plugins/builtin','modules'])await walk(dir,dir==='modules');return paths.sort().concat(['package.json','package-lock.json','tsconfig.json']);}
const mainFiles=await inventory(root),hashes=new Map(await Promise.all(mainFiles.map(async p=>[p,sha(await readFile(join(root,p)))])));
// Copy the frozen Deep codec only after exact current source and artifact checks.
const deep=resolve(agentDirectory(1),'outputs/deliveries/deep-exr-3a1e1e2c'),deepReceipt=JSON.parse(await readFile(join(deep,'deep-build.json'),'utf8'));
if(deepReceipt.executable.sha256!=='2d60c1db3709479dee79f6a573337de08a79b93885b15b3fd4821cef6fec069f'||sha(await readFile(join(deep,'frameweave-deep-exr.exe')))!==deepReceipt.executable.sha256)throw Error('Frozen Deep codec identity mismatch');
for(const [p,hash]of Object.entries(deepReceipt.inputs))if(sha(await readFile(inside(root,join(root,p))))!==hash)throw Error('Deep codec source mismatch '+p);
const runtimeSets=[{source:join(root,'.frameweave/native-target/release'),dest:'.frameweave/native-target/release',files:['frameweave-native-gpu.exe','native-build.json'],receipt:'native-build.json'},
 {source:join(root,'.frameweave/spidermonkey-target/debug'),dest:'.frameweave/spidermonkey-target/debug',files:['frameweave-spidermonkey-host.exe','spidermonkey-build.json'],receipt:'spidermonkey-build.json'},
 {source:deep,dest:'.frameweave/deep-exr/build/Release',files:['frameweave-deep-exr.exe','deep-build.json'],receipt:'deep-build.json'}];
for(const runtime of runtimeSets){const receipt=JSON.parse(await readFile(join(runtime.source,runtime.receipt),'utf8'));if(sha(await readFile(join(runtime.source,runtime.files[0])))!==receipt.executable.sha256)throw Error('Runtime binary hash mismatch');}
// Main gets the same reviewed optional codec, without changing process/global env.
await mkdir(join(root,runtimeSets[2].dest),{recursive:true});for(const f of runtimeSets[2].files)await copyFile(join(deep,f),join(root,runtimeSets[2].dest,f));
const rows=[];
for(const n of [1,2,3,4]){
 const worktree=resolve(agentDirectory(n)),save=join(backup,'agent-'+n);await mkdir(save,{recursive:true});const before=git(worktree,'rev-parse','HEAD');git(root,'merge-base','--is-ancestor',before,target);
 const patch=git(worktree,'diff','--binary','HEAD'),index=git(worktree,'diff','--cached','--binary');let stash;
 if(patch||index){await writeFile(join(save,'working.patch'),patch+'\n');await writeFile(join(save,'index.patch'),index+'\n');git(worktree,'stash','push','-m','paused-main-sync-'+stamp);stash=git(worktree,'rev-parse','stash@{0}');}
 const future=new Set(git(root,'ls-tree','-rz','--name-only',target).split('\0').filter(Boolean)),untracked=git(worktree,'ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean),moved=[];
 for(const name of untracked)if(future.has(name)||[...future].some(p=>p.startsWith(name+'/'))){const from=inside(worktree,join(worktree,name)),to=inside(save,join(save,'untracked',name));await mkdir(dirname(to),{recursive:true});await rename(from,to);moved.push(name);}
 git(worktree,'merge','--ff-only',target);
 // Runtime Pin also includes generated/ignored module authority files. Archive
 // extras and carry the Main bytes rather than pretending equal HEAD means equal SDK.
 const actual=await inventory(worktree),extra=[];for(const p of actual)if(!hashes.has(p)){const from=inside(worktree,join(worktree,p)),to=inside(save,join(save,'sdk-drafts',p));await mkdir(dirname(to),{recursive:true});await rename(from,to);extra.push(p);}
 const copied=[];for(const [p,hash]of hashes){const file=inside(worktree,join(worktree,p));let current;try{current=await readFile(file);}catch{}if(!current||sha(current)!==hash){if(current){const old=inside(save,join(save,'sdk-previous',p));await mkdir(dirname(old),{recursive:true});await writeFile(old,current);}await mkdir(dirname(file),{recursive:true});await copyFile(join(root,p),file);copied.push(p);}}
 for(const runtime of runtimeSets){const dest=inside(worktree,join(worktree,runtime.dest));await mkdir(dest,{recursive:true});for(const file of runtime.files){const to=join(dest,file);try{const old=await readFile(to);if(sha(old)!==sha(await readFile(join(runtime.source,file)))){const prev=join(save,'runtimes',file);await mkdir(dirname(prev),{recursive:true});await writeFile(prev,old);}}catch(e){if(e.code!=='ENOENT')throw e;}await copyFile(join(runtime.source,file),to);}}
 for(const runtime of runtimeSets.slice(0,2)){const dest=inside(worktree,join(worktree,'native-bin',process.platform+'-'+process.arch));await mkdir(dest,{recursive:true});for(const file of runtime.files)await copyFile(join(runtime.source,file),join(dest,file));}
 const after=git(worktree,'rev-parse','HEAD'),dirty=git(worktree,'diff','--name-only','HEAD');if(after!==target||dirty)throw Error('Tracked worktree differs after synchronization: agent-'+n+' '+dirty);
 const row={agent:n,before,after,stash:stash??null,collidingUntrackedMoved:moved,extraSdkDraftsArchived:extra,sdkAuthorityFilesCopied:copied,backup:save,runtimes:runtimeSets.map(r=>r.dest)};rows.push(row);await writeFile(join(save,'receipt.json'),JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify({agent:n,head:after,stash:stash??null,archivedSdkFiles:extra.length,copiedSdkFiles:copied.length}));
}
const receipt={main:target,synchronizations:1,rows,note:'No agents were resumed; tracked drafts stay in named stashes. Non-conflicting untracked evidence remains.'};await writeFile(join(backup,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await mkdir(join(root,'outputs/main-sync'),{recursive:true});await writeFile(join(root,'outputs/main-sync/latest.json'),JSON.stringify({main:target,receipt:join(backup,'receipt.json')},null,2)+'\n');console.log(JSON.stringify({ok:true,target,receipt:join(backup,'receipt.json')}));
