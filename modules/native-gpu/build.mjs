import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
if(args.some(a=>!['--check','--diagnostics','--release','--gles'].includes(a)))throw new Error('Expected --check, --diagnostics, --release, --gles');
const features=[...args.includes('--diagnostics')?['diagnostics']:[],...args.includes('--gles')?['gles']:[]];
const cargo=process.env.CARGO??join(process.env.CARGO_HOME??join(homedir(),'.cargo'),'bin',process.platform==='win32'?'cargo.exe':'cargo');
if(!existsSync(cargo))throw new Error('Rust/Cargo must be installed explicitly; this tool never downloads a compiler');
mkdirSync(join(root,'.frameweave/native-target'),{recursive:true});
const inputFiles=['Cargo.toml','Cargo.lock','src/main.rs','src/preview_audio.rs','src/preview_audio_linux.rs','src/preview_controls.rs','src/preview-controls.wgsl','src/gpu.rs','src/protocol.rs','src/seed_transport.rs','src/binary_resource.rs','src/encode.rs','src/external_windows.rs','src/native_module.rs','src/native_module_windows.rs','src/native_video.rs','src/native_ray.rs','src/native_optix.rs','src/native_optix_windows.rs','src/ray_contract.rs','src/ray_policy.rs','src/ray/gather.wgsl','src/ray/query.wgsl','src/ray/coverage.wgsl','src/native_inference.rs','src/native_inference_windows.rs','src/reviewed_runtime_windows.rs','src/inference_contract.rs','src/external_tensor_windows.rs','src/native_video_windows.rs','src/native_encode_windows.rs','src/mesh_transparency.rs','src/half.wgsl','../servo/native/interop.wgsl','../servo/native/from-servo.wgsl','build.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=()=>Object.fromEntries(inputFiles.map(file=>[file,sha(readFileSync(join(root,'modules/native-gpu',file)))]));
const inputHashes=inputs(),sourceCommit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
const sourceDirty=spawnSync('git',['status','--porcelain','--','modules/native-gpu'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
let shortRoot=root,drive;
// GNU/Windows object filenames can exceed MAX_PATH in this worktree.
// The temporary alias points ONLY at this worktree; its target dir remains local.
if(process.platform==='win32'&&root.length>100){
 for(const letter of ['Q','R','S','T','U','V','W','X','Y','Z']){
  if(existsSync(letter+':/'))continue;
  const mapped=spawnSync('subst',[letter+':',root],{windowsHide:true,encoding:'utf8'});
  if(mapped.status===0){drive=letter+':';shortRoot=drive+'/';break;}
 }
 if(!drive)throw new Error('E_NATIVE_BUILD_PATH: no temporary short drive available; use a shorter checkout path');
}
try{
 const compiler=join(dirname(cargo),process.platform==='win32'?'rustc.exe':'rustc');
 const compilerVersion=spawnSync(compiler,['-vV'],{encoding:'utf8',windowsHide:true}).stdout?.trim();
 const flags=process.platform==='win32'&&!process.env.RUSTFLAGS&&compilerVersion?.includes('host: x86_64-pc-windows-gnu')?{RUSTFLAGS:'-C link-self-contained=yes'}:{};
 const started=performance.now();
 const result=spawnSync(cargo,[args.includes('--check')?'check':'build','--locked','--offline',
  '--manifest-path','modules/native-gpu/Cargo.toml',...features.length?['--features',features.join(',')]:[],
  ...args.includes('--release')?['--release']:[]],{
  cwd:shortRoot,env:{...process.env,CARGO_TARGET_DIR:join(shortRoot,'.frameweave/native-target'),
   // Rust bundles current MinGW imports. Old external Conda MinGW lacks GetHostNameW.
   ...flags},
  stdio:'inherit',windowsHide:true,
 });
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
 if(result.status===0&&!args.includes('--check')){
  if(JSON.stringify(inputs())!==JSON.stringify(inputHashes))throw new Error('E_NATIVE_BUILD_CHANGED: source changed during Cargo build');
  const profile=args.includes('--release')?'release':'debug',directory=join(root,'.frameweave/native-target',process.env.CARGO_BUILD_TARGET??'',profile);
  const executable=join(directory,'frameweave-native-gpu'+(process.platform==='win32'?'.exe':''));
  const binary=readFileSync(executable);
  const receipt={version:1,sourceCommit,sourceDirty:sourceDirty||null,inputHashes,profile,
   features,offline:true,locked:true,wallMs:performance.now()-started,
   compiler:compilerVersion,cargo:spawnSync(cargo,['--version'],{encoding:'utf8',windowsHide:true}).stdout?.trim(),
   flags:{RUSTFLAGS:flags.RUSTFLAGS??process.env.RUSTFLAGS??null,CARGO_ENCODED_RUSTFLAGS:process.env.CARGO_ENCODED_RUSTFLAGS??null,CARGO_BUILD_TARGET:process.env.CARGO_BUILD_TARGET??null},
   executable:{file:executable,bytes:binary.length,sha256:sha(binary)}};
  const file=join(directory,'native-build.json');writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
  console.error(JSON.stringify({nativeBuildReceipt:file,executableSha256:receipt.executable.sha256}));
 }
}finally{
 if(drive){
  // Never remove a mapping that another process has changed.
  const listing=spawnSync('subst',[],{windowsHide:true,encoding:'utf8'}).stdout??'';
  const line=listing.split(/\r?\n/).find(s=>s.startsWith(drive+'\\:')||s.startsWith(drive+'\\'));
  if(line?.toLowerCase().endsWith(root.toLowerCase()))spawnSync('subst',[drive,'/D'],{windowsHide:true});
 }
}
