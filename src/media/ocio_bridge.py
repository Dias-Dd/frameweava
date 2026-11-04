"""Fixed, explicit OCIO/OpenEXR adapter. No code downloads, eval, network or arbitrary imports."""
import json, sys, hashlib, os
from pathlib import Path
import numpy as np
from functools import lru_cache

@lru_cache(maxsize=2)
def ocio_config(name):
    import PyOpenColorIO as ocio
    return ocio.Config.CreateFromBuiltinConfig(name)

@lru_cache(maxsize=8)
def ocio_processor(name, source, destination, display, view):
    import PyOpenColorIO as ocio
    c = ocio_config(name)
    if display:
        t = ocio.DisplayViewTransform(); t.setSrc(source); t.setDisplay(display); t.setView(view)
        processor = c.getProcessor(t)
    else: processor = c.getProcessor(source, destination)
    return processor.getDefaultCPUProcessor(), processor.getCacheID()

def run(r):
    op = r['operation']
    if op in ['read-icc', 'write-icc']:
        # Reuse the already installed libvips (the same one used by sharp on Windows).
        # Explicit PCS float avoids the fast packed RGB CLUT's dark/saturated error.
        dll_directory = None
        if r.get('vipsDirectory') and os.name == 'nt':
            os.environ['PATH'] = r['vipsDirectory'] + os.pathsep + os.environ['PATH']
            dll_directory = os.add_dll_directory(r['vipsDirectory'])
        import pyvips
        if op == 'write-icc':
            if r['profile'] not in ['srgb', 'p3']: raise ValueError('Unsupported ICC output profile')
            image = np.fromfile(r['input'], dtype='<f4').reshape(r['height'], r['width'], 4).copy()
            if r['alpha'] == 'premultiplied':
                np.divide(image[:, :, :3], image[:, :, 3:4], out=image[:, :, :3], where=image[:, :, 3:4] != 0)
                image[:, :, :3][image[:, :, 3] == 0] = 0
            if not np.isfinite(image).all() or image.min() < 0 or image.max() > 1: raise ValueError('Bounded SDR codes required')
            samples = np.rint(image * 65535).astype(np.uint16)
            v = pyvips.Image.new_from_memory(samples.tobytes(), r['width'], r['height'], 4, 'ushort').copy(interpretation='rgb16')
            rgb = v.extract_band(0, n=3).icc_import(input_profile='srgb', intent='relative', pcs='lab').icc_export(output_profile=r['profile'], depth=16, intent='relative')
            rgb.bandjoin(v.extract_band(3)).tiffsave(r['output'], compression='lzw')
        else:
            v = pyvips.Image.new_from_buffer(Path(r['input']).read_bytes(), '', access='sequential', fail_on='warning')
            has_alpha = v.hasalpha()
            rgb = v.extract_band(0, n=v.bands - 1) if has_alpha else v
            args = {'input_profile': 'srgb'} if r['assumeSrgb'] else {'embedded': True}
            rgb = rgb.icc_import(intent='relative', pcs='lab', **args).icc_export(output_profile='srgb', depth=16, intent='relative')
            # Alpha never passes through the colour processor.
            alpha = v.extract_band(v.bands - 1).cast('double') if has_alpha else None
            if alpha is not None:
                maximum = 65535 if v.format == 'ushort' else 255
                alpha = (alpha * (65535 / maximum)).rint().cast('ushort')
                rgb = rgb.bandjoin(alpha)
            else: rgb = rgb.bandjoin(65535)
            pixels = np.frombuffer(rgb.write_to_memory(), dtype=np.uint16).reshape(v.height, v.width, 4).astype('<f4') / 65535
            pixels.tofile(r['output'])
        return {'binding': pyvips.__version__, 'vips': '.'.join(str(pyvips.version(i)) for i in range(3)), 'intent': 'relative', 'pcs': 'float-Lab', 'depth': 16, **({'width': v.width, 'height': v.height} if op == 'read-icc' else {})}
    if op == 'ocio-info' or op == 'ocio':
        import PyOpenColorIO as ocio
        name = r.get('config', 'cg-config-v4.0.0_aces-v2.0_ocio-v2.5')
        if name not in ['cg-config-v4.0.0_aces-v2.0_ocio-v2.5', 'studio-config-v4.0.0_aces-v2.0_ocio-v2.5']:
            raise ValueError('E_MEDIA_OCIO_PROFILE: only pinned built-in ACES 2.0 profiles are supported')
        c = ocio_config(name)
        info = {'version': ocio.__version__, 'config': name, 'configSha256': hashlib.sha256(c.serialize().encode()).hexdigest(), 'spaces': list(c.getColorSpaceNames()), 'displays': {d: list(c.getViews(d)) for d in c.getDisplays()}}
        if op == 'ocio-info': return info
        image = np.fromfile(r['input'], dtype='<f4').reshape(r['height'], r['width'], 4).copy()
        a = image[:, :, 3].copy()
        if r['alpha'] == 'premultiplied': np.divide(image[:, :, :3], a[:, :, None], out=image[:, :, :3], where=a[:, :, None] != 0); image[:, :, :3][a == 0] = 0
        processor, cache_id = ocio_processor(name, r['source'], r.get('destination'), r.get('display'), r.get('view'))
        processor.apply(ocio.PackedImageDesc(image, r['width'], r['height'], 4))
        image[:, :, 3] = a
        if r['alpha'] == 'premultiplied': image[:, :, :3] *= a[:, :, None]
        if not np.isfinite(image).all(): raise ValueError('E_MEDIA_NONFINITE: OCIO output contains non-finite data')
        image.astype('<f4').tofile(r['output']); info['processorCacheID'] = cache_id; return info
    if op == 'write-exr' or op == 'read-exr':
        import OpenEXR
        if op == 'write-exr':
            image = np.fromfile(r['input'], dtype='<f4').reshape(r['height'], r['width'], 4)
            if r['format'] == 'rgba16float': image = image.astype(np.float16)
            header = {'type': OpenEXR.scanlineimage, 'compression': OpenEXR.ZIP_COMPRESSION, 'chromaticities': tuple(r['chromaticities']), 'frameweaveColor': json.dumps(r['color']), 'frameweaveAlpha': r['alpha']}
            channels = {name: np.ascontiguousarray(image[:, :, i]) for i, name in enumerate('RGBA')}
            with OpenEXR.File(header, channels) as f: f.write(r['output'])
            return {'version': OpenEXR.__version__, 'format': r['format'], 'alpha': r['alpha']}
        with OpenEXR.File(r['input'], separate_channels=True) as f:
            channels = f.channels(); image = np.stack([channels[n].pixels for n in 'RGBA'], axis=2)
            image.astype('<f4').tofile(r['output']); h = f.header()
            return {'version': OpenEXR.__version__, 'width': image.shape[1], 'height': image.shape[0], 'type': str(image.dtype), 'color': json.loads(h['frameweaveColor']) if 'frameweaveColor' in h else None, 'alpha': h.get('frameweaveAlpha'), 'chromaticities': list(h.get('chromaticities', []))}
    raise ValueError('E_MEDIA_BRIDGE: unknown operation')

def handle(file, worker=False):
    try:
        request = json.loads(Path(file).read_text(encoding='utf-8'))
        if worker and request.get('operation') != 'ocio': raise ValueError('Worker accepts only fixed OCIO transforms')
        return {'ok': True, 'data': run(request)}
    except Exception as error: return {'ok': False, 'error': str(error)}

if sys.argv[1] == '--worker':
    for line in sys.stdin:
        try:
            command = json.loads(line)
            result = handle(command['requestFile'], True)
            print(json.dumps({'id': command['id'], 'result': result}), flush=True)
        except Exception as error:
            print(json.dumps({'id': None, 'result': {'ok': False, 'error': str(error)}}), flush=True)
else:
    result = handle(sys.argv[1]); print(json.dumps(result)); sys.exit(0 if result['ok'] else 1)
