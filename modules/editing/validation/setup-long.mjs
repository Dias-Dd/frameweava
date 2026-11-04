import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,readdir,copyFile,stat,cp} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
const exec=promisify(execFile),root=resolve('.'),target=resolve(process.env.EDIT_FROZEN_CORE),out=resolve(process.env.EDIT_EVIDENCE),commit='3b59e16bc2600c8630b49cff8e8996aef46c35a0',archive=target+'.tar';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.includes('--supplement')){
 const extra=target+'-supplement.tar';await exec('git',['archive','--format=tar','--output',extra,commit,'plugins','bin','licenses','examples'],{cwd:root,windowsHide:true,timeout:30000});await exec('tar',['-xf',extra,'-C',target],{cwd:root,windowsHide:true,timeout:30000});
 for(const name of ['vendor','licenses'])await cp(resolve('modules/editing',name),join(target,'modules/editing',name),{recursive:true});
 await writeFile(join(out,'frozen-core-supplement-'+process.env.EDIT_RUN+'.json'),JSON.stringify({commit,archiveSha256:hash(await readFile(extra)),paths:['plugins','bin','licenses','examples'],editingOverlay:['vendor','licenses'],reason:'Complete SDK Runtime Pin and CLI Analysis imports plus current editing vendor source; no pin or lock changed.'},null,2)+'\n');process.exit(0);
}
const lock=(await exec('git',['show',commit+':package-lock.json'],{cwd:root,encoding:'buffer',windowsHide:true,maxBuffer:8*1024**2})).stdout;
if(hash(lock)!==hash(await readFile('package-lock.json')))throw Error('Frozen Core dependencies differ: provide an isolated installed delivery');
try{await stat(target);throw Error('Frozen validation directory exists; never silently replace it');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(target,{recursive:true});
await exec('git',['archive','--format=tar','--output',archive,commit,'src','modules','scripts','plugins','bin','licenses','examples','package.json','package-lock.json','tsconfig.json','LICENSE','NOTICE'],{cwd:root,windowsHide:true,timeout:30000});
await exec('tar',['-xf',archive,'-C',target],{cwd:root,windowsHide:true,timeout:30000});
const overlay=[];for(const file of await readdir('modules/editing'))if(file.endsWith('.ts')){const data=await readFile(join('modules/editing',file));await copyFile(join('modules/editing',file),join(target,'modules/editing',file));overlay.push({file,sha256:hash(data)});}
for(const name of ['vendor','licenses'])await cp(resolve('modules/editing',name),join(target,'modules/editing',name),{recursive:true});
const binaries=[];for(const [directory,receiptName,binaryName,key]of [['native-gpu','native-build.json','frameweave-native-gpu.exe','inputHashes'],['spidermonkey-host','spidermonkey-build.json','frameweave-spidermonkey-host.exe','inputs']]){
 const bin=resolve('native-bin/win32-x64',binaryName),receipt=JSON.parse(await readFile(resolve('native-bin/win32-x64',receiptName),'utf8')),sha256=hash(await readFile(bin));if(sha256!==receipt.executable.sha256)throw Error('Runtime receipt mismatch');
 const differences=[];for(const [file,expected]of Object.entries(receipt[key]??{})){try{if(hash(await readFile(join(target,'modules',directory,file)))!==expected)differences.push(file);}catch{differences.push(file+':not-in-snapshot');}}
 binaries.push({file:bin,sha256,receipt:receiptName,frozenSourceDifferences:differences});
}
await writeFile(join(out,'frozen-core.json'),JSON.stringify({commit,archiveSha256:hash(await readFile(archive)),path:target,dependencyLockUnchanged:true,sourceOverlay:overlay,binaries,scope:'Frozen committed Core source inside Agent-4; current editing source overlay; own ancestor node_modules. Not an installed Engine distribution or worktree synchronization.'},null,2)+'\n');
console.log(JSON.stringify({commit,target,overlayFiles:overlay.length,binaries}));
