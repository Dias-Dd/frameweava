// SPDX-License-Identifier: Apache-2.0
// Reuse the official Kit v2 as an isolated test/build carrier. This is not a package manager.
import {readFile,writeFile,cp,mkdir,stat} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {initialize} from '../../../tools/rust-wasm-kit/kit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),base=join(root,'.frameweave/pa4-font'),kit=join(base,'kit');
if(process.argv.slice(2).some(x=>x!=='--fetch'))throw Error('Only --fetch permits explicit locked dependency download; normal builds are offline');
await mkdir(base,{recursive:true});
let fresh=false;try{await stat(kit);}catch(error){if(error.code!=='ENOENT')throw error;fresh=true;await initialize(kit,{id:'test.pa4-font',authority:'frameweave.pa3-test',template:'wasm-bindgen',example:'bindings',execution:'worker',version:'0.0.1'});}
const config=JSON.parse(await readFile(join(kit,'module.config.json'),'utf8'));
if(config.binding!=='wasm-bindgen-data-v1'||config.wasmBindgen!=='0.2.129')throw Error('Existing carrier differs from the reviewed Kit profile');
const manifest=JSON.parse(await readFile(join(kit,'frameweave.package.json'),'utf8'));
if(manifest.id!=='test.pa4-font'||manifest.source.authority!=='frameweave.pa3-test')throw Error('Refusing to overwrite an unrelated carrier');
const lock=await readFile(join(root,'modules/pro-animation/rust/font-execution/Cargo.lock'));
// Only a newly initialized, unbuilt official template receives our reviewed source lock.
// Existing identities are immutable; the earlier template-lock mismatch stays preserved in kit/.
if(fresh){await cp(join(kit,'rust/Cargo.lock'),join(base,'fresh-template-Cargo.lock'));await writeFile(join(kit,'rust/Cargo.lock'),lock);}
else if(!(await readFile(join(kit,'rust/Cargo.lock'))).equals(lock))throw Error('Private Cargo lock changed; audit a new carrier instead of replacing existing lock');
config.snippets={}; // This Rust library has no authored JS callbacks; intrinsic policy is unchanged.
await writeFile(join(kit,'module.config.json'),JSON.stringify(config,null,2)+'\n');
await cp(join(root,'modules/pro-animation/rust/font-execution/Cargo.toml'),join(kit,'rust/Cargo.toml'));
await cp(join(root,'modules/pro-animation/rust/font-execution/src'),join(kit,'rust/src'),{recursive:true});
await writeFile(join(kit,'index.ts'),`import {definePlugin} from '@frameweave/engine/plugins';
// Test carrier only; the real typed geometry bindings below are exercised by the Stage.
export default definePlugin({kind:'generator',async create(){throw new Error('Use the reviewed typed data bindings');}});
`);
await writeFile(join(kit,'bindings.ts'),`import type {PluginInit} from '@frameweave/engine/plugins';
import {createEngineApi,type Api} from './generated/api.ts';
export async function initialize(init:PluginInit){const clients=new Set<Api>();return {
 exports:{async createFontExecutionKernel(options:{signal:AbortSignal}){const api=await createEngineApi(init.loadModule,{worker:true,signal:options.signal});clients.add(api);return api;}},
 async dispose(){const errors:unknown[]=[];for(const api of clients)try{await api.dispose();}catch(e){errors.push(e);}clients.clear();if(errors.length)throw new AggregateError(errors,'Geometry carrier cleanup failed');}
};}
`);
await writeFile(join(kit,'bindings-types.d.ts'),`import type {Api} from './generated/api.ts';
export declare function createFontExecutionKernel(options:{signal:AbortSignal}):Promise<Api>;
`);
manifest.description='Private reviewed Original Skrifa font metadata and shaping WASM data carrier for PA3 source-stage tests, not a published image effect';
delete manifest.entry;delete manifest.effect;delete manifest.modules.main; // A data-only carrier must not advertise an image generator.
manifest.modules.bindings={format:'javascript',path:'./bindings.ts'};
manifest.bindings={schemaVersion:1,module:'bindings',types:'./bindings-types.d.ts',initialize:'initialize',engine:'web'};
await writeFile(join(kit,'frameweave.package.json'),JSON.stringify(manifest,null,2)+'\n');

const env={...process.env,FRAMEWEAVE_ENGINE_ROOT:root,CARGO_HOME:process.env.CARGO_HOME??join(root,'.frameweave/pa3-shaping/kit/.frameweave/cargo-home')};
if(process.platform==='win32'){
 env.RUSTC??=join(homedir(),'.cargo/bin/rustc.exe');env.CARGO??=join(homedir(),'.cargo/bin/cargo.exe');
 env.FRAMEWEAVE_RUST_SYSROOT??=join(root,'.frameweave/pa3-pathops/tools/standard-library/rust-std-1.99.1-wasm32-unknown-unknown/rust-std-wasm32-unknown-unknown');
 env.FRAMEWEAVE_RUST_LINKER??=join(homedir(),'.rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/rust-lld.exe');
 // MinGW on this machine needs short target paths and a real WS2_32 import library.
 // These are explicit local build settings; no compiler/library is patched globally.
 const linker=join(root,'.frameweave/pa3-pathops/tools/linker.cmd');try{await stat(linker);env.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER??=linker;}catch{}
 if(!env.FRAMEWEAVE_CARGO_TARGET_DIR){
  let short=root;try{short=execFileSync('cmd',['/d','/s','/c',`for %I in ("${root}") do @echo %~sI`],{encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true}).trim();}catch{}
  env.FRAMEWEAVE_CARGO_TARGET_DIR=join(short,'.frameweave/s2');
 }
}
await cp(join(root,'modules/pro-animation/rust/shaping/licenses'),join(kit,'licenses/supplemental/shaping'),{recursive:true});
const run=command=>execFileSync(process.execPath,[join(kit,'module.mjs'),command],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:12*1024*1024});
if(process.argv.includes('--fetch'))await writeFile(join(base,'fetch-rebuild.txt'),run('fetch'));
const start=performance.now(),output=run('build');await writeFile(join(base,'build-record.json'),output);
const record=JSON.parse(await readFile(join(kit,'dist/build.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of ['lib.rs','original-shaper.rs','original-font-metadata.rs'])if(record.inputs['rust/src/'+file]!==hash(await readFile(join(root,'modules/pro-animation/rust/font-execution/src',file))))throw Error('Built source mismatch: '+file);
const receipt={kit,buildMs:performance.now()-start,wasmSha256:record.outputs['dist/generated/module_bg.wasm'],sourceSha256:record.inputs['rust/src/lib.rs'],cargoLockSha256:hash(lock),generator:record.generator,dependencyCount:record.dependencies.length,policyChanged:false,package:'Test fixture only; Main owns published pro-animation wiring/version/permissions'};
await writeFile(join(base,'build-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
