import {EngineError} from '../../src/core/errors.ts';
import type {GpuPixelKernelSource,GpuPixelImageInfo} from './pixel-types.ts';
import {assertColor} from '../../src/media/surface.ts';
import {dataShaderHelpers} from './data-shader.ts';

export const pixelHeaderWords=32;
export const pixelHeaderWordCount=(s:GpuPixelKernelSource)=>s.abiVersion===2?4*Math.max(8,6+3*s.dataInputs.length):pixelHeaderWords;
const fail=(message:string):never=>{throw new EngineError('E_GPU_PIXEL_CONTRACT',message);};
export function validatePixelKernel(s:GpuPixelKernelSource,native=false):GpuPixelKernelSource {
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['abiVersion','id','version','inputCount','parameterWords','code',...s.abiVersion===2?['dataInputs']:[]].includes(k)))fail('Unknown kernel field');
 if(s.abiVersion!==1&&s.abiVersion!==2)fail('Unsupported pixel kernel ABI version');
 if(typeof s.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(s.id)||typeof s.version!=='string'||!/^\d+\.\d+\.\d+$/.test(s.version))fail('Kernel needs an explicit id and exact version');
 if(!Number.isInteger(s.inputCount)||s.inputCount<0||s.inputCount>4||!Number.isInteger(s.parameterWords)||s.parameterWords<0||s.parameterWords>0xffffffff)fail('Pixel ABI supports 0..4 image inputs; parameter layout must fit the selected profile and actual device');
 if(typeof s.code!=='string'||!s.code.trim()||/@|\b(enable|requires|diagnostic)\b|\bfw_\w*/.test(s.code))fail('Kernel code must be a bounded source body without attributes, directives, resource bindings or reserved fw_ identifiers');
 const base={id:s.id,version:s.version,inputCount:s.inputCount,parameterWords:s.parameterWords,code:s.code};
 if(s.abiVersion===2){if(!Array.isArray(s.dataInputs)||s.dataInputs.some(d=>!d||Object.keys(d).some(k=>k!=='type')||!['f32','u32','i32'].includes(d.type)))fail('Invalid typed data-input layout');return Object.freeze({abiVersion:2,...base,dataInputs:Object.freeze(s.dataInputs.map(d=>Object.freeze({type:d.type})))});}
 return Object.freeze({abiVersion:1,...base});
}
export function pixelInfo(o:Omit<GpuPixelImageInfo,'version'>):GpuPixelImageInfo {
 if(!o||!Number.isSafeInteger(o.width*o.height)||o.width*o.height>0xffffffff)fail('Image exceeds the u32 pixel address space');
 return pixelMetadata(o);
}
/** Shared metadata only. Allocation policy belongs to each existing owner;
 * Each owner applies actual device/allocation budgets; no fixed 16MP policy. */
export function pixelMetadata(o:Omit<GpuPixelImageInfo,'version'>):GpuPixelImageInfo {
 if(!o||!Number.isSafeInteger(o.width)||!Number.isSafeInteger(o.height)||o.width<1||o.height<1||o.width>0xffffffff||o.height>0xffffffff||!Number.isSafeInteger(o.width*o.height*16))fail('Image dimensions and working bytes must be positive safe integers');
 if(!['rgba16float','rgba32float'].includes(o.format)||!['straight','premultiplied','opaque'].includes(o.alpha))fail('Explicit float format and Alpha mode required');
 assertColor(o.color);if(o.color.transfer!=='linear'||o.color.reference!=='scene')fail('Resident images require explicit scene-linear color');
 return Object.freeze({version:1,width:o.width,height:o.height,format:o.format,alpha:o.alpha,color:Object.freeze({...o.color})});
}
export function samePixelColor(a:GpuPixelImageInfo['color'],b:GpuPixelImageInfo['color']){return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k as keyof typeof a]===b[k as keyof typeof b]);}

/** Fixed resource layout. User helpers see read-only inputs; output allocation,
 * dispatch, publication conversion and diagnostics stay in the existing owner.
 * This is not a sandbox/proof for untrusted WGSL or a GPU preemption mechanism. */
export function pixelShader(source:GpuPixelKernelSource):string {return buildPixelShader(source,true);}
/** Native-only unchecked publication profile. Resource bounds/layout remain
 * validated; numerical references belong in tests, never GPU readback flags. */
