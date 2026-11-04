// SPDX-License-Identifier: Apache-2.0
import {readFile,writeFile,mkdir,readdir,copyFile,lstat,stat} from 'node:fs/promises';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const emit=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const inside=(base,path)=>{const rel=relative(base,path);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');};
async function engineRoot(){
  let candidate=process.env.FRAMEWEAVE_ENGINE_ROOT?resolve(process.env.FRAMEWEAVE_ENGINE_ROOT):root;
  for(;;){
    try{if((await json(join(candidate,'package.json'))).name==='@frameweave/engine')return candidate;}catch{}
    if(process.env.FRAMEWEAVE_ENGINE_ROOT||dirname(candidate)===candidate)
      fail('E_KIT_ENGINE','Set FRAMEWEAVE_ENGINE_ROOT to the reviewed Frameweave checkout (with its own installed dependencies)');
    candidate=dirname(candidate);
  }
}
async function runHost(command,...args){const engine=await engineRoot();
  return execFileSync(process.execPath,['--import','tsx',join(root,'host.mjs'),command,engine,...args],{cwd:engine,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:240000});
}
async function walk(directory){const files=[];for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(['target','node_modules','.frameweave','.git'].includes(entry.name))continue;
  if(directory===root&&(entry.name==='demo'||entry.name==='.env'||entry.name.startsWith('.env.')))continue;
  const file=join(directory,entry.name),info=await lstat(file);if(info.isSymbolicLink())fail('E_KIT_PATH',`Links are not supported: ${file}`);
  if(info.isDirectory())files.push(...await walk(file));else if(info.isFile())files.push(file);else fail('E_KIT_PATH',`Not an ordinary file: ${file}`);
}return files;}
async function config(){const value=await json(join(root,'module.config.json'));
  if(value.schemaVersion!==1||value.binding!=='bytes-v1'||typeof value.rustc!=='string')fail('E_KIT_CONFIG','Expected kit config v1, bytes-v1 binding and explicit rustc pin');return value;
}
function types(effect){return `// Generated from effect.json. Do not edit; run node module.mjs types.\nimport {defineEffect,type ManifestParameters,type PluginManifestV2} from '@frameweave/engine/plugins';\nexport const manifest=${JSON.stringify(effect,null,2)} as const satisfies PluginManifestV2;\nexport type Parameters=ManifestParameters<typeof manifest>;\nexport const use=defineEffect(manifest).use;\n`;}
async function generate(check=false){
  await config();await runHost('validate');const expected=types(await json(join(root,'effect.json'))),file=join(root,'generated/types.ts');
  if(check){if(await readFile(file,'utf8')!==expected)fail('E_KIT_TYPES','Generated types are stale; run node module.mjs types');}
  else{await mkdir(dirname(file),{recursive:true});await writeFile(file,expected);}
}
async function inputs(){
  const files=(await walk(root)).map(file=>relative(root,file).replaceAll('\\','/')).filter(name=>!name.startsWith('dist/')&&!name.startsWith('generated/'));
  const records={};for(const name of files.sort())records[name]=hash(await readFile(join(root,name)));return records;
}
async function build(){
  const settings=await config();await generate();
  const compiler=process.env.RUSTC??'rustc';
  // Invoke an already-installed compiler; never run rustup, cargo install or a download.
  let version;try{version=execFileSync(compiler,['--version'],{encoding:'utf8',windowsHide:true,cwd:root}).trim();}
  catch(error){fail('E_KIT_RUST',`Rust compiler unavailable. Set RUSTC to an installed rustc: ${error.message}`);}
  if(version.split(' ')[1]!==settings.rustc)fail('E_KIT_TOOLCHAIN',`Expected rustc ${settings.rustc}; found ${version}. Review and update module.config.json deliberately.`);
  await mkdir(join(root,'dist'),{recursive:true});
  const flags=['--edition=2021','--crate-type=cdylib','--target=wasm32-unknown-unknown','-C','opt-level=s','-C','panic=abort','-C','strip=symbols','-C','debuginfo=0','--remap-path-prefix',`${root}=.`];
  const local=[];if(process.env.FRAMEWEAVE_RUST_SYSROOT)local.push('--sysroot',resolve(process.env.FRAMEWEAVE_RUST_SYSROOT));
  if(process.env.FRAMEWEAVE_RUST_LINKER)local.push('-C',`linker=${resolve(process.env.FRAMEWEAVE_RUST_LINKER)}`);
  try{execFileSync(compiler,[...flags,...local,'rust/src/lib.rs','-o','dist/module.wasm'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:90000});}
  catch(error){fail('E_KIT_RUST',`Rust build failed. Install the reviewed wasm32-unknown-unknown target yourself, or set FRAMEWEAVE_RUST_SYSROOT/LINKER.\n${error.stderr??error.message}`);}
  const require=createRequire(join(await engineRoot(),'package.json')),esbuild=require('esbuild');
  const bundled=await esbuild.build({absWorkingDir:root,entryPoints:['runtime/worker.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,minify:true,legalComments:'none',banner:{js:'/* SPDX-License-Identifier: Apache-2.0; Frameweave bytes-v1 Worker */'}});
  if(bundled.outputFiles.length!==1)fail('E_KIT_BUNDLE','Worker must be one self-contained JS resource');
  await writeFile(join(root,'dist/worker.js'),bundled.outputFiles[0].contents);
  const bytes=await readFile(join(root,'dist/module.wasm'));
  const compiled=await WebAssembly.compile(bytes);
  if(WebAssembly.Module.imports(compiled).length)fail('E_KIT_IMPORTS','R1 core-v1 does not support host imports; use the documented compatibility proposal');
  const outputs={};for(const path of ['dist/module.wasm','dist/worker.js','generated/types.ts'])outputs[path]=hash(await readFile(join(root,path)));
  const record={schemaVersion:1,binding:'bytes-v1',compiler:version,target:'wasm32-unknown-unknown',flags:flags.map(x=>x===`${root}=.`?'<module>=.':x),esbuild:esbuild.version,inputs:await inputs(),outputs};
  await emit(join(root,'dist/build.json'),record);await runHost('abi');await runHost('types');return record;
}
async function verify(){
  await generate(true);const record=await json(join(root,'dist/build.json'));
  if(record.schemaVersion!==1||record.binding!=='bytes-v1')fail('E_KIT_BUILD','Unsupported build record');
  if(Object.keys(record.outputs??{}).sort().join(',')!==['dist/module.wasm','dist/worker.js','generated/types.ts'].join(','))fail('E_KIT_BUILD','Build output inventory is incomplete');
  if(JSON.stringify(record.inputs)!==JSON.stringify(await inputs()))fail('E_KIT_BUILD','Build inputs changed; rebuild and review before packaging');
  for(const [path,digest]of Object.entries(record.outputs)){
    if(!inside(root,resolve(root,path))||hash(await readFile(join(root,path)))!==digest)fail('E_KIT_INTEGRITY',`Output hash mismatch: ${path}`);
  }
  await runHost('abi');return record;
}
export async function pack(output){
  await verify();await runHost('types');
  const effect=await json(join(root,'effect.json')),destination=resolve(output??join(root,'.frameweave/kit',`${effect.id}-${effect.version}`));
  // Refuse recursive output or overwrites of authored/previously reviewed packages.
  if(destination===root||inside(destination,root)||inside(root,destination)&&!inside(join(root,'.frameweave'),destination))fail('E_KIT_PATH','Choose an output outside sources or below .frameweave');
  try{await stat(destination);fail('E_KIT_EXISTS',`Refusing to overwrite ${destination}; choose a fresh output or deliberately publish a new version`);}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(destination,{recursive:true});
  // Carry authored helper imports and declared sidecars too, not only the starter's filenames.
  // demo's installation state is excluded; its editable entry is carried explicitly.
  const names=(await walk(root)).map(file=>relative(root,file));names.push('demo/project.tsx');
  for(const name of names){const target=join(destination,name);await mkdir(dirname(target),{recursive:true});await copyFile(join(root,name),target);}
  // Check the collected graph itself; a source import into excluded dev state
  // must fail here rather than produce a package with silently missing code.
  await runHost('types',destination);
  return JSON.parse(await runHost('inspect',destination));
}
async function main(){
  const [command='help',...args]=process.argv.slice(2);
  if(command==='help'){console.log('node module.mjs build | types [--check] | test [--browser] | pack [--output <new-directory>]');return;}
  if(command==='types'&&(args.length===0||args.join(' ')==='--check')){await generate(args.length>0);console.log(await runHost('types'));return;}
  if(command==='build'&&!args.length){console.log(JSON.stringify(await build(),null,2));return;}
  if(command==='test'&&(args.length===0||args.join(' ')==='--browser')){
    await verify();console.log(await runHost('types'));
    execFileSync(process.execPath,['--test',join(root,'test.mjs')],{cwd:root,stdio:'inherit',windowsHide:true,timeout:30000});
    if(args.length)console.log(await runHost('browser'));return;
  }
  if(command==='pack'&&(args.length===0||args.length===2&&args[0]==='--output')){console.log(JSON.stringify(await pack(args[1]),null,2));return;}
  fail('E_KIT_ARGUMENT',`Unknown command/options: ${[command,...args].join(' ')}`);
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({code:error.code??'E_KIT',message:error.message}));process.exitCode=1;});
