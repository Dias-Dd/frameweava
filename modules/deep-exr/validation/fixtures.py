# SPDX-License-Identifier: Apache-2.0
# Independent fixture writer/reference: official OpenEXR3.4.4 + NumPy, not the new decoder.
import OpenEXR,numpy as np,json,hashlib,sys
from pathlib import Path
p=Path(sys.argv[1]);p.mkdir(parents=True,exist_ok=True);width,height=8,4;names={'R':'float16','G':'float32','B':'float32','A':'float16','Z':'float32','ZBack':'float32','objectId':'uint32','auxHalf':'float16'}
channels={k:np.empty((height,width),dtype=object)for k in names};counts=[];flat={k:[]for k in names};cpu=np.zeros((height,width,4),dtype=np.float32)
for i in range(width*height):
 n=i%4;counts.append(n);z=[3.,1.,2.][:n]
 for k,dtype in names.items():
  values={'R':[2.,-.5,4.],'G':[-.25,.5,1.],'B':[4.,2.,8.],'A':[.5,.25,.75],'Z':z,'ZBack':z,'objectId':[0xfffffffe,0xffffffff,17],'auxHalf':[0.,-0.,1.]}[k][:n];a=np.array(values,dtype=dtype)
  if k=='auxHalf'and n:a.view(np.uint16)[0]=0x7e01
  channels[k].flat[i]=a;flat[k].extend(a.tolist())
 rgba=np.zeros(4,dtype=np.float64)
 for j in sorted(range(n),key=lambda j:z[j]):
  color=np.array([channels[k].flat[i][j]for k in['R','G','B','A']],dtype=np.float64);rgba[:3]+=(1-rgba[3])*color[:3];rgba[3]+=(1-rgba[3])*color[3]
 cpu.reshape(-1,4)[i]=rgba
window=(np.array([-3,5],dtype=np.int32),np.array([4,8],dtype=np.int32));display=(np.array([-8,-2],dtype=np.int32),np.array([20,16],dtype=np.int32))
files=[]
for compression,name in[(OpenEXR.NO_COMPRESSION,'none'),(OpenEXR.RLE_COMPRESSION,'rle'),(OpenEXR.ZIPS_COMPRESSION,'zips')]:
 parts=[]
 for tiled in[False,True]:
  header={'type':OpenEXR.deeptile if tiled else OpenEXR.deepscanline,'compression':compression,'dataWindow':window,'displayWindow':display,'comments':'Deep typed HDR reference','exposure':1.25}
  if tiled:
   t=OpenEXR.TileDescription();t.xSize=3;t.ySize=2;header['tiles']=t
  parts.append(OpenEXR.Part(header,{k:OpenEXR.Channel(k,v,1,1,False)for k,v in channels.items()},'tiles'if tiled else'scans'))
 file=p/(name+'.exr')
 with OpenEXR.File(parts)as f:f.write(str(file))
 files.append({'name':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
# Plane payload preserves original bit patterns, unlike a JSON NaN representation.
np.array(counts,dtype='<u4').tofile(p/'counts.u32');cpu.tofile(p/'reference.f32');refs=[]
for k in sorted(names):
 dtype=names[k];values=np.concatenate([a for a in channels[k].flat]);name=k+'.bits';values.tofile(p/name);refs.append({'name':k,'type':{'float16':'half','float32':'float','uint32':'uint'}[dtype],'file':name})
empty={k:np.empty((1,2),dtype=object)for k in['R','id','value']}
for k,dtype in[('R','float16'),('id','uint32'),('value','float32')]:
 for i in range(2):empty[k].flat[i]=np.empty(0,dtype=dtype)
with OpenEXR.File({'type':OpenEXR.deepscanline,'compression':OpenEXR.ZIPS_COMPRESSION},empty)as f:f.write(str(p/'empty.exr'))
(p/'reference.json').write_text(json.dumps({'version':1,'library':OpenEXR.__version__,'width':width,'height':height,'samples':sum(counts),'files':files,'channels':refs,'dataWindow':[-3,5,4,8],'displayWindow':[-8,-2,20,16]},indent=2))
print(json.dumps({'ok':True,'files':files,'samples':sum(counts)}))
