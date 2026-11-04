// Explicit, offline development build. No tool or runtime-code downloads.
import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync,copyFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {CLOCK_SCRIPT} from './clock.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),source=join(root,'modules/servo/native');
const work=join(root,'.frameweave/servo-kit'),runtime=join(work,'runtime'),manifest=join(work,'module');
const metadata=JSON.parse(readFileSync(join(source,'upstream.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2),command=args.shift(),options={};
while(args.length){const name=args.shift();if(name==='--allow-local-development-inputs'){options[name]=true;continue;}if(!['--registry','--mozjs-archive','--angle-dir','--vs-env','--cargo'].includes(name)||!args.length)throw Error('Unknown/incomplete option '+name);options[name]=args.shift();}
function run(executable,args,cwd=root,env={}){const result=spawnSync(executable,args,{cwd,env:{...process.env,...env},windowsHide:true,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`${executable} exited ${result.status}`);}
function checkFile(file,expected){if(sha(readFileSync(file))!==expected)throw Error('E_SERVO_BUILD_INTEGRITY: '+file);}
function files(directory,prefix=''){return readdirSync(directory,{withFileTypes:true}).flatMap(e=>{const name=prefix+e.name;if(e.isSymbolicLink())throw Error('Build inputs cannot contain links');return e.isDirectory()?files(join(directory,e.name),name+'/'):[name];});}
function preparedHashes(){return Object.fromEntries(files(join(work,'vendor')).map(file=>[file,sha(readFileSync(join(work,'vendor',file)))]));}

if(command==='prepare'){
 if(!options['--allow-local-development-inputs'])throw Error('The supplied ANGLE/Mozjs binaries lack independent redistribution qualification. Local development requires --allow-local-development-inputs.');
 if(existsSync(join(work,'prepared.json')))throw Error('Prepared tree already exists; build verifies it. Do not overwrite an existing source tree.');
 const registry=resolve(options['--registry']??''),archive=resolve(options['--mozjs-archive']??''),angle=resolve(options['--angle-dir']??'');
 if(!options['--registry']||!options['--mozjs-archive']||!options['--angle-dir'])throw Error('Explicit --registry, --mozjs-archive and --angle-dir required');
 checkFile(archive,metadata.localDevelopmentInputs.mozjs.sha256);for(const file of metadata.localDevelopmentInputs.angle)checkFile(join(angle,file.file),file.sha256);
 checkFile(join(source,metadata.patch.file),metadata.patch.sha256);
 mkdirSync(join(work,'vendor'),{recursive:true});mkdirSync(manifest,{recursive:true});mkdirSync(runtime,{recursive:true});
 for(const crate of metadata.registryCrates){const target=join(work,'vendor',crate);if(existsSync(target))throw Error('Refusing to overwrite '+target);cpSync(join(registry,crate),target,{recursive:true,errorOnExist:true});}
 for(const file of metadata.patch.changed)checkFile(join(work,'vendor',file.file),file.upstreamSha256);
 const directory=relative(root,join(work,'vendor')).replaceAll('\\','/');
 run('git',['apply','--check','--whitespace=nowarn',`--directory=${directory}`,join(source,metadata.patch.file)]);
 run('git',['apply','--whitespace=nowarn',`--directory=${directory}`,join(source,metadata.patch.file)]);
 for(const file of metadata.patch.changed)checkFile(join(work,'vendor',file.file),file.patchedSha256);
 const dependencies=`servo = { version = "=0.7.0", default-features = false, features = ["baked-in-resources", "js_jit"] }
servo-paint-api = "=0.7.0"
servo-paint = "=0.7.0"
servo-net = "=0.7.0"
servo-net-traits = "=0.7.0"
servo-pixels = "=0.7.0"
webrender = "=0.70.1"
webrender_api = "=0.70.0"
gleam = "0.15"
glow = "0.17.0"
euclid = "0.22"
dpi = "0.1"
url = "2.5"
image = "0.25"
rustls = { version = "0.23", features = ["aws-lc-rs"] }
crossbeam-channel = "0.5"
parking_lot = "0.12"
log = "0.4"
env_logger = "0.11"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"`;
 const patches=metadata.registryCrates.map(crate=>`${crate.replace(/-\d.*$/,'')} = { path = "../vendor/${crate}" }`).join('\n');
 writeFileSync(join(manifest,'Cargo.toml'),`[package]\nname="frameweave-servo-module"\nversion="0.1.0"\nedition="2024"\n[dependencies]\n${dependencies}\n[patch.crates-io]\n${patches}\n[lib]\nname="frameweave_servo"\npath="../../../modules/servo/native/lib.rs"\ncrate-type=["cdylib"]\n`);
 // module is three directories below root: .frameweave/servo-kit/module.
 writeFileSync(join(manifest,'build.rs'),'fn main(){println!("cargo:rustc-link-search=native=../runtime");println!("cargo:rustc-link-lib=dylib=frameweave_servo_bridge");}\n');
 copyFileSync(join(source,'Cargo.lock'),join(manifest,'Cargo.lock'));copyFileSync(archive,join(work,'mozjs-local.tar.gz'));
 for(const file of metadata.localDevelopmentInputs.angle)copyFileSync(join(angle,file.file),join(runtime,file.file));
 writeFileSync(join(runtime,'clock.js'),CLOCK_SCRIPT);
 writeFileSync(join(work,'prepared.json'),JSON.stringify({version:1,upstream:metadata,sourceHashes:preparedHashes(),generatedHashes:Object.fromEntries(['Cargo.toml','Cargo.lock','build.rs'].map(f=>[f,sha(readFileSync(join(manifest,f)))])),localDevelopmentOnly:true},null,2)+'\n');
 console.log(JSON.stringify({ok:true,prepared:work,localDevelopmentOnly:true}));
}else if(command==='build'){
 if(process.platform!=='win32')throw Error('This interop implementation currently requires Windows/MSVC/Vulkan');
 const prepared=JSON.parse(readFileSync(join(work,'prepared.json'),'utf8'));
 if(JSON.stringify(prepared.sourceHashes)!==JSON.stringify(preparedHashes()))throw Error('E_SERVO_BUILD_INTEGRITY: prepared vendor source changed');
 for(const [file,hash]of Object.entries(prepared.generatedHashes))checkFile(join(manifest,file),hash);
 checkFile(join(work,'mozjs-local.tar.gz'),metadata.localDevelopmentInputs.mozjs.sha256);for(const file of metadata.localDevelopmentInputs.angle)checkFile(join(runtime,file.file),file.sha256);
 checkFile(join(runtime,'clock.js'),sha(Buffer.from(CLOCK_SCRIPT)));
 if(!options['--vs-env'])throw Error('Explicit --vs-env pointing to installed vcvars64.bat required');
 const vcvars=resolve(options['--vs-env']);if(/["%\r\n]/.test(vcvars)||!lstatSync(vcvars).isFile())throw Error('Invalid MSVC environment file');
 const script=join(work,'compile-bridge.cmd');writeFileSync(script,`@echo off\r\ncall "${vcvars}"\r\nif errorlevel 1 exit /b 1\r\ncl.exe /LD /std:c++17 /O2 /EHsc modules\\servo\\native\\bridge.cpp /Fo.frameweave\\servo-kit\\runtime\\bridge.obj /link d3d11.lib dxgi.lib user32.lib /OUT:.frameweave\\servo-kit\\runtime\\frameweave_servo_bridge.dll /IMPLIB:.frameweave\\servo-kit\\runtime\\frameweave_servo_bridge.lib\r\n`);
 const trackedInputs=['lib.rs','capacity.rs','bridge.cpp','interop.wgsl','from-servo.wgsl','upstream.json','patches/servo-gpu-frame-v1.patch'];const inputs=()=>Object.fromEntries(trackedInputs.map(f=>[f,sha(readFileSync(join(source,f)))]));const inputHashes=inputs();
 const start=performance.now();run('cmd.exe',['/d','/c',script]);
 const cargo=resolve(options['--cargo']??join(homedir(),'.cargo/bin/cargo.exe'));
 // Keep the usual alias stable: changing it invalidates Cargo's path-sensitive
 // fingerprints and otherwise recompiles Servo during unrelated native builds.
 const drive=['R','S','T','U','V','W','X','Y'].find(d=>!existsSync(d+':/'));if(!drive)throw Error('No free short build alias; use a shorter checkout');
 run('subst',[drive+':',root]);
 try{run(cargo,['build','--offline','--locked','--manifest-path','.frameweave/servo-kit/module/Cargo.toml','--lib'],drive+':/',{PATH:dirname(cargo)+';'+process.env.PATH,RUSTUP_TOOLCHAIN:'stable-x86_64-pc-windows-msvc',CARGO_TARGET_DIR:drive+':/.frameweave/servo-target',MOZJS_ARCHIVE:drive+':/.frameweave/servo-kit/mozjs-local.tar.gz'});}
 finally{const listing=spawnSync('subst',[],{encoding:'utf8',windowsHide:true}).stdout??'';if(listing.toLowerCase().split(/\r?\n/).some(s=>s.startsWith(drive.toLowerCase()+':')&&s.endsWith(root.toLowerCase())))run('subst',[drive+':','/D']);}
 if(JSON.stringify(prepared.sourceHashes)!==JSON.stringify(preparedHashes()))throw Error('E_SERVO_BUILD_INTEGRITY: source changed during build');
 if(JSON.stringify(inputHashes)!==JSON.stringify(inputs()))throw Error('E_SERVO_BUILD_INTEGRITY: module source changed during build');
 copyFileSync(join(root,'.frameweave/servo-target/debug/frameweave_servo.dll'),join(runtime,'frameweave_servo.dll'));
 const names=['frameweave_servo.dll','frameweave_servo_bridge.dll','libEGL.dll','libGLESv2.dll','clock.js'];const hashes=Object.fromEntries(names.map(f=>[f,sha(readFileSync(join(runtime,f)))]));
 writeFileSync(join(runtime,'servo-runtime.json'),JSON.stringify({version:1,abi:1,trusted_local:true,files:hashes},null,2)+'\n');
 // Publish a separate immutable bundle. Recompiling the bridge must never
 // mutate files used by a running owner or invalidate its admitted receipt.
 const digest=sha(Buffer.from(JSON.stringify(hashes))),bundle=join(work,'bundles',digest);mkdirSync(bundle,{recursive:true});
 for(const name of names){const target=join(bundle,name);if(existsSync(target))checkFile(target,hashes[name]);else copyFileSync(join(runtime,name),target);}
 const bundleReceipt=JSON.stringify({version:1,abi:1,trusted_local:true,files:hashes},null,2)+'\n';
 if(existsSync(join(bundle,'servo-runtime.json'))){if(readFileSync(join(bundle,'servo-runtime.json'),'utf8')!==bundleReceipt)throw Error('E_SERVO_BUILD_INTEGRITY: changed immutable bundle receipt');}
 else writeFileSync(join(bundle,'servo-runtime.json'),bundleReceipt);
 const result={version:1,ok:true,wallMs:performance.now()-start,runtime:bundle,stagingRuntime:runtime,upstream:metadata,inputHashes,files:hashes,localDevelopmentOnly:true,compiler:spawnSync(cargo.replace(/cargo\.exe$/,'rustc.exe'),['-vV'],{encoding:'utf8',windowsHide:true}).stdout};writeFileSync(join(work,'build.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,runtime:bundle,wallMs:result.wallMs,localDevelopmentOnly:true}));
}else throw Error('Use: node --import tsx modules/servo/build.mjs prepare|build [explicit local input options]');
