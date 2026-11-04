# SPDX-License-Identifier: Apache-2.0
# Fixed measured workload: 1080p, exactly two real Deep samples per pixel.
import OpenEXR,numpy as np,json,sys
from pathlib import Path
p=Path(sys.argv[1]);p.mkdir(parents=True,exist_ok=True);w,h=1920,1080;channels={};types={}
for name,dtype,values in [('R','float16',[2.,4.]),('G','float32',[-.25,.5]),('B','float32',[4.,8.]),('A','float16',[.5,.25]),('Z','float32',[3.,1.]),('ZBack','float32',[3.,1.])]:
 a=np.empty((h,w),dtype=object);a.fill(np.array(values,dtype=dtype));channels[name]=a;types[name]={'float16':'half','float32':'float'}[dtype]
file=p/'source.exr'
with OpenEXR.File({'type':OpenEXR.deepscanline,'compression':OpenEXR.ZIPS_COMPRESSION},channels)as f:f.write(str(file))
(p/'source.json').write_text(json.dumps({'version':1,'resource':'deep','bytes':file.stat().st_size,'part':0,'dataWindow':[0,0,w-1,h-1],'displayWindow':[0,0,w-1,h-1],'samples':w*h*2,'channels':[{'name':name,'type':types[name]}for name in sorted(types)],'maxDecodedBytes':256*1024**2,'maxSamplesPerPixel':2,'maxParts':1,'surface':{'r':'R','g':'G','b':'B','a':'A','z':'Z','zBack':'ZBack','alpha':'premultiplied','color':{'primaries':'rec709','whitePoint':'D65','transfer':'linear','reference':'scene','range':'full','referenceWhiteNits':100}}},indent=2))
print(json.dumps({'file':str(file),'compressedBytes':file.stat().st_size,'pixels':w*h,'samples':w*h*2}))
