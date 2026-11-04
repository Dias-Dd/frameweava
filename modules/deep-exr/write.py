# SPDX-License-Identifier: Apache-2.0
# Writer only. Untrusted EXR input is parsed by the bounded OpenEXRCore decoder.
import sys,json
from pathlib import Path
import numpy as np
import OpenEXR
p=Path(sys.argv[1]);request=json.loads((p/'request.json').read_text());data=(p/'input.bin').read_bytes();at=0;parts=[]
try:
 if OpenEXR.__version__!='3.4.4':raise RuntimeError('Reviewed OpenEXR3.4.4 required')
 for m in request['parts']:
  width,height=m['width'],m['height'];pixels=width*height;counts=np.frombuffer(data,dtype='<u4',count=pixels,offset=at);at+=pixels*4;channels={}
  for c in m['channels']:
   dtype={'half':'<f2','float':'<f4','uint':'<u4'}[c['type']];values=np.frombuffer(data,dtype=dtype,count=m['samples'],offset=at);at+=m['samples']*np.dtype(dtype).itemsize;out=np.empty((height,width),dtype=object);offset=0
   for i,n in enumerate(counts):
    n=int(n);out.flat[i]=values[offset:offset+n].copy();offset+=n
   channels[c['name']]=OpenEXR.Channel(c['name'],out,1,1,c['pLinear'])
  window=lambda a:(np.array(a[:2],dtype=np.int32),np.array(a[2:],dtype=np.int32))
  storage=request.get('storage')or m['storage'];header={'type':OpenEXR.deeptile if storage=='deep-tiled' else OpenEXR.deepscanline,'compression':{'none':OpenEXR.NO_COMPRESSION,'rle':OpenEXR.RLE_COMPRESSION,'zips':OpenEXR.ZIPS_COMPRESSION}[request['compression']],'dataWindow':window(m['dataWindow']),'displayWindow':window(m['displayWindow'])}
  if storage=='deep-tiled':
   tiles=OpenEXR.TileDescription();tiles.xSize=m['tileWidth'] or 32;tiles.ySize=m['tileHeight'] or 32;header['tiles']=tiles
  for name,a in m['attributes'].items():
   t,v=a['type'],a['value']
   if t=='string':v=bytes.fromhex(v).decode('utf8','strict')
   elif t=='float':v=float(v)
   elif t=='double':
    if request['unsupportedAttributes']=='drop':continue
    raise RuntimeError('Double metadata requires an explicit supported writer; no silent FLOAT conversion')
   elif t=='int':v=int(v)
   elif t=='v2f':v=np.array(v,dtype=np.float32)
   elif t=='chromaticities':v=tuple(v)
   elif t=='lineOrder':v=OpenEXR.LineOrder(v)
   elif t=='deepImageState':v=OpenEXR.DeepImageState(v)
   else:raise RuntimeError('Unsupported typed metadata '+t)
   header[name]=v
  parts.append(OpenEXR.Part(header,channels,m['name'] if m['name'] else 'part'+str(len(parts))))
 if at!=len(data):raise RuntimeError('Trailing typed write input')
 with OpenEXR.File(parts)as f:f.write(str(p/'output.exr'))
 print(json.dumps({'ok':True,'library':'OpenEXR3.4.4','parts':len(parts),'bytes':(p/'output.exr').stat().st_size}))
except Exception as e:print(json.dumps({'ok':False,'error':str(e)}))
