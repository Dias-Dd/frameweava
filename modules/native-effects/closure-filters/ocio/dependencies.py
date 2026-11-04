"""Freeze installed/offline tool identities and licenses, without copying caches."""
from pathlib import Path
import hashlib,json,tomllib
root=Path.cwd();registry=Path.home()/'.cargo/registry/src/index.crates.io-1949cf8c6b5b557f'
lock=tomllib.loads((root/'modules/native-effects/closure-filters/ocio/compiler/Cargo.lock').read_text(encoding='utf-8'))
deps=[]
for p in lock['package']:
    if 'source' not in p: continue
    directory=registry/(p['name']+'-'+p['version']);manifest=tomllib.loads((directory/'Cargo.toml').read_text(encoding='utf-8'))['package']
    deps.append(dict(name=p['name'],version=p['version'],checksum=p['checksum'],license=manifest.get('license'),licenseFile=manifest.get('license-file'),scope='offline WGSL preparation compiler only'))
binaries=[]
for p in (root/'.frameweave/pme-python/Lib/site-packages/PyOpenColorIO').glob('**/*.pyd'):
    binaries.append(dict(file=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
print(json.dumps(dict(compilerDependencies=deps,ocioVersion='2.5.2',installedOcioBinaries=binaries,unknownLicenses=[d for d in deps if not d['license'] and not d['licenseFile']]),allow_nan=False))
