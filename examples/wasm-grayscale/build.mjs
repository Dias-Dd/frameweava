import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const compiler=process.env.RUSTC??'rustc',source=join(root,'rust/src/lib.rs'),output=join(root,'assets/grayscale.wasm');
// Optional local sysroot/linker allow a workspace-only target installation; normal builds need neither.
const extra=[];
if(process.env.FRAMEWEAVE_RUST_SYSROOT)extra.push('--sysroot',resolve(process.env.FRAMEWEAVE_RUST_SYSROOT));
if(process.env.FRAMEWEAVE_RUST_LINKER)extra.push('-C',`linker=${resolve(process.env.FRAMEWEAVE_RUST_LINKER)}`);
const flags=['--edition=2021','--crate-type=cdylib','--target=wasm32-unknown-unknown','-C','opt-level=s','-C','panic=abort','-C','strip=symbols','-C','debuginfo=0',...extra,source,'-o',output];
execFileSync(compiler,flags,{stdio:'inherit',windowsHide:true});
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const provenance={compiler:execFileSync(compiler,['--version'],{encoding:'utf8',windowsHide:true}).trim(),target:'wasm32-unknown-unknown',source:'rust/src/lib.rs',sourceSha256:hash(source),output:'assets/grayscale.wasm',wasmSha256:hash(output),bytes:readFileSync(output).length,flags:['--edition=2021','--crate-type=cdylib','--target=wasm32-unknown-unknown','-C opt-level=s','-C panic=abort','-C strip=symbols','-C debuginfo=0'],abiVersion:1};
writeFileSync(join(root,'assets/build.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify(provenance,null,2));
