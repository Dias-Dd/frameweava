"""Assemble a private full Windows x64 installer from reviewed local artifacts.

This builder deliberately cannot authorize redistribution of locally supplied
Servo/NVIDIA binaries. --local-development is mandatory until their recorded
redistribution gates have been cleared. No compiler runs during installation.
"""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, os, shutil, subprocess, time, urllib.request, zipfile

p=argparse.ArgumentParser()
p.add_argument('--artifacts',required=True,type=Path,help='Existing reviewed engineering checkout')
p.add_argument('--inference',required=True,type=Path)
p.add_argument('--models',required=True,type=Path,help='Existing pinned semantic model cache')
p.add_argument('--output',required=True,type=Path)
p.add_argument('--crt',required=True,type=Path,help='Licensed Visual Studio REDIST app-local CRT directory')
p.add_argument('--local-development',action='store_true')
a=p.parse_args()
if os.name!='nt' or not a.local_development: p.error('Only an explicit private Windows local-development bundle is currently qualified.')
source=Path(__file__).resolve().parent.parent
engineering=a.artifacts.resolve(); output=a.output.resolve()
if output==source or source in output.parents or output==engineering or engineering in output.parents:
    p.error('The bundle output must be outside source/development trees.')
output.mkdir(parents=True,exist_ok=True)
ledger=output/'validation-timing.json'
timing=json.loads(ledger.read_text()) if ledger.exists() else {'limitSeconds':420,'totalSeconds':0,'steps':[]}
def record(name,started,code=0):
    timing['steps'].append({'name':name,'seconds':round(time.monotonic()-started,3),'exitCode':code})
    timing['totalSeconds']=sum(s['seconds'] for s in timing['steps'])
    ledger.write_text(json.dumps(timing,indent=2))
    if timing['totalSeconds']>=420: raise RuntimeError('Validation budget exhausted')
def sha(file):
    h=hashlib.sha256()
    with open(file,'rb') as f:
        for data in iter(lambda:f.read(4*1024*1024),b''):h.update(data)
    return h.hexdigest()
def download(name,url,expected=None):
    file=output/name
    if not file.exists():
        req=urllib.request.Request(url,headers={'User-Agent':'Frameweave-full-installer/1'})
        with urllib.request.urlopen(req,timeout=60) as r,open(file,'wb') as f:shutil.copyfileobj(r,f)
    digest=sha(file)
    if expected and digest!=expected:raise RuntimeError('Upstream SHA-256 mismatch: '+name)
    return {'name':name,'url':url,'bytes':file.stat().st_size,'sha256':digest}
started=time.monotonic()
node_url='https://nodejs.org/dist/v22.19.0/node-v22.19.0-win-x64.zip'
with urllib.request.urlopen('https://nodejs.org/dist/v22.19.0/SHASUMS256.txt',timeout=30) as r:
    node_sha=next(x.split()[0] for x in r.read().decode().splitlines() if x.split()[-1]=='node-v22.19.0-win-x64.zip')
jobs=[('node.zip',node_url,node_sha),('python.zip','https://www.python.org/ftp/python/3.13.7/python-3.13.7-embed-amd64.zip',None),
      ('ffmpeg.gz','https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz',None),
      ('ffprobe.gz','https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-win32-x64.gz',None)]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:upstream=list(pool.map(lambda job:download(*job),jobs))
if hashlib.md5((output/'python.zip').read_bytes()).hexdigest()!='77f294ec267596827a2ab06e8fa3f18c':raise RuntimeError('Python official release fingerprint mismatch')
(output/'upstream.json').write_text(json.dumps(upstream,indent=2))
record('acquire-pinned-upstreams',started)
started=time.monotonic()
# Physical copies, not links to another workspace. The source lock is shipped.
shutil.copytree(engineering/'node_modules/typescript',source/'node_modules/typescript',dirs_exist_ok=True)
native_build=source/'.frameweave/native-target/release';native_build.mkdir(parents=True,exist_ok=True)
for name in ['frameweave-native-gpu.exe','native-build.json']:
    shutil.copy2(engineering/'.frameweave/native-target/release'/name,native_build/name)
sm=engineering/'native-bin/win32-x64/frameweave-spidermonkey-host.exe'
env={**os.environ,'FRAMEWEAVE_SPIDERMONKEY':str(sm)}
subprocess.run(['node','scripts/build-distribution.mjs'],cwd=source,env=env,check=True)
app=source/'dist'
def dep_ignore(directory,names):
    ignored=[]
    for name in names:
        f=Path(directory)/name
        if f.is_symlink():raise RuntimeError('Symlink in frozen dependency tree: '+str(f))
        if f.relative_to(engineering/'node_modules').as_posix()=='ffmpeg-static/ffmpeg.exe':ignored.append(name)
        if Path(directory).as_posix().endswith('onnxruntime-node/bin/napi-v6') and name in ['darwin','linux']:ignored.append(name)
        if Path(directory).as_posix().endswith('onnxruntime-node/bin/napi-v6/win32') and name=='arm64':ignored.append(name)
    return ignored
shutil.copytree(engineering/'node_modules',app/'node_modules',ignore=dep_ignore)
shutil.copy2(source/'bin/setup-full.mjs',app/'bin/setup-full.mjs')
for name in ['media','servo']:
    native=engineering/'native-bin/win32-x64'/name
    receipt=json.loads((native/(name+'-runtime.json')).read_text())
    for file,digest in receipt['files'].items():
        if sha(native/file)!=digest:raise RuntimeError('Runtime receipt mismatch: '+name+'/'+file)
    shutil.copytree(native,app/'native-bin/win32-x64'/name)
