import type {TVG,LayerSpec} from '../../src/core/types.ts';
import type {NativeProgram} from './client.ts';
import {EngineError} from '../../src/core/errors.ts';
import {professionalShader} from '../gpu-effects/professional-shaders.ts';
import {identity,matrix,multiply,invert,type Affine} from '../../src/media/compositor-geometry.ts';
import {transformPixels} from '../../src/media/color.ts';
import {srgb,type ColorEncoding} from '../../src/media/surface.ts';
import {nativePixelShader} from '../gpu-effects/pixel-shader.ts';

// Same compensated sampling and blend arithmetic; split prior destination from
// the next logical publication to permit safe lifetime-based allocation reuse.
export const nativeRasterShader=professionalShader
 .replace('@binding(2) var<storage,read_write> destination:array<vec4f>;','@binding(2) var<storage,read> backdrop:array<vec4f>;\n@group(0) @binding(3) var<storage,read_write> destination:array<vec4f>;')
 .replace('@binding(3) var<uniform> p:Params;','@binding(4) var<uniform> p:Params;')
 .replace('pair(destination[i])','pair(backdrop[i])').replace('fn main(@builtin','fn fw_main(@builtin');

export function appendNativeComposite(program:NativeProgram,parameters:number[][],tvg:TVG,frame:number,outputs:Map<string,number>,width:number,height:number){
 const active=tvg.layers.filter(l=>frame>=l.start&&frame<l.end&&(!l.source||tvg.stages.find(s=>s.id===l.source!.$ref)?.outputs[l.source.port]==='surface'));
 const required=new Set(active.flatMap(l=>[l.source,l.mask].filter(v=>v!==undefined).map(v=>`${v.$ref}:${v.port}`)));
 const placed=new Map([...outputs].filter(([key])=>required.has(key)));
 // Intermediate Stage outputs may legitimately use another working color.
 // Only actual Layer/Mask participants enter this compositor's color domain.
 const first=(placed.size?placed:outputs).values().next().value as number|undefined;if(first===undefined)throw new EngineError('E_NATIVE_OUTPUT','No active native visual output');outputs=placed;
 const color=program.images[first].color as ColorEncoding;
 for(const i of outputs.values())if(JSON.stringify(program.images[i].color)!==JSON.stringify(color))throw new EngineError('E_NATIVE_COLOR','Native composition requires explicit common working color');
 const image=(alpha='premultiplied')=>program.images.push({width,height,format:'rgba32float',alpha,color})-1;
 const fill=(value:number[])=>{const output=image(),kernel=program.kernels.push({replayImage:'whole-output-v1',code:nativePixelShader({abiVersion:1,id:'frameweave/native/background',version:'1.0.0',inputCount:0,parameterWords:4,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),paramF32(1u),paramF32(2u),paramF32(3u));}'}),inputCount:0,headerWords:32,parameterWords:4})-1,header=Array<number>(32).fill(0);header.splice(0,4,width,height,0,0);program.passes.push({kernel,inputs:[],output,header});parameters.push(Array.from(new Uint32Array(new Float32Array(value).buffer)));return output;};
 const pm=new Map<number,number>();
 for(const i of outputs.values()){const info=program.images[i];if(info.alpha==='premultiplied'){pm.set(i,i);continue;}const output=program.images.push({...info,format:'rgba32float',alpha:'premultiplied'})-1,kernel=program.kernels.push({replayImage:'whole-output-v1',code:nativePixelShader({abiVersion:1,id:'frameweave/native/premultiply',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(v.rgb*v.a,v.a);}'}),inputCount:1,headerWords:32,parameterWords:0})-1,header=Array<number>(32).fill(0);header.splice(0,8,info.width,info.height,0,0,info.width,info.height,info.alpha==='straight'?1:2,0);program.passes.push({kernel,inputs:[i],output,header});parameters.push([]);pm.set(i,output);}
 const surfaces=new Map([...outputs].map(([key,i])=>[key,pm.get(i)!]));
 const logicalSizes=new Map<number,{width:number;height:number}>();
 for(const [key,i] of outputs){const stage=tvg.stages.find(s=>s.id===key.split(':')[0]);logicalSizes.set(pm.get(i)!,{width:stage?.width??tvg.composition.width,height:stage?.height??tvg.composition.height});}
 if(active.length===1){const l=active[0],i=l.source&&surfaces.get(`${l.source.$ref}:${l.source.port}`);if(i!==undefined&&!l.parent&&!l.mask&&!l.effects?.length&&(!l.blend||l.blend==='source-over')&&(l.opacity??1)===1&&matrix(l).every((n,k)=>n===identity[k])&&program.images[i].width===width&&program.images[i].height===height&&tvg.composition.background==='transparent')return i;}
 let background=[0,0,0,0];if(tvg.composition.background!=='transparent'){
  const m=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(tvg.composition.background);if(!m)throw new EngineError('E_MEDIA_BACKGROUND','Native background requires transparent or #RRGGBB[AA]');
  const value=transformPixels(new Float32Array([parseInt(m[1].slice(0,2),16)/255,parseInt(m[1].slice(2,4),16)/255,parseInt(m[1].slice(4,6),16)/255,m[2]?parseInt(m[2],16)/255:1]),srgb,color,'straight').pixels;background=[value[0]*value[3],value[1]*value[3],value[2]*value[3],value[3]];
 }
 const blank=fill([0,0,0,0]),kernel=program.kernels.push({kind:'raster',replayImage:'whole-output-v1',code:nativeRasterShader,inputCount:3,parameterWords:44,headerWords:0})-1;
 const groups=new Map<string|undefined,LayerSpec[]>();for(const l of active){if(l.effects?.length)throw new EngineError('E_NATIVE_EFFECT_MIGRATION','Move legacy Layer effects into a native GPU effect chain',{details:{layerId:l.id}});const group=groups.get(l.parent)??[];group.push(l);groups.set(l.parent,group);}
 const raster=(dst:number,src:number,transform:Affine,blend:LayerSpec['blend'],opacity:number,mask?:number,screen=false)=>{
  const inv=invert(transform);if(!inv&&!screen)return dst;const a=inv??identity,source=program.images[src],m=mask===undefined?undefined:program.images[mask],f=new Float32Array(44),u=new Uint32Array(f.buffer);
  u.set([source.width,source.height,width,height,m?.width??1,m?.height??1,blend==='lighter'?1:blend==='multiply'?2:blend==='screen'?3:0,m?1:0]);
  const coords=(offset:number,sx:number,sy:number)=>{const values=[a[0]*sx,a[1]*sy,a[2]*sx,a[3]*sy,a[4]*sx-.5,a[5]*sy-.5,0,0];values.forEach((v,i)=>{f[offset+i]=Math.fround(v);f[offset+8+i]=v-Math.fround(v);});};
  const size=logicalSizes.get(src)??tvg.composition,maskSize=mask===undefined?tvg.composition:logicalSizes.get(mask)??tvg.composition;
  coords(8,source.width/size.width,source.height/size.height);coords(24,m?m.width/maskSize.width:1,m?m.height/maskSize.height:1);const hi=Math.fround(opacity);f.set([opacity-hi,0,hi,screen?1:0],40);
  const output=image();program.passes.push({kernel,inputs:[src,mask??blank,dst],output,header:[]});parameters.push(Array.from(u));return output;
 };
 const draw=(l:LayerSpec,dst:number,parent:Affine,inherited=1):number=>{
  const transform=multiply(parent,matrix(l)),children=groups.get(l.id)??[],opacity=Number(l.opacity??1)*inherited,key=l.source?`${l.source.$ref}:${l.source.port}`:undefined,src=key?surfaces.get(key):undefined,mask=l.mask?surfaces.get(`${l.mask.$ref}:${l.mask.port}`):undefined;
  if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new EngineError('E_MEDIA_ALPHA','Native Layer opacity must be [0,1]');if(key&&src===undefined||l.mask&&mask===undefined)throw new EngineError('E_NATIVE_OUTPUT','Unavailable native Layer source or mask');
  if(children.length&&l.isolation!=='pass-through'){let isolated=blank;if(src!==undefined)isolated=raster(isolated,src,transform,'source-over',1);for(const child of children)isolated=draw(child,isolated,transform);return raster(dst,isolated,transform,l.blend,opacity,mask,true);}
  if(mask!==undefined&&children.length)throw new EngineError('E_MEDIA_GROUP','Masked pass-through groups require isolation');if(src!==undefined)dst=raster(dst,src,transform,l.blend,opacity,mask);for(const child of children)dst=draw(child,dst,transform,opacity);return dst;
 };
 let output=background.every(v=>v===0)?blank:fill(background);for(const root of groups.get(undefined)??[])output=draw(root,output,[width/tvg.composition.width,0,0,height/tvg.composition.height,0,0]);return output;
}
