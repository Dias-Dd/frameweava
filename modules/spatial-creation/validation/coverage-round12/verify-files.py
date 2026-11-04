# Independent official OpenEXR and public-domain Murmur cross-checks.
from pathlib import Path
import sys,json,struct
import numpy as np
import OpenEXR
import pymmh3
p=Path(sys.argv[1]);reference=json.loads((p/'file-reference.json').read_text(encoding='utf-8'));rows=[]
with OpenEXR.File(str(p/'aov.exr'),separate_channels=True)as f:
 header=f.header();channels=f.channels()
 for name,item in reference['channels'].items():
  data=channels[name].pixels;expected=np.fromfile(p/item['file'],dtype='<u4'if item['type']=='uint'else'<f4').reshape(8,8)
  assert data.dtype==expected.dtype,(name,str(data.dtype),str(expected.dtype));assert data.tobytes()==expected.tobytes(),name
 for name,value in reference['metadata'].items():assert header[name]==value,(name,header.get(name),value)
 for key,value in header.items():
  if key.startswith('cryptomatte/')and key.endswith('/manifest'):
   for name,expected in json.loads(value).items():
    h=pymmh3.hash(name)&0xffffffff;exp=h>>23&255
    if exp in (0,255):h^=1<<23
    assert f'{h:08x}'==expected,(name,expected,f'{h:08x}')
 rows.append({'flatChannels':len(channels),'allBitsExact':True,'independentUTF8Murmur':True})
for kind in ('float','half'):
 with OpenEXR.File(str(p/f'deep-{kind}.exr'),separate_channels=True)as f:
  ch=f.channels();obj=ch['objectId'].pixels;assert all(x.dtype==np.uint32 for x in obj.flat if x is not None);assert any(np.any(x==np.uint32(0xfedcba98))for x in obj.flat if x is not None)
  assert all(x.dtype==(np.float32 if kind=='float'else np.float16)for x in ch['R'].pixels.flat if x is not None)
  assert any(np.any(x<0)for x in ch['R'].pixels.flat if x is not None);assert any(np.any(x>1)for x in ch['B'].pixels.flat if x is not None)
  rows.append({'deep':kind,'channels':len(ch),'realDeep':True,'highUInt32':True,'negativeHDR':True})
(p/'independent-files.json').write_bytes((json.dumps({'ok':True,'OpenEXR':OpenEXR.__version__,'rows':rows},indent=2)+'\n').encode('utf-8'));print(json.dumps(rows))
