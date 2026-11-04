"""Exact offline removal of consecutive reshapes with nonzero constant targets.

Reshape preserves linear element order. A second target with no zero dimensions
does not depend on the intermediate rank, so it can consume the original data.
This avoids ORT's failing consecutive-reshape rewrite, without numerical math,
operator substitution, Core optimizer flags or learned-weight modification.
"""
from pathlib import Path
import argparse,hashlib,json
import onnx
from onnx import numpy_helper
a=argparse.ArgumentParser();a.add_argument('--source',required=True);a.add_argument('--output',required=True);o=a.parse_args();source=Path(o.source);out=Path(o.output);out.mkdir();bundle=json.loads((source/'bundle.json').read_text());rows=[]
for role in ['vision','seed','track']:
 body=(source/(role+'.onnx')).read_bytes()
 if hashlib.sha256(body).hexdigest()!=bundle[role]['model']['sha256']:raise ValueError('Source model differs')
 m=onnx.load_model_from_string(body);producers={name:n for n in m.graph.node for name in n.output};constants={v.name:numpy_helper.to_array(v) for v in m.graph.initializer if len(v.dims)<=1}
 for n in m.graph.node:
  if n.op_type=='Constant':
   for attribute in n.attribute:
    if attribute.name=='value' and len(attribute.t.dims)<=1:constants[n.output[0]]=numpy_helper.to_array(attribute.t)
 changes=[]
 for n in m.graph.node:
  if n.op_type!='Reshape' or n.domain or n.input[1] not in constants:continue
  shape=constants[n.input[1]].reshape(-1).tolist()
  if not shape or any(d==0 or d < -1 for d in shape) or shape.count(-1)>1:continue
  while (parent:=producers.get(n.input[0])) is not None and parent.op_type=='Reshape' and not parent.domain:
   changes.append({'node':n.name,'intermediate':parent.name,'original':n.input[0],'replacement':parent.input[0],'target':shape});n.input[0]=parent.input[0]
 # Retain unused nodes here: ONNX If subgraphs may capture outer names without
 # listing them as node inputs. The existing runtime owns full graph liveness.
 del m.graph.value_info[:];onnx.checker.check_model(m)
 target=out/(role+'.onnx');onnx.save(m,target,save_as_external_data=False);raw=target.read_bytes();bundle[role]['model'].update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
 # Match the graph's genuinely retained inputs (the seed high-res paths are
 # unused because authored coverage, rather than predicted masks, is emitted).
 inputs={t.name for t in m.graph.input};bundle[role]['inputs']=[v for v in bundle[role]['inputs'] if v['name'] in inputs]
 rows.append({'role':role,'sourceSha256':hashlib.sha256(body).hexdigest(),'derivedSha256':hashlib.sha256(raw).hexdigest(),'changes':changes})
(out/'bundle.json').write_text(json.dumps(bundle,indent=2)+'\n');(out/'reshape-adaptation.json').write_text(json.dumps({'version':1,'toolSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'rows':rows,'runtimeVerified':False},indent=2)+'\n');print(json.dumps([{'role':r['role'],'collapsed':len(r['changes'])} for r in rows]))
