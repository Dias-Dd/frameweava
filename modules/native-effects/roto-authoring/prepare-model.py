"""Offline, explicit model adapter. No inference/model download at render time.
Only named IO types/shapes and one exact label Cast are changed. Unknown
protobuf fields/operators/weights are retained byte-for-byte. No pickle/code.
"""
from pathlib import Path
import argparse,hashlib,json
def integer(n):
 if n<0:raise ValueError("Nonnegative protobuf integer required")
 b=bytearray()
 while n>=128:b.append((n&127)|128);n>>=7
 b.append(n);return bytes(b)
def field(n,wire,value):
 if wire==0:return integer(n<<3)+integer(value)
 if wire==2:return integer((n<<3)|2)+integer(len(value))+value
 raise ValueError("Only authored varint and length-delimited fields are emitted")
def message(b):
 i=0
 def varint():
  nonlocal i
  value=0
  for shift in range(0,70,7):
   if i>=len(b):raise ValueError("Truncated protobuf")
   byte=b[i];i+=1;value|=(byte&127)<<shift
   if byte<128:return value
  raise ValueError("Oversized protobuf integer")
 while i<len(b):
  start=i;tag=varint();n=tag>>3;wire=tag&7
  if wire==0:value=varint()
  elif wire==2:
   size=varint();end=i+size
   if end>len(b):raise ValueError("Truncated protobuf field")
   value=b[i:end];i=end
  elif wire in (1,5):
   size=8 if wire==1 else 4;value=b[i:i+size];i+=size
   if i>len(b):raise ValueError("Truncated fixed field")
  else:raise ValueError("Unsupported protobuf wire type")
  yield n,wire,value,b[start:i]
def name(b):return next(v.decode("utf8") for n,w,v,r in message(b) if n==1)
def info(original,new_name,shape,dtype=1):
 tensor=field(1,0,dtype)+field(2,2,b"".join(field(1,2,field(1,0,d)) for d in shape))
 return b"".join(field(1,2,new_name.encode()) if n==1 else field(2,2,field(1,2,tensor)) if n==2 else raw for n,w,v,raw in message(original))
def cast_labels():
 attr=field(1,2,b"to")+field(3,0,7)+field(20,0,2)
 return field(1,2,b"input_labels_f32")+field(2,2,b"input_labels")+field(3,2,b"frameweave_exact_label_adapter")+field(4,2,b"Cast")+field(5,2,attr)
def adapt(raw,shapes,decoder):
 result=[]
 for n,w,v,chunk in message(raw):
  if n!=7:result.append(chunk);continue
  fields=list(message(v));seen=set();graph=[field(1,2,cast_labels())] if decoder else []
  for q,r,t,payload in fields:
   if q in (11,12):
    key=name(t)
    if key not in shapes:raise ValueError("Unexpected IO: "+key)
    seen.add(key);graph.append(field(q,2,info(t,"input_labels_f32" if key=="input_labels" else key,shapes[key])))
    if key=="input_labels":graph.append(field(13,2,info(t,key,shapes[key],7)))
   else:graph.append(payload)
  if seen!=set(shapes):raise ValueError("Model IO mismatch")
  result.append(field(7,2,b"".join(graph)))
 return b"".join(result)
def main():
 a=argparse.ArgumentParser();a.add_argument("--source",required=True);a.add_argument("--output",required=True);a.add_argument("--point-capacity",type=int,default=16);o=a.parse_args()
 if o.point_capacity<1 or o.point_capacity>0xffffffff:raise ValueError("Positive uint32 point capacity required")
 pinned=json.loads(Path(__file__).with_name("onnx-source.json").read_text());source=Path(o.source).resolve();out=Path(o.output).resolve()
 if out==source:raise ValueError("Keep pinned original weights immutable; choose a separate derived directory")
 out.mkdir(parents=True,exist_ok=True);N=o.point_capacity
 definitions={};receipts=[]
 for filename,pin in pinned["files"].items():
  raw=(source/filename).read_bytes()
  if len(raw)!=pin["bytes"] or hashlib.sha256(raw).hexdigest()!=pin["sha256"]:raise ValueError("Source content mismatch: "+filename)
  decoder=filename.startswith("prompt")
  shapes={"input_points":[1,1,N,2],"input_labels":[1,1,N],"image_embeddings":[1,256,64,64],"image_positional_embeddings":[1,256,64,64],"iou_scores":[1,1,3],"pred_masks":[1,1,3,256,256]} if decoder else {"pixel_values":[1,3,1024,1024],"image_embeddings":[1,256,64,64],"image_positional_embeddings":[1,256,64,64]}
  body=adapt(raw,shapes,decoder);role="decoder" if decoder else "encoder";target=out/(role+".onnx")
  if target.exists() and target.read_bytes()!=body:raise ValueError("Immutable derived file exists with different contents: "+str(target))
  target.write_bytes(body);sha=hashlib.sha256(body).hexdigest()
  inputs=["input_points","input_labels","image_embeddings","image_positional_embeddings"] if decoder else ["pixel_values"];outputs=["iou_scores","pred_masks"] if decoder else ["image_embeddings","image_positional_embeddings"]
  desc=lambda key:{"name":"input_labels_f32" if key=="input_labels" else key,"dtype":"float32","shape":shapes[key],"layout":"NCHW" if key in ("pixel_values","image_embeddings","image_positional_embeddings") else "linear"}
  definitions[role]={"version":1,"id":"frameweave.slimsam."+role,"model":{"resource":"roto-"+role,"sha256":sha,"bytes":len(body)},"inputs":[desc(k) for k in inputs],"outputs":[desc(k) for k in outputs],"execution":{"provider":"directml","allowCpuFallback":False,"precision":"float32","temporal":"stateless"}}
  receipts.append({"source":filename,"sourceSha256":pin["sha256"],"derived":target.name,"sha256":sha,"bytes":len(body)})
 bundle={"version":1,"profile":"slimsam-77-uniform-f32-points-v1","pointCapacity":N,**definitions}
 (out/"bundle.json").write_text(json.dumps(bundle,indent=2)+"\n")
 (out/"derivation.json").write_text(json.dumps({"source":pinned,"files":receipts,"toolSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),"changes":"Freeze positive named IO dimensions; decoder labels F32->Int64 exact Cast; learned graph/weights unchanged","executed":False,"qualified":False},indent=2)+"\n")
 print(json.dumps({"output":str(out),"definitions":definitions,"runtimeExecuted":False}))
if __name__=="__main__":main()
