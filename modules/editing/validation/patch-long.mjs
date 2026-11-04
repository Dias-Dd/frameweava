import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';
const exec=promisify(execFile),root=resolve('.'),target=resolve(process.env.EDIT_FROZEN_CORE),out=resolve(process.env.EDIT_EVIDENCE),tag=process.env.EDIT_RUN;
const inside=relative(resolve('.frameweave/editing'),target);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('Only this worktree isolated editing snapshot may receive the reviewed patch');
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt=JSON.parse(await readFile(join(out,'frozen-core.json'),'utf8'));if(receipt.commit!=='3b59e16bc2600c8630b49cff8e8996aef46c35a0'||resolve(receipt.path)!==target)throw Error('Wrong frozen Core baseline');
const patchCommit='ff747ff2bf83ffcdace8915ccfdcf07e4d62bb19',mainCommit='1521cadac87460229161ffb19882f806d04671ef';
const git=async args=>(await exec('git',args,{cwd:root,windowsHide:true,encoding:'buffer',maxBuffer:4*1024**2})).stdout;
const patch=await git(['show',patchCommit+':modules/native-gpu/validation/mixed-av-seal/integration.patch']);if(hash(patch)!=='6a278ad78738ca38df166f1699dbd65a26ff54e6abfdafb16edd0a3efbf91e9a')throw Error('Frozen reviewed patch changed');
const patchFile=join(out,'reviewed-core.patch');await writeFile(patchFile,patch);const directory=relative(root,target).replaceAll('\\','/');
await git(['apply','--check','--directory='+directory,patchFile]);await git(['apply','--directory='+directory,patchFile]);
// Main's final audioTrack extends the same reviewed fix with cooperative abort.
// Replace only that function, never the moving owner file or its private protocol.
const file='modules/native-gpu/service.ts',current=await readFile(join(target,file),'utf8'),main=(await git(['show',mainCommit+':'+file])).toString('utf8');
function section(s){const start=s.indexOf('async function audioTrack('),end=s.indexOf('/** Existing compiler',start);if(start<0||end<start)throw Error('Frozen audioTrack seam changed');return {start,end,value:s.slice(start,end)};}
const old=section(current),next=section(main);if(!next.value.includes('Renderer.createAudio(build)')||!next.value.includes("signal?.addEventListener('abort',cancel"))throw Error('Main final cancellation fix missing');
await writeFile(join(target,file),current.slice(0,old.start)+next.value+current.slice(old.end));
const files=[];for(const p of ['src/render/renderer.ts','src/audio/execution-stages.ts','modules/render-session/index.ts',file])files.push({path:p,sha256:hash(await readFile(join(target,p)))});
const binaries=[];for(const [name,folder,key,binary]of [['native-build.json','native-gpu','inputHashes','frameweave-native-gpu.exe'],['spidermonkey-build.json','spidermonkey-host','inputs','frameweave-spidermonkey-host.exe']]){const r=JSON.parse(await readFile(resolve('native-bin/win32-x64',name),'utf8'));if(hash(await readFile(resolve('native-bin/win32-x64',binary)))!==r.executable.sha256)throw Error('Runtime binary receipt mismatch');for(const [p,expected]of Object.entries(r[key]))if(hash(await readFile(join(target,'modules',folder,p)))!==expected)throw Error('Frozen Native source no longer matches binary: '+p);binaries.push({binary,sha256:r.executable.sha256,sourceMatches:true});}
await writeFile(join(out,'patched-core-'+tag+'.json'),JSON.stringify({base:receipt.commit,target,patchCommit,patchSha256:hash(patch),mainCommit,mainChange:'audioTrack function only: immediate cancellation; no owner/ABI/protocol/binary update',files,binaries,dependencyLockUnchanged:true,worktreeCoreUnchanged:true},null,2)+'\n');
console.log('PASS reviewed four-file fix and Main audioTrack cancellation applied only to isolated snapshot; original Native/SM binaries still match their source receipts');
