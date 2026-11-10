// Restricted, human-authorized backport: frozen ORT shutdown fix only.
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
const root=resolve(import.meta.dirname,'..'),agent='D:/frameweave-worktrees/agent-3';
const source='cf214adb3c0453dcba6af828c8456363e682f31c',expected='49608c4a62c8623bc599ddf4b087c2791ef71e88';
const files=['modules/native-gpu/logic-host.ts','src/render/renderer.ts'];
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:32*1024**2}).trim();
const gitBytes=(cwd,...args)=>execFileSync('git',args,{cwd,windowsHide:true,maxBuffer:32*1024**2});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashFile=async file=>{const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');};
const inside=(base,file)=>{const path=resolve(base,file),rel=relative(resolve(base),path);if(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('Path escapes intended workspace');return path;};
if(git(agent,'branch','--show-current')!=='agents/agent-3'||git(agent,'rev-parse','HEAD')!==expected)throw Error('Agent-3 moved from authorized frozen checkpoint');
if(git(agent,'diff','--cached','--name-only')||git(agent,'diff','HEAD','--name-only','--',...files))throw Error('Target Core/index has unreviewed work');
const prior=gitBytes(agent,'diff','--binary','HEAD'),dirtyNames=git(agent,'diff','--name-only','HEAD').split(/\r?\n/).filter(Boolean);
const extraDrafts=['modules/native-effects/spherical/analyze-retained.ts','modules/gpu-image-effects/validation/inner-shadow-reference.ts'];
const protectedFiles=[...dirtyNames,...extraDrafts];const protectedHashes={};for(const file of protectedFiles)protectedHashes[file]=await hashFile(inside(agent,file));
const backup=resolve('D:/frameweave-worktrees/.main-sync-backups',new Date().toISOString().replaceAll(/[:.]/g,'-')+'-agent3-ort');await mkdir(backup,{recursive:true});await writeFile(join(backup,'working-before.patch'),prior);
async function authority(base){const result=[];async function walk(directory,modules){for(const entry of await readdir(join(base,directory),{withFileTypes:true})){if(modules&&['tests','validation','node_modules','target'].includes(entry.name))continue;const name=directory+'/'+entry.name;if(entry.isDirectory())await walk(name,modules);else if(!modules||/\.(?:tsx?|m?js|json|wasm|wgsl|glsl)$/.test(entry.name)&&name!=='modules/shared-state/node.ts')result.push(name);}}for(const directory of ['src','plugins/builtin','modules'])await walk(directory,directory==='modules');return result.sort().concat(['package.json','package-lock.json','tsconfig.json']);}
async function pinAndHashes(){const paths=await authority(agent),digest=createHash('sha256'),hashes={};for(const file of paths){const bytes=await readFile(join(agent,file));digest.update(file).update('\0').update(bytes).update('\0');hashes[file]=hash(bytes);}return {pin:digest.digest('hex'),hashes};}
const before=await pinAndHashes();
const native=JSON.parse(await readFile(join(agent,'native-bin/win32-x64/native-build.json'),'utf8')),sm=JSON.parse(await readFile(join(agent,'native-bin/win32-x64/spidermonkey-build.json'),'utf8'));
for(const [file,expectedHash]of Object.entries(native.inputHashes))if(await hashFile(inside(join(agent,'modules'),resolve(agent,'modules/native-gpu',file)))!==expectedHash)throw Error('Existing Native runtime/source mismatch: '+file);
for(const [file,expectedHash]of Object.entries(sm.inputs??{}))if(await hashFile(inside(join(agent,'modules'),resolve(agent,'modules/spidermonkey-host',file)))!==expectedHash)throw Error('Existing JS host/source mismatch: '+file);
if(await hashFile(join(agent,'native-bin/win32-x64/frameweave-native-gpu.exe'))!==native.executable.sha256||await hashFile(join(agent,'native-bin/win32-x64/frameweave-spidermonkey-host.exe'))!==sm.executable.sha256)throw Error('Existing runtime receipt/executable mismatch');
const ast=(file,text)=>{const sourceFile=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);if(sourceFile.parseDiagnostics.length)throw Error('TypeScript syntax diagnostics in '+file);return sourceFile;};
const klass=(sourceFile,name)=>{const c=sourceFile.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===name);if(!c)throw Error('Missing class '+name);return c;};
const member=(c,name)=>{const value=c.members.find(n=>n.name&&ts.isIdentifier(n.name)&&n.name.text===name);if(!value)throw Error('Missing member '+name);return value;};
const normalize=text=>text.replaceAll('\r\n','\n');
const pending=[];
for(const file of files){const current=await readFile(join(agent,file),'utf8'),eol=current.includes('\r\n')?'\r\n':'\n',frozen=git(root,'show',source+':'+file),parent=git(root,'show',source+'^:'+file),className=file.endsWith('logic-host.ts')?'NativeLogicHost':'Renderer';
  const a=ast(file,current),b=ast(file,frozen),p=ast(file,parent),c=klass(a,className),f=klass(b,className),old=klass(p,className),close=member(c,'close');
  if(normalize(close.getText(a))!==normalize(member(old,'close').getText(p)))throw Error('Agent-3 shutdown method differs from reviewed frozen parent');
  const edits=[];
  if(className==='NativeLogicHost'){
    const closing=member(c,'closing');edits.push({start:closing.end,end:closing.end,text:member(f,'stagesClosing').getText(b)+member(f,'resourcesClosing').getText(b)});
    edits.push({start:close.getStart(a),end:close.end,text:['closeStages','closeResources','close'].map(name=>member(f,name).getText(b)).join('\n ')});
  }else edits.push({start:close.getStart(a),end:close.end,text:member(f,'close').getText(b)});
  let next=current;for(const edit of edits.sort((x,y)=>y.start-x.start))next=next.slice(0,edit.start)+normalize(edit.text).replaceAll('\n',eol)+next.slice(edit.end);
  const checked=ast(file,next),updated=klass(checked,className);for(const name of className==='NativeLogicHost'?['closeStages','closeResources','close']:['close'])if(normalize(member(updated,name).getText(checked))!==normalize(member(f,name).getText(b)))throw Error('Backported method differs from frozen implementation');
  const held=inside(backup,file);await mkdir(resolve(held,'..'),{recursive:true});await writeFile(held,current);pending.push({file,next});
}
for(const {file,next}of pending)await writeFile(inside(agent,file),next);
const after=await pinAndHashes(),changed=Object.keys(after.hashes).filter(file=>after.hashes[file]!==before.hashes[file]);
if(JSON.stringify([...changed].sort())!==JSON.stringify([...files].sort()))throw Error('SDK changes exceed the two authorized lifecycle files');
for(const [file,expectedHash]of Object.entries(protectedHashes))if(await hashFile(inside(agent,file))!==expectedHash)throw Error('Protected draft changed');
git(agent,'add','--',...files);git(agent,'commit','-m','fix(runtime): backport frozen ORT lease shutdown from cf214adb');
const head=git(agent,'rev-parse','HEAD');if(!gitBytes(agent,'diff','--binary','HEAD').equals(prior))throw Error('Pre-existing draft diff changed');
const receipt={authorization:'Human: synchronize Agent-3 frozen ORT fix only, 2026-11-04',source,branch:'agents/agent-3',before:expected,after:head,files,backup,sourceMode:'Exact AST-selected frozen methods; no other Main changes',sdkRuntimePinBefore:before.pin,sdkRuntimePinAfter:after.pin,sdkChangedFiles:changed,protectedDraftHashes:protectedHashes,nativeSha256:native.executable.sha256,spiderMonkeySha256:sm.executable.sha256,nativeAndJsSourceReceiptsVerified:true,runtimesReplaced:false,locksRewritten:false,cachePolicy:'No node_modules, cache, outputs or other worktree synchronization',tests:'No duplicate GPU/media run; target scene qualification remains in Agent-3 original campaign'};
await writeFile(join(backup,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await mkdir(join(root,'outputs/main-sync'),{recursive:true});await writeFile(join(root,'outputs/main-sync/agent3-ort-latest.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
