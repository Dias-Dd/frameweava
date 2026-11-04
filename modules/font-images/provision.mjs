// Explicit build-time import of a frozen, already reviewed original font codec.
// Never called by a Stage, package install or renderer.
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),delivery=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Provide the frozen font-execution-6dd8c4bb delivery directory');
const sha=b=>createHash('sha256').update(b).digest('hex'),source='6dd8c4bb63d3c3dbe371476b731be2254a435ee3';
const receipt=JSON.parse(await readFile(join(delivery,'receipt.json'),'utf8'));
if(receipt.sourceCommit!==source||receipt.wasmSha256!=='1220102271683d298626283fa24e311b08c65a032b5ac8093bfe797227d40e31')throw Error('Wrong frozen codec source/artifact');
for(const [name,hash]of Object.entries(receipt.files)){if(name.split(/[\\/]/).includes('..')||resolve(delivery,name)!==join(delivery,name))throw Error('Invalid delivery path');if(sha(await readFile(join(delivery,name)))!==hash)throw Error('Delivery integrity mismatch: '+name);}
const inputs={};for(const name of ['Cargo.toml','Cargo.lock','src/lib.rs','src/original-font-metadata.rs','src/original-shaper.rs']){
 const data=await readFile(join(delivery,'rust',name)),original=execFileSync('git',['show',source+':modules/pro-animation/rust/font-execution/'+name],{maxBuffer:4*1024**2,windowsHide:true});
 if(!data.equals(original))throw Error('Frozen Rust source mismatch: '+name);inputs[name]=sha(data);
}
await mkdir(join(root,'runtime'),{recursive:true});
const files={};for(const [from,to]of [['dist/binding.mjs','binding.mjs'],['dist/generated/module_bg.wasm','module_bg.wasm']]){const data=await readFile(join(delivery,from));files[to]=sha(data);await writeFile(join(root,'runtime',to),data);}
await cp(join(delivery,'rust'),join(root,'source'),{recursive:true});await cp(join(delivery,'licenses'),join(root,'licenses'),{recursive:true});await cp(join(delivery,'LICENSE'),join(root,'LICENSE'));
await cp(join(delivery,'dist/build.json'),join(root,'runtime/upstream-build.json'));await cp(join(delivery,'source-build-receipt.json'),join(root,'runtime/source-build-receipt.json'));
await writeFile(join(root,'runtime/identity.json'),JSON.stringify({version:1,codec:'font-glyph-v1/skrifa-0.49.0/read-fonts-0.46.0',sourceCommit:source,files,inputs},null,2)+'\n');
console.log(JSON.stringify({files,sourceCommit:source,inputs,license:'original licenses preserved; no private test package identity admitted'}));
