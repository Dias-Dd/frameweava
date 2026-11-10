# SPDX-License-Identifier: Apache-2.0
# Fixed Node file-export helper, no input EXR parsing and no runtime downloads.
import sys,json
from pathlib import Path
import numpy as np
import OpenEXR
p=Path(sys.argv[1])
try:
 if OpenEXR.__version__!='3.4.4':raise RuntimeError('Reviewed OpenEXR3.4.4 required')
 request=json.loads((p/'request.json').read_text(encoding='utf-8'));raw=(p/'planes.bin').read_bytes();width=request['width'];height=request['height'];at=0;channels={}
 if not isinstance(width,int)or not isinstance(height,int)or width<1 or height<1:raise RuntimeError('Positive exact output extent required')
 for c in request['channels']:
  name=c['name'];kind=c['type']
  if not isinstance(name,str)or not name or '\x00' in name or name in channels or kind not in ('uint','float'):raise RuntimeError('Known unique typed channel required')
  values=np.frombuffer(raw,dtype='<u4'if kind=='uint'else'<f4',count=width*height,offset=at).reshape(height,width).copy();at+=width*height*4;channels[name]=values
 if at!=len(raw):raise RuntimeError('Trailing or short AOV payload')
 header={'compression':OpenEXR.ZIP_COMPRESSION}
 for name,value in request['metadata'].items():
  if not isinstance(name,str)or not isinstance(value,str):raise RuntimeError('String metadata only')
  header[name]=value
 channel_count=len(channels)
 with OpenEXR.File(header,channels)as f:f.write(str(p/'output.exr'))
 print(json.dumps({'ok':True,'library':'OpenEXR3.4.4','channels':channel_count,'width':width,'height':height,'bytes':(p/'output.exr').stat().st_size}))
except Exception as e:print(json.dumps({'ok':False,'error':str(e)}))
