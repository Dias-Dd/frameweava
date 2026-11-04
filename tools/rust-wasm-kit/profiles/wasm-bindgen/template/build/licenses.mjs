// SPDX-License-Identifier: Apache-2.0
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {sha,fail} from './audit.mjs';
export async function collectLicenses(root,metadata){
  const lock=await readFile(join(root,'rust/Cargo.lock'),'utf8'),records=[];
  const blocks=lock.split('[[package]]').slice(1).map(block=>Object.fromEntries([...block.matchAll(/^(name|version|source|checksum) = "([^"]*)"/gm)].map(m=>[m[1],m[2]])));
  for(const pkg of metadata.packages.filter(p=>p.id!==metadata.resolve.root).sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version))){
    if(pkg.source!=='registry+https://github.com/rust-lang/crates.io-index')fail('E_BINDGEN_CARGO_SOURCE',`Only locked crates.io sources are supported: ${pkg.name}`);
    const pin=blocks.find(p=>p.name===pkg.name&&p.version===pkg.version);if(!pin?.checksum)fail('E_BINDGEN_CARGO_SOURCE',`Missing registry checksum: ${pkg.name}`);
    const directory=dirname(pkg.manifest_path),destination=join(root,'licenses/registry',`${pkg.name}-${pkg.version}`);await mkdir(destination,{recursive:true});
    const names=(await readdir(directory,{withFileTypes:true})).filter(e=>e.isFile()&&/^(LICENSE|LICENCE|COPYRIGHT|NOTICE|COPYING|UNLICENSE)/i.test(e.name)).map(e=>e.name).sort();
    let origin;
    if(!names.length){
      const override=join(root,'licenses/overrides',`${pkg.name}-${pkg.version}`);let source;
      try{source=JSON.parse(await readFile(join(override,'source.json'),'utf8'));}catch{fail('E_BINDGEN_LICENSE',`${pkg.name}@${pkg.version} omits notices; supply a reviewed licenses/overrides/<name-version>/source.json and hash-pinned files`);}
      const vcs=JSON.parse(await readFile(join(directory,'.cargo_vcs_info.json'),'utf8'));
      if(source.repository!==pkg.repository||source.revision!==vcs.git.sha1)fail('E_BINDGEN_LICENSE','License override must match the published crate repository/revision');
      for(const [name,record]of Object.entries(source.files)){
        if(name.includes('/')||name.includes('\\')||name.includes('..'))fail('E_BINDGEN_LICENSE','Invalid notice path');
        const bytes=await readFile(join(override,name));if(sha(bytes)!==record.sha256)fail('E_BINDGEN_LICENSE','License override hash mismatch');
        await writeFile(join(destination,name),bytes);names.push(name);
      }
      await copyFile(join(override,'source.json'),join(destination,'source.json'));origin=source;
    }else for(const name of names)await copyFile(join(directory,name),join(destination,name));
    records.push({name:pkg.name,version:pkg.version,license:pkg.license,source:pkg.source,checksum:pin.checksum,repository:pkg.repository,manifestSha256:sha(await readFile(pkg.manifest_path)),notices:await Promise.all(names.map(async name=>({file:`licenses/registry/${pkg.name}-${pkg.version}/${name}`,sha256:sha(await readFile(join(destination,name)))}))),...(origin?{override:origin}:{} )});
  }
  await writeFile(join(root,'licenses/dependencies.json'),JSON.stringify(records,null,2)+'\n');return records;
}
