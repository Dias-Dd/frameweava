import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runCLI} from '../src/cli-entry.ts';
import {runtimeCachePath} from '../src/runtime/paths.ts';
import {userLibraryHome} from '../src/plugins/paths.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
import {engineDependencyRoots} from '../src/runtime/dependencies.ts';
import {assertPluginBundleInputs} from '../src/plugins/compiler.ts';

const exec=promisify(execFile),root=resolve('.'),bin=join(root,'dist/bin/frameweave.mjs');
before(async()=>{
  // npm test works on a fresh checkout too; release fixtures are generated, never silently skipped.
  await exec(process.execPath,[join(root,'scripts/build-distribution.mjs')],{cwd:root,windowsHide:true,timeout:60000});
  const args=['pack','./dist','--pack-destination','artifacts','--json'];
  const packed=process.platform==='win32'?await exec('cmd.exe',['/d','/s','/c','npm '+args.join(' ')],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024}):await exec('npm',args,{cwd:root,timeout:60000,maxBuffer:4*1024*1024});
  await writeFile(join(root,'artifacts/dx1a-pack.json'),packed.stdout);
});
async function cli(args:string[]){return exec(process.execPath,[bin,...args],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});}
test('distribution has native ESM public exports and executable bin without a global TS runner',async()=>{
  const pkg=JSON.parse(await readFile(join(root,'dist/package.json'),'utf8'));
  assert.equal(pkg.bin.frameweave,'./bin/frameweave.mjs');assert.equal(pkg.dependencies.tsx,'4.20.6');
  for(const entry of Object.values(pkg.exports) as {types:string;import:string}[]){assert.match(entry.import,/\.js$/);await access(join(root,'dist',entry.import));await access(join(root,'dist',entry.types));}
  const result=await cli(['--version','--json']);assert.equal(JSON.parse(result.stdout).data.version,pkg.version);assert.equal(result.stderr,'');
});
test('doctor validates release bytes and retains the exact source SDK Runtime Pin',async()=>{
  const {stdout}=await cli(['doctor','--json']),result=JSON.parse(stdout);assert.equal(result.ok,true);
  assert.deepEqual(result.data.runtimePin,runtimePin);assert.equal(result.data.distribution.verified,true);
  assert.equal(result.data.paths.cache,runtimeCachePath());assert.match(result.data.paths.tsxLoader,/^file:/);
});
test('installed public Node SDK loads in plain Node without --import tsx',async()=>{
  const {stdout}=await exec(process.execPath,['--input-type=module','-e',"const sdk=await import('./dist/lib/node.js');console.log(typeof sdk.buildProject,typeof sdk.createAnalysisService,typeof sdk.inspectProject)"],{cwd:root,windowsHide:true});
  assert.equal(stdout.trim(),'function function function');
  const effects=await exec(process.execPath,['--input-type=module','-e',"const effects=await import('./dist/lib/plugins/builtin.js');console.log(typeof effects.Glow.use)"],{cwd:root,windowsHide:true});
  assert.equal(effects.stdout.trim(),'function');
});
test('conditional analysis backend imports are valid native ESM in the distribution',async()=>{
  const {stdout}=await exec(process.execPath,['--input-type=module','-e',"import assert from 'node:assert/strict';const {createAnalysisService}=await import('./dist/lib/analysis-tools/index.js');const s=await createAnalysisService({projectRoot:process.cwd()});try{for(const backend of ['node','renderer'])await assert.rejects(s.preview('0'.repeat(64),0,'unused.png',{backend}),{code:'E_ANALYSIS_ARTIFACT_MISSING'});}finally{await s.close();}console.log('both conditional imports resolved');"],{cwd:root,windowsHide:true});
  assert.match(stdout,/both conditional imports resolved/);
});
test('writable cache is based on existing FRAMEWEAVE_HOME, not SDK installation',()=>{
  assert.equal(runtimeCachePath('portable'),join(userLibraryHome(),'cache/runtime/portable'));
});
test('new DX wiring delegates to independent handlers without reimplementing services',async()=>{
  const calls:string[][]=[];const result=await runCLI(['future-command','argument'],{'future-command':async args=>{calls.push(args);return {ok:true};}});
  assert.deepEqual(calls,[['argument']]);assert.deepEqual(result,{ok:true});
});
test('ACL argument failures emit one parseable Agent Result and a failing exit code',async()=>{
  for(const args of [['capabilities','inspect'],['inspect','--unknown']]){
    try{await cli(args);assert.fail('expected CLI failure');}catch(e){const r=e as {code:number;stdout:string;stderr:string};assert.equal(r.code,1);const value=JSON.parse(r.stdout);assert.equal(value.schemaVersion,1);assert.equal(value.ok,false);assert.match(value.diagnostics[0].code,/^E_/);assert.notEqual(r.stderr,'');}
  }
});
test('ACL-2 retains stderr-only structured errors and JSONL with --events',async()=>{
  try{await cli(['analyze','unknown','--events']);assert.fail('expected CLI failure');}catch(e){const r=e as {code:number;stdout:string;stderr:string};assert.equal(r.code,1);assert.equal(r.stdout,'');const error=JSON.parse(r.stderr.trim());assert.equal(error.ok,false);assert.equal(error.diagnostics[0].code,'E_ARGUMENT');assert.equal(r.stderr.trim().split(/\r?\n/).length,1);}
});
test('release inventory excludes caches, development outputs, and repository metadata',async()=>{
  const inventory=JSON.parse(await readFile(join(root,'dist/distribution.json'),'utf8'));
  for(const file of Object.keys(inventory.files))assert.doesNotMatch(file,/(^|\/)(node_modules|\.git|\.frameweave|target|outputs|work|tests|validation)\//);
  assert.ok(inventory.files['npm-shrinkwrap.json']);assert.ok(inventory.files['lib-modules/render-inspection/cli.js']);
  assert.ok(inventory.files['examples/analysis/brightness-task.ts']);
  assert.deepEqual(await readFile(join(root,'package-lock.json')),await readFile(join(root,'dist/npm-shrinkwrap.json')));
});
test('every inventoried release file survives npm pack and the bin has a portable Node shebang',async()=>{
  const [{files}]=JSON.parse(await readFile(join(root,'artifacts/dx1a-pack.json'),'utf8'));
  const shipped=new Map(files.map((f:{path:string;mode:number})=>[f.path,f.mode]));
  const inventory=JSON.parse(await readFile(join(root,'dist/distribution.json'),'utf8'));
  for(const file of Object.keys(inventory.files))assert.ok(shipped.has(file),`npm excluded required runtime file ${file}`);
  for(const file of shipped.keys())assert.ok(file==='distribution.json'||Object.hasOwn(inventory.files,file as string),`Uninventoried file in package: ${file}`);
  assert.ok(shipped.has('bin/frameweave.mjs'));
  assert.match(await readFile(join(root,'dist/bin/frameweave.mjs'),'utf8'),/^#!\/usr\/bin\/env node\n/);
});
async function hoistedFixture(version='1.0.0'){
  const parent=join(root,'.frameweave/distribution-tests');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'hoisted-'));
  const sdk=join(dir,'node_modules/@frameweave/engine'),build=join(dir,'build');
  await mkdir(join(sdk,'src'),{recursive:true});await mkdir(join(build,'plugins'),{recursive:true});
  await writeFile(join(sdk,'package.json'),JSON.stringify({name:'@frameweave/engine',dependencies:{'locked-a':'1.0.0'}}));
  await writeFile(join(sdk,'npm-shrinkwrap.json'),JSON.stringify({packages:{'node_modules/locked-a':{version:'1.0.0'},'node_modules/locked-b':{version:'1.0.0'}}}));
  for(const name of ['locked-a','locked-b','private-evil']){const path=join(dir,'node_modules',name);await mkdir(path,{recursive:true});await writeFile(join(path,'package.json'),JSON.stringify({name,version:name==='locked-a'?version:'1.0.0',main:'index.js',dependencies:name==='locked-a'?{'locked-b':'1.0.0'}:{}}));await writeFile(join(path,'index.js'),'export default 42;');}
  return {dir,sdk,build,a:join(dir,'node_modules/locked-a/index.js'),b:join(dir,'node_modules/locked-b/index.js'),evil:join(dir,'node_modules/private-evil/index.js')};
}
test('hoisted locked dependencies work while adjacent private packages remain denied',async()=>{
  const f=await hoistedFixture();try{assert.equal((await engineDependencyRoots(f.sdk)).length,2);await assertPluginBundleInputs([f.a,f.b],[],f.sdk,f.build,'virtual.ts');await assert.rejects(assertPluginBundleInputs([f.evil],[],f.sdk,f.build,'virtual.ts'),{code:'E_PLUGIN_PACKAGE'});}finally{await rm(f.dir,{recursive:true,force:true});}
});
test('a hoisted dependency version absent from the SDK lock does not gain import permission',async()=>{
  const f=await hoistedFixture('2.0.0');try{assert.deepEqual(await engineDependencyRoots(f.sdk),[]);await assert.rejects(assertPluginBundleInputs([f.a],[],f.sdk,f.build,'virtual.ts'),{code:'E_PLUGIN_PACKAGE'});}finally{await rm(f.dir,{recursive:true,force:true});}
});
test('installed locked plugin sources work while nested private dependencies remain denied',async()=>{
  const f=await hoistedFixture();try{
    const plugin=join(f.sdk,'plugins/builtin/checked'),privateRoot=join(plugin,'node_modules/private-evil');await mkdir(privateRoot,{recursive:true});
    const entry=join(plugin,'index.ts'),evil=join(privateRoot,'index.ts');await writeFile(entry,'export const checked = true;');await writeFile(evil,'export default 42;');
    await assertPluginBundleInputs([entry],[plugin],f.sdk,f.build,'virtual.ts');
    await assert.rejects(assertPluginBundleInputs([evil],[plugin],f.sdk,f.build,'virtual.ts'),{code:'E_PLUGIN_PACKAGE'});
  }finally{await rm(f.dir,{recursive:true,force:true});}
});
