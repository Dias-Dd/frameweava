// One offline installed-consumer supplement. No CLI/media/browser/performance suite.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp,stat,lstat,realpath,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {pipeline} from 'node:stream/promises';

assert.equal(process.argv.length,2,'Fixed verification accepts no package/source arguments');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),parent=join(root,'artifacts/performance-gpu-pixel-pass');
await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'installed-api-')),consumer=join(directory,'consumer'),cache=join(directory,'npm-cache'),temporary=join(directory,'tmp');
await mkdir(cache);await mkdir(temporary);await cp(join(here,'installed-consumer'),consumer,{recursive:true,errorOnExist:true,force:false});
const sha256=data=>createHash('sha256').update(data).digest('hex'),inside=(base,file)=>{const r=relative(base,file);return r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../')&&!isAbsolute(r);};
const sourceFiles=['package.json','package-lock.json','scripts/build-distribution.mjs','src/web/api.ts','modules/gpu-effects/index.ts','modules/gpu-effects/core.ts','modules/gpu-effects/float-passes.ts','modules/gpu-effects/float-pass-shaders.ts'];
const sourceHashes={};for(const name of sourceFiles)sourceHashes[name]=sha256(await readFile(join(root,name)));
const report={schemaVersion:1,sampler:'gpu-pixel-pass-installed-types-import/1',startedAt:new Date().toISOString(),directory,consumer,sourceHashes,driverHash:sha256(await readFile(fileURLToPath(import.meta.url))),scope:'Actual existing distribution build + npm pack + fresh offline nested npm install. Only plain Node public web import and strict TypeScript consumption; no browser/CLI/media/performance test. No source links or shared node_modules.',commands:[],checks:[]};
const env={...process.env,NODE_OPTIONS:'',NODE_PATH:'',TSX_DISABLE_CACHE:'1',FRAMEWEAVE_HOME:join(directory,'frameweave-home'),TMP:temporary,TEMP:temporary,TMPDIR:temporary,npm_config_cache:cache,NPM_CONFIG_CACHE:cache,npm_config_offline:'true',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false'};
const npm=process.env.npm_execpath?.endsWith('npm-cli.js')?process.env.npm_execpath:join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const exec=promisify(execFile);
async function checkpoint(){await writeFile(join(directory,'results.json'),JSON.stringify(report,null,2)+'\n');}
async function command(label,args,cwd){
  assert.ok(inside(root,cwd));const started=performance.now();let result;
  try{const r=await exec(process.execPath,args,{cwd,env,windowsHide:true,timeout:240000,maxBuffer:64*1024*1024});result={code:0,stdout:r.stdout,stderr:r.stderr};}
  catch(error){result={code:error.code??null,stdout:error.stdout??'',stderr:error.stderr??'',message:error.message};}
  const stdout=join(directory,label+'.stdout.txt'),stderr=join(directory,label+'.stderr.txt');await writeFile(stdout,result.stdout);await writeFile(stderr,result.stderr);
  report.commands.push({label,executable:process.execPath,args,cwd,code:result.code,durationMs:performance.now()-started,stdout,stderr});await checkpoint();
  console.log(JSON.stringify({step:label,code:result.code,directory}));
  if(result.code!==0)throw Object.assign(new Error(label+' failed; see '+stderr),{step:label,commandResult:result});return result;
}
async function walk(base,filter=()=>true){const names=[];for(const entry of await readdir(base,{withFileTypes:true})){const file=join(base,entry.name);if(entry.isSymbolicLink())throw new Error('Unexpected source/package symlink: '+file);if(entry.isDirectory()){if(!['tests','validation','node_modules','target'].includes(entry.name))names.push(...await walk(file,filter));}else if(entry.isFile()&&filter(file))names.push(file);}return names;}
async function sdkPin(base,lock){const names=[];for(const folder of ['src','plugins/builtin'])for(const file of await walk(join(base,folder)))names.push(relative(base,file).replaceAll('\\','/'));for(const file of await walk(join(base,'modules'),file=>/\.(?:tsx?|m?js|json|wasm|wgsl|glsl)$/.test(file))){const name=relative(base,file).replaceAll('\\','/');if(name!=='modules/shared-state/node.ts')names.push(name);}names.sort();names.push('package.json','package-lock.json','tsconfig.json');const h=createHash('sha256');for(const name of names)h.update(name).update('\0').update(await readFile(join(base,name==='package-lock.json'?lock:name))).update('\0');return {apiVersion:1,engineVersion:JSON.parse(await readFile(join(base,'package.json'),'utf8')).version,integrity:h.digest('hex')};}
async function seedOnlyNeededCache(lock){
  const candidates=[process.env.GPU_PIXEL_PASS_OFFLINE_CACHE,join(root,'.frameweave/npm-cache'),join(root,'.frameweave/ocio-distribution-tests/npm-cache'),process.env.npm_config_cache,process.env.NPM_CONFIG_CACHE,process.platform==='win32'?join(process.env.LOCALAPPDATA??homedir(),'npm-cache'):join(homedir(),'.npm')].filter(Boolean);
  let seed;for(const candidate of candidates){if(candidate.includes('frameweave-worktrees')&&!inside(root,resolve(candidate)))continue;if(await stat(join(candidate,'_cacache')).then(s=>s.isDirectory(),()=>false)){seed=resolve(candidate);break;}}
  if(!seed)throw Object.assign(new Error('No existing offline npm cache found; no network/download fallback'),{code:'E_OFFLINE_CACHE_MISSING'});
  const npmRequire=createRequire(npm),cacache=npmRequire('cacache'),wantedUrls=new Set(),wantedIntegrities=new Set();
  for(const [location,pkg]of Object.entries(lock.packages??{})){
    if(pkg.os&&(!pkg.os.includes(process.platform)||pkg.os.includes('!'+process.platform)))continue;if(pkg.cpu&&!pkg.cpu.includes(process.arch))continue;
    if(typeof pkg.resolved==='string'&&/^https?:/.test(pkg.resolved)){wantedUrls.add(decodeURIComponent(pkg.resolved));const name=location.split('node_modules/').at(-1);wantedUrls.add(new URL(pkg.resolved).origin+'/'+name);}
    if(pkg.integrity)wantedIntegrities.add(pkg.integrity);
  }
  const selected=[];for await(const entry of cacache.ls.stream(join(seed,'_cacache'))){const prefix='make-fetch-happen:request-cache:',url=entry.key.startsWith(prefix)?decodeURIComponent(entry.key.slice(prefix.length)):null;if(wantedIntegrities.has(String(entry.integrity))||url&&wantedUrls.has(url))selected.push(entry);}
  const unique=new Map(selected.map(entry=>[String(entry.integrity),entry.size??0])),bytes=[...unique.values()].reduce((a,b)=>a+b,0),limit=384*1024*1024;
  report.cacheSeed={source:seed,destination:cache,policy:'Read only selected lockfile package/metadata entries; never copy the whole global cache or mutate the seed',entries:selected.length,uniqueContentBytes:bytes,maximumCopyBytes:limit};await checkpoint();
  if(bytes>limit)throw Object.assign(new Error('Required cached content exceeds bounded 384 MiB seed copy; report the installation gap without delaying core GPU work'),{code:'E_OFFLINE_CACHE_COST'});
  for(const entry of selected)await pipeline(cacache.get.stream(join(seed,'_cacache'),entry.key),cacache.put.stream(join(cache,'_cacache'),entry.key,{metadata:entry.metadata,integrity:entry.integrity,size:entry.size}));
}
try{
  assert.ok((await stat(npm)).isFile(),'Existing npm installation required');const sourcePackage=JSON.parse(await readFile(join(root,'package.json'),'utf8')),lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
  assert.equal(sourcePackage.dependencies['@webgpu/types'],'0.1.74');assert.equal(lock.packages[''].dependencies['@webgpu/types'],'0.1.74');report.sourceSdkPin=await sdkPin(root,'package-lock.json');
  await seedOnlyNeededCache(lock);
  await command('build-distribution',[join(root,'scripts/build-distribution.mjs')],root);
  const packed=JSON.parse((await command('npm-pack',[npm,'pack','./dist','--pack-destination',directory,'--json','--offline','--ignore-scripts','--no-audit','--no-fund'],root)).stdout);assert.equal(packed.length,1);report.pack=packed[0];
  const tarball=join(directory,packed[0].filename);report.tarball={path:tarball,sha256:sha256(await readFile(tarball))};
  await command('npm-install-offline',[npm,'install',tarball,'--offline','--ignore-scripts','--no-audit','--no-fund','--install-strategy=nested','--cache',cache],consumer);
  const installed=join(consumer,'node_modules/@frameweave/engine');assert.equal((await lstat(installed)).isSymbolicLink(),false);assert.ok(inside(consumer,await realpath(installed)));
  const installedPackage=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));assert.equal(installedPackage.version,sourcePackage.version);assert.equal(installedPackage.dependencies['@webgpu/types'],'0.1.74');
  report.installedPackage={name:installedPackage.name,version:installedPackage.version,path:installed,realPath:await realpath(installed),exports:installedPackage.exports,directWebGpuDependency:installedPackage.dependencies['@webgpu/types']};
  report.installedSdkPin=await sdkPin(installed,'npm-shrinkwrap.json');assert.deepEqual(report.installedSdkPin,report.sourceSdkPin);
  const inventory=JSON.parse(await readFile(join(installed,'distribution.json'),'utf8'));let count=0;for(const [name,expected]of Object.entries(inventory.files)){assert.equal(sha256(await readFile(join(installed,name))),expected,'Installed inventory: '+name);count++;}
  const required=['src/web/api.ts','lib/web/api.js',...['index','core','float-passes','float-pass-shaders'].flatMap(name=>['modules/gpu-effects/'+name+'.ts','lib-modules/gpu-effects/'+name+'.js'])];for(const name of required)assert.ok(inventory.files[name],'Missing new float source/type/runtime: '+name);
  report.inventory={filesVerified:count,sha256:sha256(await readFile(join(installed,'distribution.json'))),required:Object.fromEntries(required.map(name=>[name,inventory.files[name]]))};
  const nestedTypes=join(installed,'node_modules/@webgpu/types/package.json'),webGpuTypes=JSON.parse(await readFile(nestedTypes,'utf8'));assert.equal(webGpuTypes.version,'0.1.74');assert.ok(inside(consumer,await realpath(nestedTypes)));report.webGpuTypes={version:webGpuTypes.version,packagePath:nestedTypes,realPath:await realpath(nestedTypes),directInstalledDependency:true};
  await command('node-public-import',[join(consumer,'node-import.mjs')],consumer);report.nodeImport=JSON.parse(await readFile(join(consumer,'node-import-results.json'),'utf8'));assert.equal(report.nodeImport.ok,true);
  const consumerRequire=createRequire(join(consumer,'package.json')),tsc=consumerRequire.resolve('typescript/bin/tsc');assert.ok(inside(consumer,await realpath(tsc)));report.typescript={version:JSON.parse(await readFile(consumerRequire.resolve('typescript/package.json'),'utf8')).version,compilerPath:tsc,config:JSON.parse(await readFile(join(consumer,'tsconfig.json'),'utf8'))};assert.equal(report.typescript.config.compilerOptions.strict,true);assert.equal(report.typescript.config.compilerOptions.skipLibCheck,false);
  const typed=await command('tsc-strict-no-skip',[tsc,'--project',join(consumer,'tsconfig.json'),'--traceResolution','--listFiles'],consumer),loaded=typed.stdout.split(/\r?\n/).filter(line=>/^(?:[A-Za-z]:[\\/]|\/).+\.(?:tsx?|mts|cts)$/.test(line.trim())).map(line=>line.trim());assert.ok(loaded.length>1);
  for(const name of loaded)assert.ok(inside(consumer,await realpath(name)),'Type resolution escaped installed consumer: '+name);assert.ok(loaded.some(name=>name.replaceAll('\\','/').includes('/@webgpu/types/')),'Engine must resolve its shipped direct @webgpu/types');report.typescript.loadedFiles=loaded;report.typescript.allResolutionInsideConsumer=true;
  report.npmInventory=JSON.parse((await command('npm-inventory',[npm,'ls','--all','--json','--offline'],consumer)).stdout);
  for(const [name,expected]of Object.entries(sourceHashes))assert.equal(sha256(await readFile(join(root,name))),expected,'Production source changed during consumer verification: '+name);
  assert.deepEqual(await sdkPin(root,'package-lock.json'),report.sourceSdkPin);report.sourceUnchanged=true;report.allPassed=true;
}catch(error){report.failure={code:error.code??error.name,message:error.message,step:error.step??null,details:error.commandResult?{code:error.commandResult.code,stderrTail:error.commandResult.stderr.slice(-6000)}:null};process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await checkpoint();console.log(JSON.stringify({ok:report.allPassed??false,directory,failure:report.failure??null,installedSdkPin:report.installedSdkPin??null}));}
