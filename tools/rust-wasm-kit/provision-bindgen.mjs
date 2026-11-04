// SPDX-License-Identifier: Apache-2.0
// Explicit build-time provisioning only. Module build and runtime never download a CLI.
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const version='0.2.129',base=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const name=`wasm-bindgen-${version}-x86_64-pc-windows-msvc.tar.gz`;
const sha='79e348c169d0c10c0b287647f1e753d0985353ca96800bc29be8f4261baf13e6';
async function main(){
  const args=process.argv.slice(2);if(args.length||process.platform!=='win32'||process.arch!=='x64')throw Error('This reviewed downloader supports Windows x64 only, with no arguments. On other hosts set WASM_BINDGEN to an independently reviewed 0.2.129 CLI.');
  if(JSON.parse(await readFile(join(base,'package.json'),'utf8')).name!=='@frameweave/engine')throw Error('Tool destination must be this reviewed Frameweave checkout');
  const directory=join(base,'.frameweave/bindgen-tools');await mkdir(directory,{recursive:true});
  const path=join(directory,name),url=`https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${version}/${name}`;
  let bytes;try{bytes=await readFile(path);}catch{const response=await fetch(url);if(!response.ok)throw Error(`Official CLI download failed (${response.status})`);bytes=Buffer.from(await response.arrayBuffer());}
  if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Official release SHA-256 mismatch; no code extracted/executed');
  await writeFile(path,bytes);
  const entries=execFileSync('tar',['-tzf',path],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
  if(entries.some(e=>e.startsWith('/')||e.includes('..')||e.includes(':')))throw Error('Unsafe archive entry');
  execFileSync('tar',['-xzf',path,'-C',directory],{windowsHide:true});
  const executable=join(directory,name.replace('.tar.gz',''),'wasm-bindgen.exe');
  const binarySha256=createHash('sha256').update(await readFile(executable)).digest('hex');
  const record={version,url,archiveSha256:sha,executable:resolve(executable),binarySha256};
  await writeFile(join(directory,'tool.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
