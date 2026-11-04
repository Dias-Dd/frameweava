"""QA only: independent UNPADDED original Torch model, not runtime fallback."""
from pathlib import Path
import argparse,json,time
import numpy as np
def main():
 a=argparse.ArgumentParser();a.add_argument('--source',required=True);a.add_argument('--run',required=True);o=a.parse_args();source=Path(o.source);root=Path(o.run)
 import torch
 from torch.nn import functional as F
 from safetensors.torch import load_file
 from transformers.models.sam2_video import modeling_sam2_video as M
 from transformers.models.sam2_video.configuration_sam2_video import Sam2VideoConfig
 torch.set_num_threads(4);config=Sam2VideoConfig.from_dict(json.loads((source/'config.json').read_text()));config._attn_implementation='eager';m=M.Sam2VideoModel(config).eval();m.load_state_dict(load_file(str(source/'model.safetensors')),strict=True)
 load=lambda name,shape:torch.from_numpy(np.fromfile(root/('frame1-'+name+'.f32'),dtype='<f4').reshape(shape))
 rows=[];gates=json.loads(Path(__file__).with_name('NUMERICS.json').read_text())
 def compare(name,a,b,gate):
  a=a.detach().numpy().reshape(-1).astype(np.float64);b=b.detach().numpy().reshape(-1).astype(np.float64);d=np.abs(a-b);ratio=d/(gate['absolute']+gate['relative']*np.maximum(np.abs(a),np.abs(b)));row={'name':name,'maxAbsolute':float(d.max()),'maxBudgetRatio':float(ratio.max()),'count':a.size};rows.append(row)
  (root/'reference-results.json').write_text(json.dumps({'ok':all(r['maxBudgetRatio']<=1 for r in rows),'rows':rows},indent=2)+'\n')
  if row['maxBudgetRatio']>1:raise ValueError('Unchanged numerical gate exceeded: '+name)
 with torch.inference_mode():
  pixels=load('f1-pixels',(1,3,1024,1024));features=m.get_image_features(pixels,return_dict=True).fpn_hidden_states
  for name,f,shape in zip(['high0','high1','features'],features,[(1,32,256,256),(1,64,128,128),(1,256,64,64)]):compare('vision-'+name,f.permute(1,2,0).reshape(shape),load('f1-'+name,shape),gates['vision'])
  # Isolate learned memory/decoder precision from encoder accumulation. Exactly
  # ONE actual spatial observation and FOUR pointer tokens, no padded slots.
  current=load('f1-features',(1,256,64,64));memory=load('f0-memory',(4096,1,64));pointer=load('f0-pointer',(4,1,64));position=m.memory_encoder.position_encoding((1,64,64,64),torch.device('cpu'),torch.float32).flatten(2).permute(2,0,1)
  temporal=position+m.memory_temporal_positional_encoding[6]
  pe=m.temporal_positional_encoding_projection_layer(M.get_1d_sine_pe(torch.tensor([1./15.]),256)).reshape(1,1,64).repeat(4,1,1)
  vpos=m.vision_encoder.neck.position_encoding((1,256,64,64),torch.device('cpu'),torch.float32).flatten(2).permute(2,0,1)
  conditioned=m.memory_attention(current.flatten(2).permute(2,0,1),torch.cat([memory,pointer]),vpos,torch.cat([temporal,pe]),num_object_pointer_tokens=4).reshape(4096,1,256).permute(1,2,0).reshape(1,256,64,64)
  high0=load('f1-high0',(1,32,256,256));high1=load('f1-high1',(1,64,128,128));result=m._single_frame_forward(image_embeddings=[high0,high1,conditioned],multimask_output=False)
  compare('unmodified-unpadded-attention+decoder',result.pred_masks,load('f1-logits',(1,1,256,256)),gates['memoryAttentionAndDecoder'])
  compare('object-score',result.object_score_logits,load('f1-object_score',(1,)),gates['scores'])
  high=F.interpolate(result.pred_masks.reshape(1,1,256,256),size=(1024,1024),mode='bilinear',align_corners=False)
  encoded,_=m.memory_encoder(current,torch.sigmoid(high)*20.-10.)
  present=(result.object_score_logits>0).float().reshape(1,1,1,1);encoded=encoded+(1.-present)*m.occlusion_spatial_embedding_parameter.reshape(1,64,1,1)
  compare('learned-next-memory',encoded.flatten(2).permute(2,0,1),load('f1-memory',(4096,1,64)),gates['memoryAttentionAndDecoder'])
  compare('learned-object-pointer',result.object_pointer,load('f1-pointer',(4,1,64)),gates['memoryAttentionAndDecoder'])
 print(json.dumps({'ok':True,'rows':rows,'unmaskedPadding':False,'reference':'original Torch unpadded memory attention/decoder; F32 memory variant'},indent=1))
if __name__=='__main__':main()
