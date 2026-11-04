"""Explicit offline adapter of Meta/Hugging Face SAM2.1 (Apache-2.0).

No downloads, pickle, runtime Python, CPU pixel fallback or new GPU executor.
The only attention change is an explicit additive key mask for unoccupied
fixed-capacity memory slots. Empty slots are NOT observations of a black frame.
"""
from pathlib import Path
import argparse, hashlib, json, time

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--source',required=True); parser.add_argument('--output',required=True)
    a=parser.parse_args(); source=Path(a.source).resolve(); out=Path(a.output).resolve()
    if out==source: raise ValueError('Keep original sources immutable')
    pins=json.loads(Path(__file__).with_name('sources.json').read_text())
    for name,pin in [('model.safetensors',pins['base']),('config.json',pins['configuration'])]:
        path=source/name
        if path.stat().st_size!=pin['bytes'] or sha(path)!=pin['sha256']: raise ValueError('Source identity differs: '+name)
    import torch, transformers, inspect
    from torch import nn
    from torch.nn import functional as F
    from safetensors.torch import load_file
    from transformers.models.sam2_video import modeling_sam2_video as M
    from transformers.models.sam2_video.configuration_sam2_video import Sam2VideoConfig
    torch.set_num_threads(4)
    config=Sam2VideoConfig.from_dict(json.loads((source/'config.json').read_text()))
    config._attn_implementation='eager'
    model=M.Sam2VideoModel(config).eval()
    model.load_state_dict(load_file(str(source/'model.safetensors')),strict=True)
    # Request the four original learned masks, select by the original stability
    # rule below. The object pointer still uses token zero (original single-mask
    # tracking semantics), including when stability selects another mask.
    model.mask_decoder._dynamic_multimask_via_stability=lambda masks,scores:(masks,scores)

    class Vision(nn.Module):
        def __init__(self,m): super().__init__(); self.m=m
        def forward(self,pixels):
            o=self.m.get_image_features(pixels,return_dict=True)
            f=o.fpn_hidden_states
            return (f[0].permute(1,2,0).reshape(1,32,256,256),f[1].permute(1,2,0).reshape(1,64,128,128),f[2].permute(1,2,0).reshape(1,256,64,64))

    class Heads(nn.Module):
        def __init__(self,m,seed): super().__init__(); self.m=m; self.seed=seed
        def attention(self,features,memory,memory_pos,pointers,pointer_pos,valid):
            m=self.m.memory_attention
            q=(features.flatten(2).permute(2,0,1)+.1*self.m.vision_position).transpose(0,1).unsqueeze(1)
            keys=torch.cat((memory,pointers),dim=0).transpose(0,1).unsqueeze(1)
            positions=torch.cat((memory_pos,pointer_pos),dim=0).transpose(0,1).unsqueeze(1)
            rope=m.rotary_emb()
            for layer in m.layers:
                normalized=layer.layer_norm1(q)
                v,_=layer.self_attn(query=normalized,key=normalized,value=normalized,position_embeddings=rope)
                q=q+v
                attn=layer.cross_attn_image
                query=attn.q_proj(layer.layer_norm2(q)).reshape(1,-1,1,256).transpose(1,2)
                key=attn.k_proj(keys+positions).reshape(1,-1,1,256).transpose(1,2)
                value=attn.v_proj(keys).reshape(1,-1,1,256).transpose(1,2)
                query,key=M.apply_rotary_pos_emb_2d(query,key,*rope,repeat_freqs_k=True,num_k_exclude_rope=64)
                logits=torch.matmul(query,key.transpose(-1,-2))*attn.scaling
                # -inf excludes padded keys exactly. Callers must retain at
                # least one conditioning memory; all-masked rows are invalid.
                weights=torch.softmax(torch.where(valid.reshape(1,1,1,-1)>0,logits,torch.tensor(float('-inf'),dtype=logits.dtype)),dim=-1)
                v=attn.o_proj(torch.matmul(weights,value).transpose(1,2).reshape(1,1,4096,256))
                q=q+v
                q=q+layer.linear2(layer.activation(layer.linear1(layer.layer_norm3(q))))
            return m.layer_norm(q).reshape(1,4096,256).transpose(1,2).reshape(1,256,64,64)
        def forward(self,high0,high1,features,*args):
            if self.seed:
                authored=args[0]
                conditioned=features+self.m.no_memory_embedding.reshape(1,256,1,1)
                mask_prompt=self.m.mask_downsample(authored)
            else:
                conditioned=self.attention(features,*args)
                mask_prompt=None
            # Original empty-point prompt, including the original padding token.
            sparse,dense=self.m.prompt_encoder(torch.zeros(1,1,1,2),-torch.ones(1,1,1,dtype=torch.int64),None,mask_prompt)
            masks,scores,tokens,object_score=self.m.mask_decoder(conditioned,self.m.get_image_wide_positional_embeddings(),sparse,dense,False,[high0,high1])
            if self.seed:
                high=authored*20.-10.
                low=F.interpolate(high,size=(256,256),mode='bilinear',align_corners=False)
                present=(authored.flatten().amax()>0).to(features.dtype).reshape(1,1)
                object_score=present*20.-10.
            else:
                flat=masks.reshape(4,256,256)
                area_i=(flat[0]>.05).sum().to(features.dtype)
                area_u=(flat[0]>-.05).sum().to(features.dtype)
                stable=torch.where(area_u>0,area_i/torch.clamp(area_u,min=1),torch.ones_like(area_u))>=.98
                best=scores.reshape(4)[1:].argmax()+1
                index=torch.where(stable,torch.zeros_like(best),best)
                low=flat.index_select(0,index.reshape(1)).reshape(1,1,256,256)
                present=(object_score>0).to(features.dtype).reshape(1,1)
                low=torch.where(present.reshape(1,1,1,1)>0,low,torch.full_like(low,-1024.))
                high=F.interpolate(low,size=(1024,1024),mode='bilinear',align_corners=False)
            pointer=self.m.object_pointer_proj(tokens[:,:,0]).reshape(1,256)
            pointer=present*pointer+(1.-present)*self.m.no_object_pointer
            encoded,position=self.m.memory_encoder(features,torch.sigmoid(high)*20.-10.)
            if self.m.occlusion_spatial_embedding_parameter is not None:
                encoded=encoded+(1.-present).reshape(1,1,1,1)*self.m.occlusion_spatial_embedding_parameter.reshape(1,64,1,1)
            return low,encoded.flatten(2).permute(2,0,1),pointer.reshape(4,1,64),object_score.reshape(1)

    # Freeze the native IO shape; these are trained model context capacities,
    # never a maximum video duration or image-size policy.
    vision_pos=model.vision_encoder.neck.position_encoding((1,256,64,64),torch.device('cpu'),torch.float32).flatten(2).permute(2,0,1)
    model.register_buffer('vision_position',vision_pos)
    out.mkdir(parents=True,exist_ok=True)
    input_shapes={'vision':{'pixels':[1,3,1024,1024]},'seed':{'high0':[1,32,256,256],'high1':[1,64,128,128],'features':[1,256,64,64],'authored':[1,1,1024,1024]},'track':{'high0':[1,32,256,256],'high1':[1,64,128,128],'features':[1,256,64,64],'spatial_memory':[28672,1,64],'spatial_memory_pos':[28672,1,64],'object_pointers':[64,1,64],'object_pointer_pos':[64,1,64],'valid':[28736]}}
    output_shapes={'vision':{'high0':[1,32,256,256],'high1':[1,64,128,128],'features':[1,256,64,64]},'seed':{'logits':[1,1,256,256],'memory':[4096,1,64],'pointer':[4,1,64],'object_score':[1]},'track':{'logits':[1,1,256,256],'memory':[4096,1,64],'pointer':[4,1,64],'object_score':[1]}}
    definitions={};rows=[]
    for role,module in [('vision',Vision(model)),('seed',Heads(model,True)),('track',Heads(model,False))]:
        inputs=input_shapes[role]; outputs=output_shapes[role]; path=out/(role+'.onnx')
        if path.exists(): raise ValueError('Choose a fresh immutable derived directory: '+str(path))
        tensors=tuple(torch.zeros(shape) if name!='valid' else torch.ones(shape) for name,shape in inputs.items())
        started=time.perf_counter()
        with torch.inference_mode():
            torch.onnx.export(module.eval(),tensors,str(path),input_names=list(inputs),output_names=list(outputs),opset_version=17,dynamo=False,external_data=False,do_constant_folding=True)
        desc=lambda name,shape:{'name':name,'shape':shape,'dtype':'float32','layout':'NCHW' if len(shape)==4 else 'linear'}
        # Seed uses authored coverage as its output; high-resolution decoder
        # features only affected the unused predicted mask and are pruned.
        active_inputs={k:v for k,v in inputs.items() if role!='seed' or k in ['features','authored']}
        definitions[role]={'version':1,'id':'frameweave.sam2-memory.'+role,'model':{'resource':'video-roto-'+role,'sha256':sha(path),'bytes':path.stat().st_size},'inputs':[desc(k,v) for k,v in active_inputs.items()],'outputs':[desc(k,v) for k,v in outputs.items()],'execution':{'provider':'auto','precision':'float32','temporal':'stateless','allowCpuFallback':False}}
        row={'role':role,'file':path.name,'sha256':sha(path),'bytes':path.stat().st_size,'exportMs':(time.perf_counter()-started)*1000}; rows.append(row); print(json.dumps(row),flush=True)
    constants={'temporal':model.memory_temporal_positional_encoding.detach().flatten().tolist(),'pointerProjectionWeight':model.temporal_positional_encoding_projection_layer.weight.detach().flatten().tolist(),'pointerProjectionBias':model.temporal_positional_encoding_projection_layer.bias.detach().flatten().tolist()}
    bundle={'version':1,'profile':'sam2.1-base-plus-video-memory-f32-v1',**definitions,**constants}
    (out/'bundle.json').write_text(json.dumps(bundle,indent=2)+'\n')
    (out/'derivation.json').write_text(json.dumps({'sourceManifestSha256':sha(Path(__file__).with_name('sources.json')),'toolSha256':sha(__file__),'torch':torch.__version__,'transformers':transformers.__version__,'implementationSha256':sha(inspect.getfile(M)),'files':rows,'precision':'F32 weights and memory; deliberately no hidden BF16 memory compression','runtimeExecuted':False,'qualified':False},indent=2)+'\n')

if __name__=='__main__': main()
