// Execute only for the fresh human authorization of 2026-11-04. No other worktree.
import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,copyFile,rename,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative,dirname,isAbsolute} from 'node:path';
const root=resolve(import.meta.dirname,'..'),agent=resolve('D:/frameweave-worktrees/agent-2');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:32*1024**2}).trim();
const checked=(base,file)=>{const path=resolve(file),rel=relative(base,path);if(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('Path escapes authorized workspace');return path;};
const hash=async file=>{const digest=createHash('sha256');for await(const b of createReadStream(file))digest.update(b);return digest.digest('hex');};
if(git(agent,'branch','--show-current')!=='agents/agent-2')throw Error('Unexpected Agent-2 branch');
if(git(agent,'diff','--name-only','HEAD')||git(agent,'diff','--cached','--name-only'))throw Error('Tracked Agent-2 work changed; preserve it before synchronization');
const before=git(agent,'rev-parse','HEAD'),target=git(root,'rev-parse','HEAD');git(root,'merge-base','--is-ancestor',before,target);
const tracked=new Set(git(root,'ls-tree','-rz','--name-only',target).split('\0').filter(Boolean));
const drafts=git(agent,'ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean),saved=[];
for(const path of drafts){const file=checked(agent,join(agent,path)),info=await stat(file);saved.push({path,bytes:info.size,mtimeMs:info.mtimeMs,.../\.(?:tsx?|m?js|json|wasm|wgsl|glsl)$/.test(path)?{sha256:await hash(file)}:{}});}
const backup=join(dirname(agent),'.main-sync-backups',new Date().toISOString().replaceAll(/[:.]/g,'-')+'-agent2');await mkdir(backup,{recursive:true});await writeFile(join(backup,'drafts-before.json'),JSON.stringify(saved,null,2));
const moved=[];for(const item of saved)if(tracked.has(item.path)){const from=checked(agent,join(agent,item.path)),to=checked(backup,join(backup,'collisions',item.path));await mkdir(dirname(to),{recursive:true});await rename(from,to);moved.push(item.path);}
git(agent,'merge','--ff-only',target);
const runtimes=[['native-bin/win32-x64',['frameweave-native-gpu.exe','native-build.json','frameweave-spidermonkey-host.exe','spidermonkey-build.json']],['native-bin/win32-x64/servo',['frameweave_servo.dll','frameweave_servo_bridge.dll','libEGL.dll','libGLESv2.dll','clock.js','servo-runtime.json']]];
for(const [directory,files]of runtimes){const dest=checked(agent,join(agent,directory));await mkdir(dest,{recursive:true});for(const file of files){const source=checked(root,join(root,directory,file)),to=checked(agent,join(dest,file));try{const previous=await readFile(to);if(await hash(source)!==createHash('sha256').update(previous).digest('hex')){const held=checked(backup,join(backup,'runtimes',directory,file));await mkdir(dirname(held),{recursive:true});await writeFile(held,previous);}}catch(e){if(e.code!=='ENOENT')throw e;}await copyFile(source,to);if(await hash(source)!==await hash(to))throw Error('Runtime copy mismatch');}}
for(const item of saved){const file=moved.includes(item.path)?join(backup,'collisions',item.path):join(agent,item.path),info=await stat(file);if(info.size!==item.bytes||item.sha256&&await hash(file)!==item.sha256)throw Error('Preserved draft changed: '+item.path);}
if(git(agent,'rev-parse','HEAD')!==target||git(agent,'diff','--name-only','HEAD'))throw Error('Tracked source differs after synchronization');
async function authority(base){const files=[];async function walk(dir,module){for(const entry of await readdir(join(base,dir),{withFileTypes:true})){if(module&&['tests','validation','node_modules','target'].includes(entry.name))continue;const name=dir+'/'+entry.name;if(entry.isDirectory())await walk(name,module);else if(!module||/\.(?:tsx?|m?js|json|wasm|wgsl|glsl)$/.test(entry.name)&&name!=='modules/shared-state/node.ts')files.push(name);}}for(const dir of ['src','plugins/builtin','modules'])await walk(dir,dir==='modules');return files.sort().concat(['package.json','package-lock.json','tsconfig.json']);}
const mainFiles=await authority(root),agentFiles=await authority(agent),extras=agentFiles.filter(f=>!mainFiles.includes(f));
for(const file of mainFiles)if(await hash(join(root,file))!==await hash(join(agent,file)))throw Error('Main SDK authority bytes differ: '+file);
const pin=async(base,files)=>{const digest=createHash('sha256');for(const file of files){digest.update(file).update('\0');for await(const bytes of createReadStream(join(base,file)))digest.update(bytes);digest.update('\0');}return digest.digest('hex');};
const receipt={authorizedAgent:2,before,after:target,backup,draftsPreserved:saved.length,collisionsArchived:moved,extraSdkDraftsRetained:extras,mainRuntimePin:await pin(root,mainFiles),agentRuntimePin:await pin(agent,agentFiles),historicalLocksRewritten:false,cachePolicy:'Own node_modules/.frameweave/output/work preserved; no cache links/copies',nativeSha256:await hash(join(agent,'native-bin/win32-x64/frameweave-native-gpu.exe'))};
await writeFile(join(backup,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await mkdir(join(root,'outputs/main-sync'),{recursive:true});await writeFile(join(root,'outputs/main-sync/agent2-latest.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
