// SPDX-License-Identifier: Apache-2.0
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {sha,fail,inside} from './audit.mjs';
/** Read-only crate archive inventory, cryptographically bound to Cargo.lock. No extraction. */
export function crateFiles(archive,prefix){
  const bytes=gunzipSync(archive,{maxOutputLength:64*1024*1024}),files=new Map();let longName,pax={};
  const str=buffer=>buffer.toString('utf8').replace(/\0.*$/s,'');
  for(let offset=0;offset+512<=bytes.length;){const header=bytes.subarray(offset,offset+512);if(header.every(n=>n===0))break;
    const size=parseInt(str(header.subarray(124,136)).trim()||'0',8),kind=String.fromCharCode(header[156]||48);
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>bytes.length)fail('E_BINDGEN_REGISTRY','Invalid crate archive size');
    const data=bytes.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;
    if(kind==='L'){longName=str(data).replace(/\n$/,'');continue;}
    if(kind==='x'){
      pax={};for(let p=0;p<data.length;){const space=data.indexOf(32,p),n=Number(data.subarray(p,space).toString());if(space<0||!n||p+n>data.length)fail('E_BINDGEN_REGISTRY','Invalid PAX record');const record=data.subarray(space+1,p+n-1).toString(),eq=record.indexOf('=');pax[record.slice(0,eq)]=record.slice(eq+1);p+=n;}continue;
    }
    const base=str(header.subarray(0,100)),parent=str(header.subarray(345,500));let name=pax.path??longName??(parent?parent+'/'+base:base);pax={};longName=undefined;
    if(kind==='5')continue;if(kind!=='0')fail('E_BINDGEN_REGISTRY',`Unsupported crate archive entry ${kind}`);
    if(!name.startsWith(prefix+'/'))fail('E_BINDGEN_REGISTRY','Unexpected crate root');name=name.slice(prefix.length+1);
    if(!name||name.includes('\\')||name.includes(':')||name.split('/').some(p=>p==='..'||p===''))fail('E_BINDGEN_REGISTRY','Unsafe crate archive path');
    if(files.has(name))fail('E_BINDGEN_REGISTRY','Duplicate crate entry');files.set(name,sha(data));
  }
  if(!files.size)fail('E_BINDGEN_REGISTRY','Empty crate archive');return files;
}
export async function verifyRegistry(root,cargoHome,metadata){
  const lock=await readFile(join(root,'rust/Cargo.lock'),'utf8'),pins=lock.split('[[package]]').slice(1).map(block=>Object.fromEntries([...block.matchAll(/^(name|version|source|checksum) = "([^"]*)"/gm)].map(m=>[m[1],m[2]])));
  const records=[];
  for(const pkg of metadata.packages.filter(p=>p.id!==metadata.resolve.root).sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version))){
    if(pkg.source!=='registry+https://github.com/rust-lang/crates.io-index')fail('E_BINDGEN_CARGO_SOURCE','Only explicit locked crates.io dependencies are supported');
    const pin=pins.find(p=>p.name===pkg.name&&p.version===pkg.version);if(!pin?.checksum)fail('E_BINDGEN_REGISTRY','Registry dependency lacks a checksum');
    const directory=dirname(pkg.manifest_path),real=await realpath(directory),index=basename(dirname(directory));
    if(!inside(await realpath(join(cargoHome,'registry/src')),real))fail('E_BINDGEN_REGISTRY','Dependency source escapes the selected Cargo home');
    const archive=await readFile(join(cargoHome,'registry/cache',index,`${pkg.name}-${pkg.version}.crate`));if(sha(archive)!==pin.checksum)fail('E_BINDGEN_REGISTRY','Cached crate archive disagrees with Cargo.lock');
    const expected=crateFiles(archive,`${pkg.name}-${pkg.version}`);
    for(const [name,hash]of expected){const file=join(directory,name);if((await lstat(file)).isSymbolicLink()||!inside(real,await realpath(file))||sha(await readFile(file))!==hash)fail('E_BINDGEN_REGISTRY',`Registry source changed: ${pkg.name}/${name}`);}
    async function walk(path=directory,relative=''){for(const item of await readdir(path,{withFileTypes:true})){const name=relative+item.name,file=join(path,item.name);if(item.isSymbolicLink())fail('E_BINDGEN_REGISTRY','Registry source link');if(item.isDirectory())await walk(file,name+'/');else if(!expected.has(name)&&!['.cargo-ok','.cargo-checksum.json'].includes(name))fail('E_BINDGEN_REGISTRY',`Untracked registry source file: ${name}`);}}
    await walk();records.push({name:pkg.name,version:pkg.version,archiveSha256:pin.checksum,sourceFileCount:expected.size,sourceInventorySha256:sha(JSON.stringify([...expected].sort(([a],[b])=>a<b?-1:a>b?1:0)))});
  }
  return records;
}
