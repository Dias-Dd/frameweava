// SPDX-License-Identifier: Apache-2.0
import {readFile,writeFile,readdir,mkdir,copyFile,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';import {performance} from 'node:perf_hooks';import {build} from 'esbuild';
import {verifyRegistry} from '../../../tools/rust-wasm-kit/profiles/wasm-bindgen/template/build/registry.mjs';
import {collectLicenses} from '../../../tools/rust-wasm-kit/profiles/wasm-bindgen/template/build/licenses.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),workspace=resolve(root,'../..'),base=join(workspace,'.frameweave/rigid-body-effects'),sha=b=>createHash('sha256').update(b).digest('hex');
const rustc=process.env.RUSTC??'rustc',cargo=process.env.CARGO??'cargo';
const version=execFileSync(rustc,['--version'],{encoding:'utf8',windowsHide:true}).trim(),cargoVersion=execFileSync(cargo,['--version'],{encoding:'utf8',windowsHide:true}).trim();
if(version.split(' ')[1]!=='1.99.1'||cargoVersion.split(' ')[1]!=='1.99.1')throw Error('Review compiler/Cargo/std before changing Rust1.99.1');
const cargoHome=process.env.CARGO_HOME??join(base,'cargo-home'),target=process.env.CARGO_TARGET_DIR??join(base,'cargo-target');
for(const dir of [cargoHome,target]){await mkdir(dir,{recursive:true});const rel=relative(await realpath(workspace),await realpath(dir));if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Use this worktree private Cargo cache/target, no external/shared directory');}
const env={...process.env,CARGO_HOME:cargoHome,CARGO_TARGET_DIR:target};
function run(args){return execFileSync(cargo,[...args,'--locked','--offline','--manifest-path',join(root,'rust/Cargo.toml')],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024});}
const metadata=JSON.parse(run(['metadata','--format-version','1']));
const reviewedLicenses=new Set(['MIT OR Apache-2.0','Apache-2.0','Apache-2.0 OR MIT','Zlib OR Apache-2.0 OR MIT','Unlicense OR MIT','Zlib','MIT','MIT/Apache-2.0','(MIT OR Apache-2.0) AND Unicode-3.0']);
for(const p of metadata.packages)if(!reviewedLicenses.has(p.license))throw Error('Review changed dependency license: '+p.name+' '+p.license);
const rootPackage=metadata.packages.find(p=>p.id===metadata.resolve.root),pin=rootPackage.dependencies.find(d=>d.name==='rapier3d-f64');
if(pin.req!=='=0.36.1'||pin.uses_default_features||['parallel','block-solver','fem','profiler'].some(f=>pin.features.includes(f)))throw Error('Review changed Rapier version/features');
const dependencies=await verifyRegistry(root,cargoHome,metadata);await collectLicenses(root,metadata);
const flags=['--remap-path-prefix',root+'=.','--remap-path-prefix',resolve(cargoHome)+'=/reviewed-crates','-C','debuginfo=0'];
if(process.env.FRAMEWEAVE_RUST_SYSROOT)flags.push('--sysroot',resolve(process.env.FRAMEWEAVE_RUST_SYSROOT));
if(process.env.FRAMEWEAVE_RUST_LINKER)flags.push('-C','linker='+resolve(process.env.FRAMEWEAVE_RUST_LINKER));
const start=performance.now();run(['build','--release','--target','wasm32-unknown-unknown','--config','target.wasm32-unknown-unknown.rustflags='+JSON.stringify(flags)]);const rustMs=performance.now()-start;
await verifyRegistry(root,cargoHome,metadata);await mkdir(join(root,'dist'),{recursive:true});
const wasm=await readFile(join(target,'wasm32-unknown-unknown/release/fw_rigid_body_module.wasm')),compiled=await WebAssembly.compile(wasm);if(WebAssembly.Module.imports(compiled).length)throw Error('C1 bytes-v1 must have no host imports');
await writeFile(join(root,'dist/module.wasm'),wasm);
const worker=await build({absWorkingDir:root,entryPoints:['runtime/worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,legalComments:'inline',metafile:true});await writeFile(join(root,'dist/worker.js'),worker.outputFiles[0].contents);
const coreInputs={};for(const name of Object.keys(worker.metafile.inputs)){const file=resolve(root,name),rel=relative(workspace,file).replaceAll('\\','/');if(rel.startsWith('src/'))coreInputs[rel]=sha(await readFile(file));}
const inputs={};async function files(dir,prefix=''){for(const entry of(await readdir(join(root,dir,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=join(dir,prefix,entry.name).replaceAll('\\','/');if(entry.isDirectory())await files(dir,join(prefix,entry.name));else inputs[name]=sha(await readFile(join(root,name)));}}
for(const dir of ['rust','runtime','licenses'])await files(dir);for(const file of ['src/config.ts','src/mesh-shapes.ts','src/types.ts','scripts/build-solver.mjs'])inputs[file]=sha(await readFile(join(root,file)));
const record={binding:'bytes-v1',compiler:version,cargo:cargoVersion,target:'wasm32-unknown-unknown',features:pin.features,defaultFeatures:false,hostImports:WebAssembly.Module.imports(compiled),dependencies,inputs,coreInputs,outputs:{'dist/module.wasm':sha(wasm),'dist/worker.js':sha(worker.outputFiles[0].contents)},wasmBytes:wasm.length,note:'Core FixedStepRunner is bundled unchanged into the Kit Worker/data adapter. Rust only steps/serializes/restores the exact reviewed Rapier world. Runtime never downloads Cargo/code.'};
await writeFile(join(root,'dist/build.json'),JSON.stringify(record,null,2));await writeFile(join(base,'last-build-metrics.json'),JSON.stringify({rustMs,wasmBytes:wasm.length,workerBytes:worker.outputFiles[0].contents.length},null,2));console.log(JSON.stringify({ok:true,rustMs,wasmBytes:wasm.length,dependencies:dependencies.length,workerBytes:worker.outputFiles[0].contents.length},null,2));
