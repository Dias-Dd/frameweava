"""Explicit operator-only acquisition of pinned official compatible CUDA tools.
Extracts a private worktree toolchain, never runs an installer or changes a driver.
"""
import argparse, concurrent.futures, hashlib, io, json, urllib.request, zipfile, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]/'.frameweave/nvidia/cuda-13.0'
COMPONENTS={
 'cuda_nvcc':('13.0.88','61760e24a44937c6c29a20ddea69067b4d3860ccd6a9a0564573f840d96e6c5f'),
 'libnvvm':('13.0.88','6dda4a82d22a2c173a65c66b4b4c933e3424a56ce845e2864bdca9cc66e6c524'),
 'cuda_crt':('13.0.88','ff413c89dbd96ed3b3dcfac923437de78acea32fb90309277197c8a127588112'),
 'cuda_cudart':('13.0.96','a2ed875f9997aa24904fb70cc9db3acd9308433cde99bc8e63ec1271c9da31b4'),
 'cuda_cccl':('13.0.85','f4f5187f7976d8057d76e1e04e72c8b7d0a2a22793107a671ad709b1d8d3408d'),
}
def acquire(item):
 name,(version,sha)=item;url=f'https://developer.download.nvidia.com/compute/cuda/redist/{name}/windows-x86_64/{name}-windows-x86_64-{version}-archive.zip'
 data=urllib.request.urlopen(url,timeout=90).read()
 if hashlib.sha256(data).hexdigest()!=sha:raise RuntimeError('Official pinned CUDA archive hash mismatch: '+name)
 z=zipfile.ZipFile(io.BytesIO(data));files={}
 for f in z.infolist():
  relative=Path(*Path(f.filename).parts[1:])
  if f.is_dir() or not relative.parts:continue
  if relative.is_absolute() or '..' in relative.parts:raise RuntimeError('Unsafe official archive path')
  path=ROOT/relative;path.parent.mkdir(parents=True,exist_ok=True);b=z.read(f)
  if path.exists() and path.read_bytes()!=b:raise RuntimeError('Conflicting CUDA component path: '+str(relative))
  path.write_bytes(b);files[str(relative)]=hashlib.sha256(b).hexdigest()
 return name,{'url':url,'sha256':sha,'files':files}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--acquire-reviewed-cuda-tools',action='store_true');a=p.parse_args()
 if not a.acquire_reviewed_cuda_tools:raise SystemExit('Explicit operator opt-in required; no automatic compiler acquisition')
 start=time.perf_counter();ROOT.mkdir(parents=True,exist_ok=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:result=dict(pool.map(acquire,COMPONENTS.items()))
 (ROOT/'sources.json').write_text(json.dumps({'version':1,'release':'13.0.2','localOnly':True,'files':result,'elapsedMs':(time.perf_counter()-start)*1000},indent=2)+'\n')
 print(json.dumps({'root':str(ROOT),'seconds':time.perf_counter()-start}))