export function nativePixelShader(source:GpuPixelKernelSource):string {
 return buildPixelShader(source,false);
}
function buildPixelShader(source:GpuPixelKernelSource,checked:boolean):string {
 const s=validatePixelKernel(source,!checked),words=Math.max(1,Math.ceil(s.parameterWords/4)),data=s.abiVersion===2?s.dataInputs:[],n=s.inputCount+data.length;
 const bindings=Array.from({length:s.inputCount},(_,i)=>`@group(0) @binding(${i}) var<storage,read> fw_input${i}:array<vec4f>;`).join('\n');
 const helpers=Array.from({length:s.inputCount},(_,i)=>`
 fn size${i}()->vec2u{return fw_meta.header[${i+1}].xy;}
 fn alpha${i}()->u32{return fw_meta.header[${i+1}].z;}
 fn read${i}(p:vec2i)->vec4f{let d=size${i}();if(any(p<vec2i(0))||any(p>=vec2i(d))){return vec4f(0.);}return fw_input${i}[u32(p.y)*d.x+u32(p.x)];}
 fn sample${i}(p:vec2f,edgeClamp:bool)->vec4f{
  let d=vec2i(size${i}());let q=vec2i(floor(p));let t=fract(p);
  var a=q;var b=q+vec2i(1,0);var c=q+vec2i(0,1);var e=q+vec2i(1);
  if(edgeClamp){a=clamp(a,vec2i(0),d-1);b=clamp(b,vec2i(0),d-1);c=clamp(c,vec2i(0),d-1);e=clamp(e,vec2i(0),d-1);}
  return (read${i}(a)*(1.-t.x)+read${i}(b)*t.x)*(1.-t.y)+(read${i}(c)*(1.-t.x)+read${i}(e)*t.x)*t.y;
 }
 // Integer coordinates are pixel centers; normalized UV centers need -.5.
 fn sampleUv${i}(uv:vec2f,edgeClamp:bool)->vec4f{return sample${i}(uv*vec2f(size${i}())-vec2f(.5),edgeClamp);}
 `).join('\n');
 return `${bindings}
 ${data.map((_,i)=>`@group(0) @binding(${s.inputCount+i}) var<storage,read> fw_data${i}:array<u32>;`).join('\n')}
 struct FwMeta{header:array<vec4u,${pixelHeaderWordCount(s)/4}>,params:array<vec4u,${words}>}
 @group(0) @binding(${n}) var<storage,read_write> fw_output:array<vec4f>;
 @group(0) @binding(${n+1}) var<uniform> fw_meta:FwMeta;
 ${checked?'@group(0) @binding('+(n+2)+') var<storage,read_write> fw_errors:array<atomic<u32>>;':''}
 fn outputSize()->vec2u{return fw_meta.header[0].xy;}
 fn paramU32(i:u32)->u32{return fw_meta.params[i/4u][i%4u];}
 fn paramF32(i:u32)->f32{return bitcast<f32>(paramU32(i));}
 ${helpers}
 ${dataShaderHelpers(data.map(d=>({type:d.type,access:'read' as const})),{header:'fw_meta.header',metaBase:6,status:'fw_errors',slot:'fw_meta.header[5].x',prefix:'fw_data',linearPrefix:'data',checked})}
 // Exact binary16 RNE for finite F32 values, including half subnormals.
 fn fw_half(v:f32)->f32{
  let bits=bitcast<u32>(v);let sign=bits&0x80000000u;let e=i32((bits>>23u)&255u)-127;let m=bits&0x7fffffu;
 ${checked?'':` if(e==128){return bitcast<f32>(sign|0x7f800000u|select(0u,0x400000u,m!=0u));}
  if(e>15){return bitcast<f32>(sign|0x7f800000u);}`}
  var h=0u;
  if(e>=-25){if(e < -14){let shift=u32(-e-1);let x=m|0x800000u;h=x>>shift;let r=x&((1u<<shift)-1u);let tie=1u<<(shift-1u);h+=select(0u,1u,r>tie||(r==tie&&(h&1u)!=0u));}
   else{h=(u32(e+15)<<10u)|(m>>13u);let r=m&8191u;h+=select(0u,1u,r>4096u||(r==4096u&&(h&1u)!=0u));}}
  let he=(h>>10u)&31u;let hm=h&1023u;
 ${checked?'':' if(he==31u){return bitcast<f32>(sign|0x7f800000u|(hm<<13u));}'}
  if(he==0u){return bitcast<f32>(sign|bitcast<u32>(f32(hm)*0x1p-24f));}
  return bitcast<f32>(sign|((he+112u)<<23u)|(hm<<13u));
 }
 ${s.code}
 @compute @workgroup_size(8,8) fn fw_main(@builtin(global_invocation_id) id:vec3u){
  let d=outputSize();if(id.x>=d.x||id.y>=d.y){return;}let index=id.y*d.x+id.x;var value=pixel(id.xy);
  let half=fw_meta.header[0].z==1u;let alpha=fw_meta.header[0].w;
${checked?`  if(any((bitcast<vec4u>(value)&vec4u(0x7f800000u))==vec4u(0x7f800000u))||value.a<0.||value.a>1.||(alpha==2u&&value.a!=1.)||(half&&any(abs(value)>vec4f(65504.)))){
   atomicMin(&fw_errors[fw_meta.header[5].x],index);value=vec4f(0.);
  }`:""}
  if(half){value=vec4f(fw_half(value.r),fw_half(value.g),fw_half(value.b),fw_half(value.a));}
  fw_output[index]=value;
 }`;
}
