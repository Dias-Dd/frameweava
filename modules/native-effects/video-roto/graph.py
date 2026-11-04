"""ONNX admission inspection, not successful GPU execution."""
import argparse,json
from pathlib import Path
import onnx
from onnx import TensorProto
a=argparse.ArgumentParser();a.add_argument('directory');o=a.parse_args();root=Path(o.directory);rows=[]
for role in ['vision','seed','track']:
 m=onnx.load(root/(role+'.onnx'),load_external_data=False)
 tensors=list(m.graph.initializer)
 for node in m.graph.node:
  for attribute in node.attribute:
   if attribute.type==onnx.AttributeProto.TENSOR:tensors.append(attribute.t)
 if any(t.data_location==TensorProto.EXTERNAL for t in tensors):raise ValueError('Embedded-only profile: '+role)
 onnx.checker.check_model(m)
 io=lambda side:[{'name':t.name,'shape':[d.dim_value for d in t.type.tensor_type.shape.dim]} for t in side]
 rows.append({'role':role,'nodes':len(m.graph.node),'inputs':io(m.graph.input),'outputs':io(m.graph.output),'embedded':True})
print(json.dumps(rows,indent=1))
