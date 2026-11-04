"""Acquire fixed official NVIDIA SDK files for explicitly authorized local use.
Never installs a compiler. SDK binaries remain in the ignored worktree cache.
"""
import argparse, concurrent.futures, hashlib, io, json, struct, urllib.request, zipfile, zlib, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / '.frameweave/nvidia'

def fetch(url, start=None, end=None):
    headers = {} if start is None else {'Range': f'bytes={start}-{end}'}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as r:
        if start is not None and r.status != 206:
            raise RuntimeError('Server did not honor exact SDK byte range')
        data = r.read()
    if start is not None and len(data) != end-start+1:
        raise RuntimeError('Truncated SDK range')
    return data

def tensorrt():
    url = 'https://developer.download.nvidia.com/compute/machine-learning/tensorrt/11.4.0/zip/TensorRT-Enterprise-11.4.0.106-Windows-amd64-cuda-13.4-Release-external.zip'
    size = int(urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=20).headers['Content-Length'])
    tail = fetch(url, size-65536, size-1)
    v = struct.unpack_from('<4s4H2LH', tail, tail.rfind(b'PK\x05\x06'))
    length, offset = v[5:7]
    central = fetch(url, offset, offset+length-1)
    fake = central + struct.pack('<4s4H2LH', b'PK\x05\x06', 0, 0, v[3], v[4], length, 0, 0)
    z = zipfile.ZipFile(io.BytesIO(fake))
    libraries = {'nvinfer_11.dll', 'nvonnxparser_11.dll', 'nvinfer_builder_resource_sm120_11.dll', 'nvinfer_builder_resource_ptx_11.dll'}
    selected = [f for f in z.infolist() if not f.is_dir() and ('/include/' in f.filename or Path(f.filename).name in libraries or 'license' in f.filename.lower())]
    def entry(f):
        relative = Path(*Path(f.filename).parts[1:])
        if relative.is_absolute() or '..' in relative.parts:
            raise RuntimeError('Unsafe SDK archive path')
        dest = BASE / 'tensorrt' / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and dest.stat().st_size == f.file_size and zlib.crc32(dest.read_bytes()) == f.CRC:
            return str(relative), hashlib.sha256(dest.read_bytes()).hexdigest()
        h = fetch(url, f.header_offset, f.header_offset+29)
        if h[:4] != b'PK\x03\x04':
            raise RuntimeError('Bad SDK local header')
        name, extra = struct.unpack_from('<HH', h, 26)
        start = f.header_offset+30+name+extra
        packed = fetch(url, start, start+f.compress_size-1)
        data = zlib.decompress(packed, -15) if f.compress_type == 8 else packed
        if len(data) != f.file_size or zlib.crc32(data) != f.CRC:
            raise RuntimeError('SDK entry integrity failure: '+f.filename)
        dest.write_bytes(data)
        return str(relative), hashlib.sha256(data).hexdigest()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        files = dict(pool.map(entry, selected))
    return {'source': url, 'archiveBytes': size, 'archiveHash': 'whole archive not downloaded; ZIP CRC and SHA256 of each materialized entry recorded', 'files': files}

def optix():
    url = 'https://codeload.github.com/NVIDIA/optix-dev/zip/refs/tags/v9.1.0'
    data = fetch(url)
    z = zipfile.ZipFile(io.BytesIO(data))
    files = {}
    for f in z.infolist():
        parts = Path(f.filename).parts[1:]
        if f.is_dir() or not parts:
            continue
        relative = Path(*parts)
        if relative.is_absolute() or '..' in relative.parts:
            raise RuntimeError('Unsafe OptiX archive path')
        p = BASE / 'optix' / relative
        p.parent.mkdir(parents=True, exist_ok=True)
        b = z.read(f)
        p.write_bytes(b)
        files[str(relative)] = hashlib.sha256(b).hexdigest()
    return {'source': url, 'archiveSha256': hashlib.sha256(data).hexdigest(), 'files': files}

def cuda_dependencies():
    packages = [
        ('ort', 'https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.gpu.windows/1.30.0/microsoft.ml.onnxruntime.gpu.windows.1.30.0.nupkg', 'f86f88d2dcdbc1411a5a4f345751c37a85f965300e150da6d882bea41ea7296d'),
        ('cudnn', 'https://files.pythonhosted.org/packages/87/6a/e55ff0ac26a5c6e2b21f41c9d04ad096b4ed6da593fba7e25845c61b0532/nvidia_cudnn_cu13-9.27.0.42-py3-none-win_amd64.whl', '7d96f634adafd55c72231eb0500ca77ab109ec8ebff7b33000b76e081bc4558e'),
    ]
    result = {}
    for name, url, expected in packages:
        directory = BASE/name
        directory.mkdir(exist_ok=True)
        prior = directory/'source.json'
        if prior.exists():
            receipt = json.loads(prior.read_text())
            if receipt.get('archiveSha256') == expected and all((directory/f).is_file() and hashlib.sha256((directory/f).read_bytes()).hexdigest() == h for f, h in receipt['files'].items()):
                result[name] = receipt
                continue
        data = fetch(url)
        if hashlib.sha256(data).hexdigest() != expected:
            raise RuntimeError('NVIDIA/ORT fixed archive hash mismatch: '+name)
        z = zipfile.ZipFile(io.BytesIO(data))
        files = {}
        for f in z.infolist():
            if ('license' in f.filename.lower() or f.filename.endswith('.dll') and (name != 'ort' or 'win-x64/native/' in f.filename)) and not f.is_dir():
                b = z.read(f)
                filename = Path(f.filename).name
                (directory/filename).write_bytes(b)
                files[filename] = hashlib.sha256(b).hexdigest()
        receipt = {'source': url, 'archiveSha256': expected, 'files': files, 'localDevelopmentOnly': True}
        prior.write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf8')
        result[name] = receipt
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--accept-local-nvidia-license', action='store_true')
    args = parser.parse_args()
    if not args.accept_local_nvidia_license:
        raise SystemExit('Operator must authorize NVIDIA SDK licenses before acquisition')
    BASE.mkdir(parents=True, exist_ok=True)
    begin = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending = {k: pool.submit(fn) for k, fn in [('tensorrt', tensorrt), ('optix', optix), ('cudaDependencies', cuda_dependencies)]}
        result = {k: f.result() for k, f in pending.items()}
    result.update(version=1, localDevelopmentOnly=True, binariesRedistributed=False, elapsedMs=(time.perf_counter()-begin)*1000)
    (BASE/'sdk-sources.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'elapsedMs': result['elapsedMs'], 'sdks': list(pending)}))
