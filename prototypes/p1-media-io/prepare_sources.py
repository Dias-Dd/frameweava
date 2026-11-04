"""Fetch source ONLY when explicitly requested; never fetch a compiler/runtime."""
import argparse, hashlib, json, tarfile, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; BASE=ROOT/'.frameweave/p1/io/upstream'
URL='https://codeload.github.com/AcademySoftwareFoundation/openvdb/tar.gz/refs/tags/v12.1.1'
SHA='ccd0ea1669a53c7c13087a08ac5a1351041c4cdd308f6d6f591074a106fcb565'
p=argparse.ArgumentParser();p.add_argument('--fetch',action='store_true');args=p.parse_args();BASE.mkdir(parents=True,exist_ok=True);archive=BASE/'openvdb-v12.1.1.tar.gz'
if not archive.exists():
    if not args.fetch: raise SystemExit('Missing pinned source archive; explicitly use --fetch after source/license review')
    with urllib.request.urlopen(URL,timeout=30) as r: archive.write_bytes(r.read())
if hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA: raise SystemExit('E_P1_SOURCE_INTEGRITY: archive hash differs; never update the pin automatically')
with tarfile.open(archive) as t:
    members=[m for m in t.getmembers() if m.name.startswith('openvdb-12.1.1/nanovdb/nanovdb/') or m.name in ('openvdb-12.1.1/LICENSE','openvdb-12.1.1/NOTICE')]
    t.extractall(BASE,members=members,filter='data')
files={str(f.relative_to(BASE)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in (BASE/'openvdb-12.1.1').rglob('*') if f.is_file()}
(BASE/'source-manifest.json').write_text(json.dumps({'version':1,'url':URL,'sha256':SHA,'files':files},indent=2)+'\n',encoding='utf8');print(json.dumps({'sourceFiles':len(files),'archiveSha256':SHA}))
