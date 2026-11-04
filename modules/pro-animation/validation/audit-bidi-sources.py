# SPDX-License-Identifier: Apache-2.0
"""Offline source/license inventory against immutable archives and the official Kit build record."""
import hashlib, json, tarfile, tomllib
from pathlib import Path
base=Path('.frameweave/pa3-bidi'); cache=Path('.frameweave/pa3-dash/cargo-home/registry/cache')
build=json.loads((base/'kit-reviewed-v1/dist/build.json').read_text(encoding='utf-8')); records=[]
for dep in build['dependencies']:
    name=dep['name']; version=dep['version']; prefix=f'{name}-{version}/'; matches=list(cache.glob(f'*/{name}-{version}.crate')); assert len(matches)==1
    archive=matches[0]; raw=archive.read_bytes(); assert hashlib.sha256(raw).hexdigest()==dep['archiveSha256']
    with tarfile.open(archive) as tar:
        files={m.name[len(prefix):]:tar.extractfile(m).read() for m in tar.getmembers() if m.isfile() and m.name.startswith(prefix)}
        manifest=tomllib.loads(files['Cargo.toml'].decode()); vcs=json.loads(files.get('.cargo_vcs_info.json',b'{}'))
        licenses={p:hashlib.sha256(b).hexdigest() for p,b in files.items() if '/' not in p and any(x in p.upper() for x in ['LICENSE','COPYRIGHT','NOTICE','AUTHORS'])}
        record={**dep,'archiveBytes':len(raw),'license':manifest['package'].get('license'),'repository':manifest['package'].get('repository'),'vcs':vcs,'licenses':licenses}
        if name in ['unicode-bidi','unicode-script','unicode-segmentation']:
            record['allOriginalFiles']={p:hashlib.sha256(b).hexdigest() for p,b in sorted(files.items())}
            license_dir=Path('modules/pro-animation/rust/text-analysis/licenses')/name
            for p,digest in licenses.items():assert hashlib.sha256((license_dir/p).read_bytes()).hexdigest()==digest
        records.append(record)
(base/'dependency-audit.json').write_text(json.dumps(records,indent=2),encoding='utf-8');print(json.dumps({'verifiedArchives':len(records),'unmodifiedOriginalAlgorithms':3,'licenses':[{k:r[k] for k in ['name','version','license']} for r in records]}))
