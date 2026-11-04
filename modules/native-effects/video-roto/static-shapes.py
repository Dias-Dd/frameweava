"""Offline standard-ONNX static shape folding. Never changes learned tensors.

The resident profile has exact positive dimensions. Fold only Shape and small
constant shape/control subgraphs, retaining original names and standard ops.
This avoids a DirectML reshape optimizer dangling-name failure on the traced
vision graph, without disabling runtime validation/optimization in Core.
"""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
import onnx
from onnx import helper,numpy_helper
from onnx.reference import ReferenceEvaluator

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def main():
 a=argparse.ArgumentParser();a.add_argument('--source',required=True);a.add_argument('--output',required=True);o=a.parse_args();source=Path(o.source).resolve();out=Path(o.output).resolve()
 if source==out or out.exists():raise ValueError('Choose a fresh derived directory')
 out.mkdir(parents=True);bundle=json.loads((source/'bundle.json').read_text());rows=[]
 for role in ['vision','seed','track']:
  original=source/(role+'.onnx');m=onnx.load(original,load_external_data=False)
  if sha(original)!=bundle[role]['model']['sha256']:raise ValueError('Source model identity differs')
  m=onnx.shape_inference.infer_shapes(m,data_prop=True)
  shape={v.name:[d.dim_value for d in v.type.tensor_type.shape.dim] for v in [*m.graph.input,*m.graph.value_info,*m.graph.output] if v.type.HasField('tensor_type') and v.type.tensor_type.HasField('shape') and all(d.HasField('dim_value') for d in v.type.tensor_type.shape.dim)}
  known={t.name:numpy_helper.to_array(t) for t in m.graph.initializer if np.prod(t.dims,dtype=np.int64)<=4096}
  folded=[];nodes=[]
  allowed={'Gather','Unsqueeze','Squeeze','Concat','Reshape','Slice','Cast','Add','Sub','Mul','Div','Expand','Range','Transpose'}
  for node in m.graph.node:
   values=None
   if node.op_type=='Constant':
    for attribute in node.attribute:
     if attribute.name=='value' and np.prod(attribute.t.dims,dtype=np.int64)<=4096:known[node.output[0]]=numpy_helper.to_array(attribute.t)
   elif node.op_type=='Shape' and node.input[0] in shape:
    start=next((q.i for q in node.attribute if q.name=='start'),0);end=next((q.i for q in node.attribute if q.name=='end'),len(shape[node.input[0]]));values=[np.asarray(shape[node.input[0]][start:end],dtype=np.int64)]
   elif node.domain=='' and node.op_type in allowed and all(not name or name in known for name in node.input):
    # Expand is admitted only for a small fully-known output shape; never
    # materialize a full image/attention tensor as a constant.
    if node.op_type!='Expand' or np.prod(known[node.input[1]],dtype=np.int64)<=4096:
     values=ReferenceEvaluator(node,opsets={'':17}).run(None,{name:known[name] for name in node.input if name})
   if values is not None and all(v.size<=4096 for v in values):
    if len(values)!=len(node.output):raise ValueError('Constant arity differs')
    for name,value in zip(node.output,values):
     known[name]=value;nodes.append(helper.make_node('Constant',[],[name],name=node.name+'_static',value=numpy_helper.from_array(value)));folded.append({'name':name,'from':node.op_type,'shape':list(value.shape)})
   else:nodes.append(node)
  del m.graph.node[:];m.graph.node.extend(nodes);onnx.checker.check_model(m)
  path=out/(role+'.onnx');onnx.save(m,path,save_as_external_data=False)
  desc=lambda t:{'name':t.name,'dtype':'float32','shape':[d.dim_value for d in t.type.tensor_type.shape.dim],'layout':'NCHW' if len(t.type.tensor_type.shape.dim)==4 else 'linear'}
  bundle[role]['inputs']=[desc(t) for t in m.graph.input];bundle[role]['outputs']=[desc(t) for t in m.graph.output];bundle[role]['model'].update(sha256=sha(path),bytes=path.stat().st_size)
  rows.append({'role':role,'sourceSha256':sha(original),'derivedSha256':sha(path),'bytes':path.stat().st_size,'folds':folded})
 (out/'bundle.json').write_text(json.dumps(bundle,indent=2)+'\n');(out/'static-shapes.json').write_text(json.dumps({'toolSha256':sha(__file__),'source':str(source),'rows':rows,'runtimeExecuted':False,'qualified':False},indent=2)+'\n');print(json.dumps({'ok':True,'rows':[{'role':r['role'],'folds':len(r['folds']),'bytes':r['bytes']} for r in rows]}))
if __name__=='__main__':main()
