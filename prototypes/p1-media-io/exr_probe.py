"""Isolated codec proof. NOT a production parser for untrusted EXR files."""
import argparse, hashlib, json, platform, time
from pathlib import Path
import numpy as np
import OpenEXR as exr

def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def exact(a,b):
    assert a.dtype == b.dtype and a.shape == b.shape
    assert a.tobytes() == b.tobytes(), (a.dtype, a, b)

def flatten(channel):
    counts=np.array([0 if v is None else len(v) for v in channel.flat], dtype='<u4')
    nonempty=[v for v in channel.flat if v is not None and len(v)]
    dtype=nonempty[0].dtype if nonempty else np.dtype('<f4')
    return counts, np.concatenate(nonempty).astype(dtype,copy=False) if nonempty else np.empty(0,dtype=dtype)

def validate(counts,offsets,planes,budget,order='preserve-file-order'):
    if counts.dtype != np.dtype('<u4') or offsets.dtype != np.dtype('<u4'): raise ValueError('E_P1_EXR_INDEX_TYPE')
    wide=np.concatenate(([0],np.cumsum(counts,dtype=np.uint64)))
    if int(wide[-1])>np.iinfo(np.uint32).max or int(wide[-1])>budget: raise ValueError('E_P1_EXR_SAMPLE_BUDGET')
    if not np.array_equal(wide,offsets): raise ValueError('E_P1_EXR_OFFSETS')
    if any(p.ndim!=1 or len(p)!=wide[-1] or p.dtype not in (np.dtype('<f2'),np.dtype('<f4'),np.dtype('<u4')) for p in planes.values()): raise ValueError('E_P1_EXR_CHANNEL_LAYOUT')
    if order=='front-to-back-Z':
        z=planes['Z']
        for a,b in zip(wide[:-1],wide[1:]):
            v=z[int(a):int(b)]
            if not np.isfinite(v).all() or np.any(np.diff(v)<0): raise ValueError('E_P1_EXR_SAMPLE_ORDER')
    elif order!='preserve-file-order': raise ValueError('E_P1_EXR_SAMPLE_ORDER')

def main(output):
    start=time.perf_counter(); output.mkdir(parents=True,exist_ok=True)
    width,height=4,3; shape=(height,width); window=((-5,7),(-2,9))
    flat={'beauty.R':np.linspace(-.25,64,width*height,dtype='<f2').reshape(shape),
          'beauty.G':np.linspace(-2,4,width*height,dtype='<f4').reshape(shape),
          'beauty.B':np.full(shape,16,dtype='<f4'), 'beauty.A':np.full(shape,.5,dtype='<f2'),
          'Z':np.linspace(.125,100,width*height,dtype='<f4').reshape(shape),
          'normal.X':np.full(shape,-1,dtype='<f4'),'motion.Y':np.full(shape,-8,dtype='<f2'),
          'objectId':(np.arange(width*height,dtype='<u4')+np.uint32(0xf0000000)).reshape(shape)}
    flat_file=output/'multichannel.exr'
    with exr.File({'type':exr.scanlineimage,'compression':exr.ZIP_COMPRESSION,'dataWindow':window,'displayWindow':window},dict(flat)) as f: f.write(str(flat_file))
    with exr.File(str(flat_file),separate_channels=True) as f:
        assert set(f.channels())==set(flat)
        assert np.array_equal(f.header()['dataWindow'][0],window[0])
        for name,value in flat.items(): exact(value,f.channels()[name].pixels)
    counts=(np.arange(width*height,dtype='<u4')%4).reshape(shape)
    roles={'beauty.R':'color','beauty.G':'color','beauty.A':'alpha','Z':'depth','ZBack':'depth','normal.X':'vector','objectId':'id'}
    types={'beauty.R':'<f2','beauty.G':'<f4','beauty.A':'<f2','Z':'<f4','ZBack':'<f4','normal.X':'<f4','objectId':'<u4'}
    channels={name:np.empty(shape,dtype=object) for name in roles}
    for y,x in np.ndindex(shape):
        count=int(counts[y,x]); j=np.arange(count,dtype=np.float32)
        z=j+.25
        if count==3: z=z[::-1].copy() # Intentionally unsorted; codec must not silently reorder samples.
        samples={'beauty.R':-j-.25,'beauty.G':j*32,'beauty.A':j*.25,'Z':z,'ZBack':z+.125,'normal.X':np.full(count,-1),'objectId':np.arange(count,dtype=np.uint32)+np.uint32(0xf0000000+(y*width+x)*8)}
        for name in channels: channels[name][y,x]=np.array(samples[name],dtype=types[name]) if count else None
    planes={name:flatten(v)[1] for name,v in channels.items()}
    offsets=np.concatenate(([0],np.cumsum(counts.ravel(),dtype=np.uint64))).astype('<u4')
    validate(counts.ravel(),offsets,planes,100)
    file=output/'deep.exr'
    with exr.File({'type':exr.deepscanline,'compression':exr.ZIPS_COMPRESSION,'dataWindow':window,'displayWindow':window},dict(channels)) as f: f.write(str(file))
    with exr.File(str(file),separate_channels=True) as f:
        assert set(f.channels())==set(channels)
        for name in channels:
            restored_counts,values=flatten(f.channels()[name].pixels)
            exact(counts.ravel(),restored_counts); exact(planes[name],values)
    expected=[('E_P1_EXR_OFFSETS',lambda:validate(counts.ravel(),np.zeros_like(offsets),planes,100)),
              ('E_P1_EXR_SAMPLE_BUDGET',lambda:validate(counts.ravel(),offsets,planes,1)),
              ('E_P1_EXR_SAMPLE_ORDER',lambda:validate(counts.ravel(),offsets,planes,100,'front-to-back-Z')),
              ('E_P1_EXR_CHANNEL_LAYOUT',lambda:validate(counts.ravel(),offsets,{**planes,'Z':planes['Z'][:-1]},100))]
    failures=[]
    for code,fn in expected:
        try: fn()
        except ValueError as e: assert str(e)==code; failures.append(code)
        else: raise AssertionError('Missing error: '+code)
    counts.astype('<u4').tofile(output/'sample-counts.u32'); offsets.tofile(output/'sample-offsets.u32')
    for name,v in planes.items(): v.tofile(output/(name+'.'+str(v.dtype)))
    report={'version':1,'kind':'isolated-codec-proof-not-public-contract','python':platform.python_version(),'openexr':exr.__version__,'numpy':np.__version__,
            'width':width,'height':height,'dataWindow':window,'flatChannels':{n:str(v.dtype) for n,v in flat.items()},
            'deep':{'samples':int(counts.sum()),'channels':{n:{'dtype':str(v.dtype),'role':roles[n]} for n,v in planes.items()},'order':'preserve-file-order','allValuesBitExact':True,'emptyPixelsRetained':True,'uint32IdsAbove2To24Retained':True},
            'negativeCases':failures,'files':{p.name:{'bytes':p.stat().st_size,'sha256':digest(p)} for p in [output/'multichannel.exr',output/'deep.exr',output/'sample-counts.u32',output/'sample-offsets.u32',*[output/(n+'.'+str(v.dtype)) for n,v in planes.items()]]},'elapsedMs':(time.perf_counter()-start)*1000,
            'notValidated':['untrusted-file memory preflight','GPU upload/dispatch','Stage integration','production Deep compositing','large-scene throughput','cross-platform']}
    (output/'exr-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=Path('.frameweave/p1/io/results'));main(p.parse_args().output.resolve())