receipt=json.loads((a.inference/'inference-runtime.json').read_text())
for file,digest in receipt['files'].items():
    if sha(a.inference/file)!=digest:raise RuntimeError('Inference receipt mismatch: '+file)
shutil.copytree(a.inference,app/'native-bin/win32-x64/inference')
# Only DLLs from the licensed app-local REDIST list; never copy System32.
crt_files=list(a.crt.glob('*.dll'))
if not crt_files:raise RuntimeError('No app-local redistributable CRT supplied')
for folder in [app/'native-bin/win32-x64']:
    for file in crt_files:shutil.copy2(file,folder/file.name)
python=app/'native-bin/win32-x64/python';python.mkdir(parents=True)
with zipfile.ZipFile(output/'python.zip') as z:z.extractall(python)
for file in crt_files:shutil.copy2(file,python/file.name)
(python/'python313._pth').write_text('python313.zip\n.\nLib/site-packages\nimport site\n')
shutil.copytree(engineering/'.frameweave/pme-python/Lib/site-packages',python/'Lib/site-packages',ignore=shutil.ignore_patterns('__pycache__','pip','pip-*','*.pyc'))
shutil.copytree(engineering/'examples/native-inference',app/'examples/native-inference',ignore=shutil.ignore_patterns('.frameweave','node_modules','artifacts','__pycache__'))
models=[]
espcn=app/'examples/native-inference/model/super-resolution-10.onnx'
if sha(espcn)!='85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e':raise RuntimeError('ESPCN default model differs from pinned model')
models.append({'id':'ESPCN-super-resolution-10','path':espcn.relative_to(app).as_posix(),'bytes':espcn.stat().st_size,'sha256':sha(espcn),'home':False})
prefix=Path('models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/2c4055b12046f11709e9df2c122e59ffbdc2f900')
with zipfile.ZipFile(output/'models.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for file in sorted(a.models.rglob('*')):
        if file.is_file():
            relative=prefix/file.relative_to(a.models)
            z.write(file,relative.as_posix())
            models.append({'id':'multilingual-MiniLM-q8/'+file.name,'path':relative.as_posix(),'bytes':file.stat().st_size,'sha256':sha(file),'home':True})
components=['node-22.19.0','native-wgpu','spidermonkey','servo-local-development','native-media','python-3.13.7','OpenEXR','OpenColorIO','numpy','libvips','DirectML-ONNX-Runtime','ffmpeg-6.1.1','ffprobe-6.1.1','all-11-official-R1-packages']
(app/'install-components.json').write_text(json.dumps({'schemaVersion':1,'profile':'full-local-development-windows-x64','components':components,'models':models,'publicRedistribution':False,'blockingRecord':'modules/servo/THIRD_PARTY_NOTICES.md','nvidiaExperimentalRuntimes':'Not published or included; Vulkan/DirectML are the default backends.'},indent=2))
for name in ['LICENSE','README']:
    download('ffmpeg-'+name,'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/win32-x64.'+name)
    shutil.copy2(output/('ffmpeg-'+name),app/'licenses/ffmpeg-static-5.3.0'/('BUNDLED-'+name))
# Seal all shipped app files, including frozen dependencies. Mutable user data
# and the separately hash-verified FFmpeg downloads live outside this inventory.
sealed=[f for f in sorted(app.rglob('*')) if f.is_file() and f.name!='distribution.json']
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:hashes=list(pool.map(sha,sealed))
inventory={f.relative_to(app).as_posix():digest for f,digest in zip(sealed,hashes)}
(app/'distribution.json').write_text(json.dumps({'schemaVersion':1,'algorithm':'sha256','files':inventory},indent=2))
record('build-and-seal-full-private-app',started)
started=time.monotonic()
with zipfile.ZipFile(output/'engine.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for file in sorted(app.rglob('*')):
        if file.is_file():z.write(file,file.relative_to(app).as_posix())
def artifact(name,target,scope='release',fmt='zip',**extras):
    file=output/name
    return {'name':name,'target':target,'scope':scope,'format':fmt,'bytes':file.stat().st_size,'sha256':sha(file),**extras}
with zipfile.ZipFile(output/'crt.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for file in crt_files:z.write(file,file.name)
manifest={'schemaVersion':1,'platform':'win32-x64','version':'0.1.0-dev.20261110.full-local','distribution':'private-local-development-only','artifacts':[
    artifact('engine.zip','app'),artifact('node.zip','runtime/node',stripPrefix='node-v22.19.0-win-x64'),
    artifact('crt.zip','runtime/node'),
    artifact('models.zip','models','data',stripPrefix='models'),
    artifact('ffmpeg.gz','app/node_modules/ffmpeg-static/ffmpeg.exe',fmt='gzip'),
    artifact('ffprobe.gz','app/native-bin/win32-x64/ffmpeg/ffprobe.exe',fmt='gzip')]}
(output/'windows-x64.json').write_text(json.dumps(manifest,indent=2))
for name in ['install.ps1','install.cmd']:shutil.copy2(source/name,output/name)
record('compress-and-fingerprint-installer',started)
print(json.dumps({'ok':True,'manifest':str(output/'windows-x64.json'),'archiveBytes':sum(x['bytes'] for x in manifest['artifacts']),'uncompressedAppBytes':sum(f.stat().st_size for f in app.rglob('*') if f.is_file()),'publicRedistribution':False,'validationSeconds':timing['totalSeconds']}))
