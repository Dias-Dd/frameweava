// SPDX-License-Identifier: Apache-2.0
import {readFile,writeFile,mkdir,readdir,lstat,stat,copyFile,rm} from 'node:fs/promises';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {sha,fail,inside,auditBindings,auditSource,publicApi,intrinsicBodies} from './build/audit.mjs';
import {collectLicenses} from './build/licenses.mjs';
import {verifyRegistry} from './build/registry.mjs';
const root=dirname(fileURLToPath(import.meta.url)),readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const emit=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
async function engineRoot(){let value=process.env.FRAMEWEAVE_ENGINE_ROOT?resolve(process.env.FRAMEWEAVE_ENGINE_ROOT):root;for(;;){try{if((await readJSON(join(value,'package.json'))).name==='@frameweave/engine')return value;}catch{}if(process.env.FRAMEWEAVE_ENGINE_ROOT||dirname(value)===value)fail('E_BINDGEN_ENGINE','Set FRAMEWEAVE_ENGINE_ROOT to the reviewed SDK checkout');value=dirname(value);}}
async function settings(){const value=await readJSON(join(root,'module.config.json'));if(value.schemaVersion!==2||value.kitVersion!==2||value.binding!=='wasm-bindgen-data-v1'||value.wasmBindgen!=='0.2.129')fail('E_BINDGEN_VERSION','Expected Kit template 2, data profile 1 and pinned wasm-bindgen 0.2.129');return value;}
async function walk(directory=root){const files=[];for(const item of(await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(['.git','.frameweave','target','node_modules'].includes(item.name)||item.name==='.env'||item.name.startsWith('.env.'))continue;
  if(directory===join(root,'demo')&&/^frameweave\..*\.json$/.test(item.name))continue;
  const file=join(directory,item.name),info=await lstat(file);if(info.isSymbolicLink())fail('E_BINDGEN_PATH','Module source/resources may not be symbolic links');if(info.isDirectory())files.push(...await walk(file));else if(info.isFile())files.push(file);else fail('E_BINDGEN_PATH','Expected ordinary source files');
}return files;}
const localName=file=>relative(root,file).replaceAll('\\','/');
const derived=name=>name.startsWith('dist/')||name.startsWith('generated/')||name.startsWith('licenses/registry/')||name==='licenses/dependencies.json';
async function inputHashes(){const result={};for(const file of(await walk()).filter(p=>!derived(localName(p))).sort())result[localName(file)]=sha(await readFile(file));return result;}
async function host(command,...args){const engine=await engineRoot();return execFileSync(process.execPath,['--import','tsx',join(root,'host.mjs'),command,engine,...args],{cwd:engine,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:6*1024*1024});}
async function toolchain(){
  const config=await settings(),rustc=process.env.RUSTC??'rustc',cargo=process.env.CARGO??(process.env.RUSTC?join(dirname(rustc),'cargo'+(process.platform==='win32'?'.exe':'')):'cargo');
  const compiler=execFileSync(rustc,['--version'],{encoding:'utf8',windowsHide:true}).trim();if(compiler.split(' ')[1]!==config.rustc)fail('E_BINDGEN_VERSION',`Expected rustc ${config.rustc}, found ${compiler}`);
  const engine=await engineRoot(),receiptFile=join(engine,'.frameweave/bindgen-tools/tool.json');let receipt;try{receipt=await readJSON(receiptFile);}catch{}
  const bindgen=process.env.WASM_BINDGEN??receipt?.executable??'wasm-bindgen';
  if(receipt&&bindgen===receipt.executable&&sha(await readFile(bindgen))!==receipt.binarySha256)fail('E_BINDGEN_TOOL_INTEGRITY','Provisioned CLI bytes changed');
  let generator;try{generator=execFileSync(bindgen,['--version'],{encoding:'utf8',windowsHide:true}).trim();}catch{fail('E_BINDGEN_TOOL','Set WASM_BINDGEN to reviewed 0.2.129, or explicitly run tools/rust-wasm-kit/provision-bindgen.mjs');}
  if(generator!==`wasm-bindgen ${config.wasmBindgen}`)fail('E_BINDGEN_VERSION',`Generator/crate mismatch: ${generator}`);
  return {config,rustc,cargo,bindgen,compiler,generator,cliSha256:sha(await readFile(bindgen.includes('/')||bindgen.includes('\\')?bindgen:execFileSync(process.platform==='win32'?'where':'which',[bindgen],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)[0]))};
}
function cargoEnv(){return {...process.env,CARGO_HOME:process.env.CARGO_HOME??join(root,'.frameweave/cargo-home'),CARGO_TARGET_DIR:process.env.FRAMEWEAVE_CARGO_TARGET_DIR??join(root,'.frameweave/cargo-target')};}
function cargoRun(tool,args,{network=false}={}){
  const flags=['--remap-path-prefix',root+'=.','-C','debuginfo=0'];
  if(process.env.FRAMEWEAVE_RUST_SYSROOT)flags.push('--sysroot',resolve(process.env.FRAMEWEAVE_RUST_SYSROOT));
  if(process.env.FRAMEWEAVE_RUST_LINKER)flags.push('-C',`linker=${resolve(process.env.FRAMEWEAVE_RUST_LINKER)}`);
  const argv=[...args,'--manifest-path',join(root,'rust/Cargo.toml')];if(!network)argv.push('--offline');
  if(args[0]==='build')argv.push('--config','target.wasm32-unknown-unknown.rustflags='+JSON.stringify(flags));
  try{return execFileSync(tool.cargo,argv,{cwd:root,env:cargoEnv(),windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});}
  catch(error){fail('E_BINDGEN_CARGO',`Cargo failed without changing locks; fetch dependencies explicitly or fix the installed host/target linker. ${error.stderr??error.message}`);}
}
function p4Types(effect){return `// Generated from the existing P4 Schema v2.\nimport {defineEffect,type ManifestParameters,type PluginManifestV2} from '@frameweave/engine/plugins';\nexport const manifest=${JSON.stringify(effect,null,2)} as const satisfies PluginManifestV2;\nexport type Parameters=ManifestParameters<typeof manifest>;\nexport const use=defineEffect(manifest).use;\n`;}
function agentTypes(methods,entryClass){return `// Generated from wasm-bindgen .d.ts. Ownership/imports stay behind the adapter.\nimport type {${entryClass}} from '../dist/generated/module.js';\nimport type {ModuleLoader} from '@frameweave/engine/plugins';\nimport {createClient,type Options,type Client} from '../runtime/client.ts';\ntype Public = Pick<${entryClass},${methods.map(m=>JSON.stringify(m.name)).join('|')}>;\nexport type Api = {[K in keyof Public]:Public[K] extends (...args:infer A)=>infer R ? (...args:A)=>Promise<R>:never}&Pick<Client,'dispose'|'diagnostics'>;\nexport async function createEngineApi(load:ModuleLoader,options:Options={}):Promise<Api>{const client=await createClient(load,options);return Object.assign(Object.fromEntries(${JSON.stringify(methods.map(m=>m.name))}.map(name=>[name,(...args:unknown[])=>client.invoke(name,args)])),{dispose:()=>client.dispose(),diagnostics:()=>client.diagnostics()}) as Api;}\n`;}
async function generateTypes({check=false}={}){
  const config=await settings(),require=createRequire(join(await engineRoot(),'package.json')),ts=require('typescript'),effect=await readJSON(join(root,'effect.json'));
  const methods=publicApi(ts,await readFile(join(root,'dist/generated/module.d.ts'),'utf8'),config.entryClass);
  const files={'generated/p4.ts':p4Types(effect),'generated/api.ts':agentTypes(methods,config.entryClass),'dist/binding.d.mts':`export function createBinding():Pick<typeof import('./generated/module.js'),'${config.entryClass}'|'initSync'|'live_sessions'>;\n`};
  const metadata={schemaVersion:1,profile:'wasm-bindgen-data-v1',entryClass:config.entryClass,functions:methods,parameters:effect.parameters,parameterSchemaVersion:2,errors:['E_BINDGEN_CALL','E_BINDGEN_DISPOSED','E_BINDGEN_IMPORTS','E_PACKAGE_INTEGRITY'],environment:{webStage:true,worker:true,allowWasmRequired:true,host:'reviewed data-only callbacks'},p4Reference:`${effect.id}@${effect.version}`};
  files['generated/agent-api.json']=JSON.stringify(metadata,null,2)+'\n';
  for(const [name,text]of Object.entries(files)){if(check){if(await readFile(join(root,name),'utf8')!==text)fail('E_BINDGEN_TYPES',`Stale generated declaration/metadata: ${name}`);}else{await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),text);}}
  return methods;
}
async function build(){
  const tool=await toolchain(),require=createRequire(join(await engineRoot(),'package.json')),esbuild=require('esbuild'),ts=require('typescript');await host('validate');
  const metadata=JSON.parse(cargoRun(tool,['metadata','--format-version','1','--locked']));
  const cargoRoot=metadata.packages.find(pkg=>pkg.id===metadata.resolve.root),bindingDependency=cargoRoot?.dependencies.find(dep=>dep.name==='wasm-bindgen'&&dep.kind!=='dev');
  if(bindingDependency?.req!=='='+tool.config.wasmBindgen||!metadata.packages.some(pkg=>pkg.name==='wasm-bindgen'&&pkg.version===tool.config.wasmBindgen))fail('E_BINDGEN_VERSION','Cargo must pin the exact generator-matching wasm-bindgen version');
  const dependencies=await verifyRegistry(root,cargoEnv().CARGO_HOME,metadata);
  const start=performance.now();cargoRun(tool,['build','--release','--locked','--target','wasm32-unknown-unknown']);const rustBuildMs=performance.now()-start;
  // These two exact directories are compiler-owned outputs, never authored sources.
  for(const name of ['dist/generated','licenses/registry']){const directory=resolve(root,name);if(!inside(root,directory)||directory===root)fail('E_BINDGEN_PATH','Invalid generated directory');try{if((await lstat(directory)).isSymbolicLink())fail('E_BINDGEN_PATH','Generated output may not be a link');}catch(error){if(error.code!=='ENOENT')throw error;}await rm(directory,{recursive:true,force:true});}
  await mkdir(join(root,'dist/generated'),{recursive:true});
  execFileSync(tool.bindgen,[join(cargoEnv().CARGO_TARGET_DIR,'wasm32-unknown-unknown/release/fw_bindgen_module.wasm'),'--target','web','--out-dir',join(root,'dist/generated'),'--out-name','module','--typescript','--omit-default-module-path'],{cwd:root,windowsHide:true,timeout:60000});
  const checked=await auditBindings(root,tool.config,ts);
  const entry=`export {${tool.config.entryClass},initSync,live_sessions} from './dist/generated/module.js';`;
  const bundle=await esbuild.build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'binding-entry.mjs'},bundle:true,format:'iife',platform:'browser',target:'es2022',globalName:'__FrameweaveBindgen',write:false,logLevel:'silent',treeShaking:true});
  if(bundle.outputFiles.length!==1)fail('E_BINDGEN_ASSETS','Binding must be self-contained');
  const factory=`// SPDX-License-Identifier: Apache-2.0 AND MIT; generated by pinned wasm-bindgen + esbuild.\nexport function createBinding(){\n${bundle.outputFiles[0].text}\nreturn __FrameweaveBindgen;\n}\n`;
  auditSource(ts,factory,{file:'binding.mjs'});await writeFile(join(root,'dist/binding.mjs'),factory);await generateTypes();
  const worker=await esbuild.build({absWorkingDir:root,entryPoints:['runtime/worker.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,logLevel:'silent',minify:false,legalComments:'inline'});
  if(worker.outputFiles.length!==1)fail('E_BINDGEN_ASSETS','Worker dependencies must be bundled');await writeFile(join(root,'dist/worker.js'),worker.outputFiles[0].contents);
  await verifyRegistry(root,cargoEnv().CARGO_HOME,metadata);await collectLicenses(root,metadata);
  const pack=await readJSON(join(root,'frameweave.package.json'));for(const name of Object.keys(pack.modules))if(name.startsWith('asset'))delete pack.modules[name];
  const generatedFiles=(await walk(join(root,'dist/generated'))).sort();const resources=['bindingBytes'];
  for(const [index,file]of generatedFiles.entries()){const name=`asset${index}`;pack.modules[name]={format:'resource',path:'./'+localName(file)};resources.push(name);}
  const methods=await generateTypes();
  const profile={id:'wasm-bindgen-data-v1',revision:1,generator:tool.config.wasmBindgen,entryClass:tool.config.entryClass,methods:methods.map(m=>m.name),imports:checked.imports,resources,review:{policySha256:sha(await readFile(join(root,'import-policy.json'))),snippets:checked.snippets,intrinsics:checked.intrinsics}};
  await emit(join(root,'dist/import-profile.json'),profile);await emit(join(root,'frameweave.package.json'),pack);
  const effect=await readJSON(join(root,'effect.json'));effect.resources=Object.fromEntries(Object.entries(pack.modules).filter(([,m])=>m.format==='resource').map(([name,m])=>[name,{src:m.path,kind:'file'}]));await emit(join(root,'effect.json'),effect);await generateTypes();
  const outputs={};for(const file of(await walk()).filter(p=>derived(localName(p))&&localName(p)!=='dist/build.json').sort())outputs[localName(file)]=sha(await readFile(file));
  const record={schemaVersion:2,binding:'wasm-bindgen-data-v1',compiler:tool.compiler,cargo:execFileSync(tool.cargo,['--version'],{encoding:'utf8',windowsHide:true}).trim(),generator:tool.generator,cliSha256:tool.cliSha256,target:'wasm32-unknown-unknown',esbuild:esbuild.version,dependencies,inputs:await inputHashes(),outputs};
  await emit(join(root,'dist/build.json'),record);await mkdir(join(root,'.frameweave'),{recursive:true});await emit(join(root,'.frameweave/last-build-metrics.json'),{rustBuildMs,wasmBytes:(await stat(join(root,'dist/generated/module_bg.wasm'))).size,rawGlueBytes:(await stat(join(root,'dist/generated/module.js'))).size,bindingBytes:(await stat(join(root,'dist/binding.mjs'))).size,workerBytes:(await stat(join(root,'dist/worker.js'))).size});
  await host('types');return record;
}
async function verify(){
  await generateTypes({check:true});const record=await readJSON(join(root,'dist/build.json'));if(record.schemaVersion!==2||record.binding!=='wasm-bindgen-data-v1')fail('E_BINDGEN_BUILD','Unsupported build provenance');
  if(JSON.stringify(record.inputs)!==JSON.stringify(await inputHashes()))fail('E_BINDGEN_BUILD','Authored sources changed; rebuild/review before packing');
  const actual=(await walk()).filter(p=>derived(localName(p))&&localName(p)!=='dist/build.json').map(localName).sort();if(JSON.stringify(actual)!==JSON.stringify(Object.keys(record.outputs).sort()))fail('E_BINDGEN_ASSETS','Generated file inventory changed');
  for(const [name,hash]of Object.entries(record.outputs)){if(!inside(root,resolve(root,name))||sha(await readFile(join(root,name)))!==hash)fail('E_BINDGEN_INTEGRITY',`Generated bytes changed: ${name}`);}
  return record;
}
export async function pack(output){await verify();await host('types');const effect=await readJSON(join(root,'effect.json')),destination=resolve(output??join(root,'.frameweave/kit',`${effect.id}-${effect.version}`));
  if(destination===root||inside(destination,root)||inside(root,destination)&&!inside(join(root,'.frameweave'),destination))fail('E_BINDGEN_PATH','Choose a fresh output outside sources or below .frameweave');
  try{await stat(destination);fail('E_BINDGEN_EXISTS','Refusing to overwrite a reviewed package');}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(destination,{recursive:true});for(const file of await walk()){const target=join(destination,localName(file));await mkdir(dirname(target),{recursive:true});await copyFile(file,target);}await host('types',destination);return JSON.parse(await host('inspect',destination));
}
async function main(){const [command='help',...args]=process.argv.slice(2);
  if(command==='help'&&!args.length){console.log('node module.mjs fetch | lock | build | audit | types [--check] | test [--browser] | pack [--output NEW]');return;}
  if(['fetch','lock'].includes(command)&&!args.length){const tool=await toolchain();console.log(cargoRun(tool,command==='fetch'?['fetch','--locked']:['generate-lockfile'],{network:true}));return;}
  if(command==='build'&&!args.length){console.log(JSON.stringify(await build(),null,2));return;}
  if(command==='audit'&&!args.length){const require=createRequire(join(await engineRoot(),'package.json')),ts=require('typescript'),bytes=await readFile(join(root,'dist/generated/module_bg.wasm'));
    console.log(JSON.stringify({generator:(await settings()).wasmBindgen,imports:WebAssembly.Module.imports(await WebAssembly.compile(bytes)),intrinsics:intrinsicBodies(ts,await readFile(join(root,'dist/generated/module.js'),'utf8')),note:'Review source before changing import-policy.json. This command grants no capability.'},null,2));return;}
  if(command==='types'&&(args.length===0||args.join(' ')==='--check')){await generateTypes({check:args.length>0});console.log(await host('types'));return;}
  if(command==='test'&&(args.length===0||args.join(' ')==='--browser')){await verify();console.log(await host('types'));execFileSync(process.execPath,['--test',join(root,'test.mjs')],{cwd:root,windowsHide:true,stdio:'inherit',timeout:30000});if(args.length)console.log(await host('browser'));return;}
  if(command==='pack'&&(args.length===0||args.length===2&&args[0]==='--output')){console.log(JSON.stringify(await pack(args[1]),null,2));return;}
  fail('E_BINDGEN_ARGUMENT','Unknown command/options');
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({code:error.code??'E_BINDGEN_BUILD',message:error.message}));process.exitCode=1;});
