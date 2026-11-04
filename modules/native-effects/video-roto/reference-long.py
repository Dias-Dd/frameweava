"""Offline QA: original unpadded Torch attention with actual long-replay banks."""
from pathlib import Path
import argparse,json
import numpy as np

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--run',required=True);p.add_argument('--output',required=True);o=p.parse_args();root=Path(o.run);source=Path(o.source)
 import torch
 from torch.nn import functional as F
 from safetensors.torch import load_file
 from transformers.models.sam2_video import modeling_sam2_video as M
 from transformers.models.sam2_video.configuration_sam2_video import Sam2VideoConfig
 torch.set_num_threads(4);config=Sam2VideoConfig.from_dict(json.loads((source/'config.json').read_text()));config._attn_implementation='eager';model=M.Sam2VideoModel(config).eval();model.load_state_dict(load_file(str(source/'model.safetensors')),strict=True)
 load=lambda n,shape:torch.from_numpy(np.fromfile(root/('f50-'+n+'.f32'),dtype='<f4').reshape(shape))
 gates=json.loads(Path(__file__).with_name('NUMERICS.json').read_text());rows=[]
 def compare(name,a,b,gate):
  x=a.detach().numpy().reshape(-1).astype(np.float64);y=b.detach().numpy().reshape(-1).astype(np.float64);d=np.abs(x-y);ratio=d/(gate['absolute']+gate['relative']*np.maximum(np.abs(x),np.abs(y)));rows.append({'name':name,'count':x.size,'maxAbsolute':float(d.max()),'maxBudgetRatio':float(ratio.max())});Path(o.output).write_text(json.dumps({'ok':all(r['maxBudgetRatio']<=1 for r in rows),'rows':rows},indent=2)+'\n');assert ratio.max()<=1,name
 with torch.inference_mode():
  valid=load('valid',(28736,))>.5;memory=torch.cat([load('spatial_memory',(28672,1,64)),load('object_pointers',(64,1,64))])[valid];position=torch.cat([load('memory_pos',(28672,1,64)),load('pointer_pos',(64,1,64))])[valid];pointer_count=int(valid[28672:].sum());assert pointer_count>0
  current=load('features',(1,256,64,64));vpos=model.vision_encoder.neck.position_encoding((1,256,64,64),torch.device('cpu'),torch.float32).flatten(2).permute(2,0,1)
  conditioned=model.memory_attention(current.flatten(2).permute(2,0,1),memory,vpos,position,num_object_pointer_tokens=pointer_count).reshape(4096,1,256).permute(1,2,0).reshape(1,256,64,64)
  result=model._single_frame_forward(image_embeddings=[load('high0',(1,32,256,256)),load('high1',(1,64,128,128)),conditioned],multimask_output=False)
  compare('long-unmodified-unpadded-attention+decoder',result.pred_masks,load('logits',(1,1,256,256)),gates['memoryAttentionAndDecoder']);compare('long-object-score',result.object_score_logits,load('object_score',(1,)),gates['scores'])
  high=F.interpolate(result.pred_masks.reshape(1,1,256,256),size=(1024,1024),mode='bilinear',align_corners=False);encoded,_=model.memory_encoder(current,torch.sigmoid(high)*20.-10.);present=(result.object_score_logits>0).float().reshape(1,1,1,1);encoded=encoded+(1.-present)*model.occlusion_spatial_embedding_parameter.reshape(1,64,1,1)
  compare('long-learned-next-memory',encoded.flatten(2).permute(2,0,1),load('memory',(4096,1,64)),gates['memoryAttentionAndDecoder']);compare('long-learned-pointer',result.object_pointer,load('pointer',(4,1,64)),gates['memoryAttentionAndDecoder'])
 Path(o.output).write_text(json.dumps({'ok':True,'rows':rows,'unpaddedMemoryTokens':int(valid.sum()),'pointerTokens':pointer_count,'reference':'Original unmodified Torch memory attention/decoder over actual 51-observation Native input banks; not a second padded-graph oracle'},indent=2)+'\n')

if __name__=='__main__':main()
