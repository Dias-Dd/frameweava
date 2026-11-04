import {preciseOcio,type MathCall,type MatrixCall,type BinaryCall} from './precision.ts';
import {bindUniforms,type ExtractedUniform} from './dynamic-prepare.ts';
import {cpuGrading} from './grading-math.ts';
import {aces2CpuOrder} from './aces2-order.ts';
/** Node-only OFFLINE preparation. Never import this entry into Stage code.
 * All paths/executables are explicit. No installation, registry, auto trust,
 * network, runtime shader fetch, device ownership or per-frame subprocess. */
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {assertColor,type ColorEncoding} from '../../../../src/media/surface.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import type {OcioDefinition,OcioKind} from '../types.ts';
const exec=promisify(execFile),sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
export interface OcioRequest {operation:OcioKind;config:string;source?:string;destination?:string;display?:string;view?:string;linearDisplaySpace?:string;file?:string;look?:string;inputColor:ColorEncoding;outputColor:ColorEncoding;uniformAliases?:Readonly<Record<string,string>>;dynamicProperties?:readonly ('exposure-contrast'|'grading-primary'|'grading-rgb-curve')[]}
interface Extracted {ocioVersion:string;configText:string;cacheId:string;glsl:string;uniforms?:ExtractedUniform[];textures:{edge:number;width:number;height:number;dimension:number;channels:number;sampler:string;texture:string;interpolation:'nearest'|'linear';values:number[]}[];files:string[]}
function sampler(t:Extracted['textures'][number],index:number,offset:number){const dims=t.dimension,w=t.width,h=t.height,d=dims===3?w:1,n=t.channels,ivec=dims===1?'int':'ivec'+dims,vec=dims===1?'float':'vec'+dims,components=dims===1?'p':'p.x',yy=dims===1?'0':'p.y',zz=dims===3?'p.z':'0';
 const fetch=`vec4 ocio_fetch_${index}(${ivec} p){uint at=${offset}u+(uint(clamp(${zz},0,${d-1}))*${w*h}u+uint(clamp(${yy},0,${h-1}))*${w}u+uint(clamp(${components},0,${w-1})))*${n}u;return vec4(ocio_data(at),${n===3?'ocio_data(at+1u),ocio_data(at+2u)':'0.,0.'},1.);}`;
 const texel=`vec4 ocio_texel_${index}(${ivec} p,int lod){return ocio_fetch_${index}(p);}`;
 const size=dims===1?`${w}.0`:dims===2?`vec2(${w}.0,${h}.0)`:`vec3(${w}.0,${h}.0,${d}.0)`,zero=dims===1?'0.':vec+'(0.)',max=dims===1?`${w-1}.0`:dims===2?`vec2(${w-1}.0,${h-1}.0)`:`vec3(${w-1}.0,${h-1}.0,${d-1}.0)`,half=dims===1?'.5':vec+'(.5)';
 let body=`vec4 ocio_sample_${index}(${vec} uv){${vec} v=clamp(uv*${size}-${half},${zero},${max});`;
 if(t.interpolation==='nearest')body+=`return ocio_fetch_${index}(${ivec}(floor(v+${half})));}`;
 else if(dims===1)body+=`int lo=int(floor(v));float f=fract(v);return mix(ocio_fetch_${index}(lo),ocio_fetch_${index}(lo+1),f);}`;
 else{body+=`${ivec} lo=${ivec}(floor(v));${vec} f=fract(v);`;if(dims===2)body+=`return mix(mix(ocio_fetch_${index}(lo),ocio_fetch_${index}(lo+ivec2(1,0)),f.x),mix(ocio_fetch_${index}(lo+ivec2(0,1)),ocio_fetch_${index}(lo+ivec2(1,1)),f.x),f.y);}`;else body+=`vec4 a=mix(ocio_fetch_${index}(lo),ocio_fetch_${index}(lo+ivec3(1,0,0)),f.x);vec4 b=mix(ocio_fetch_${index}(lo+ivec3(0,1,0)),ocio_fetch_${index}(lo+ivec3(1,1,0)),f.x);vec4 c=mix(ocio_fetch_${index}(lo+ivec3(0,0,1)),ocio_fetch_${index}(lo+ivec3(1,0,1)),f.x);vec4 d=mix(ocio_fetch_${index}(lo+ivec3(0,1,1)),ocio_fetch_${index}(lo+ivec3(1,1,1)),f.x);return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);}`;}
 return fetch+'\n'+texel+'\n'+body;
}
export async function prepareOcio(request:OcioRequest,options:{projectRoot:string;outputDirectory:string;python:string;compiler:string;experimentalAces2CpuOrder?:true}):Promise<OcioDefinition>{
 assertColor(request.inputColor);assertColor(request.outputColor);if(request.inputColor.transfer!=='linear'||request.inputColor.reference!=='scene'||request.outputColor.transfer!=='linear'||request.outputColor.reference!==(request.operation==='display'?'display':'scene'))throw new EngineError('E_NATIVE_OCIO_PROFILE','Native OCIO requires explicitly linear input/output metadata');
 const root=await realpath(resolve(options.projectRoot)),dir=resolve(options.outputDirectory);await mkdir(dir,{recursive:true});
 const confined=async(path:string)=>{const abs=await realpath(resolve(root,path)),rel=relative(root,abs);if(rel.startsWith('..')||isAbsolute(rel))throw new EngineError('E_NATIVE_OCIO_PATH','OCIO resources must stay inside the explicit project root',{details:{path}});return abs;};
 const r={...request};if(!r.config.startsWith('cg-config-')&&!r.config.startsWith('studio-config-'))r.config=await confined(r.config);if(r.file)r.file=await confined(r.file);
 const path=join(dir,'request.json');await writeFile(path,JSON.stringify(r));const raw=await exec(resolve(options.python),[fileURLToPath(new URL('./extract.py',import.meta.url)),path],{windowsHide:true,maxBuffer:64*1024**2,timeout:60000}),data=JSON.parse(raw.stdout) as Extracted;
 const uniforms=bindUniforms(data.glsl,data.uniforms??[],request.uniformAliases);let glsl=cpuGrading(options.experimentalAces2CpuOrder?aces2CpuOrder(uniforms.glsl,data.ocioVersion):uniforms.glsl,data.ocioVersion),functions=uniforms.functions,offset=1;const values:number[]=[0];
 for(const [j,t]of data.textures.entries()){if(!Number.isSafeInteger(t.width)||t.width<1||!Number.isSafeInteger(t.height)||t.height<1||![1,2,3].includes(t.dimension)||![1,3].includes(t.channels)||t.values.length!==t.width*t.height*(t.dimension===3?t.width:1)*t.channels||t.values.some(v=>!Number.isFinite(v)))throw new EngineError('E_NATIVE_OCIO_TEXTURE','Invalid OCIO GPU texture');const escaped=t.sampler.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');glsl=glsl.replace(new RegExp('uniform\\s+sampler[123]D\\s+'+escaped+'\\s*;','g'),'').replace(new RegExp('texture\\(\\s*'+escaped+'\\s*,','g'),`ocio_sample_${j}(`).replace(new RegExp('texelFetch\\(\\s*'+escaped+'\\s*,','g'),`ocio_texel_${j}(`);if(glsl.includes(t.sampler))throw new EngineError('E_NATIVE_OCIO_TEXTURE','Unsupported generated sampler operation');functions+=sampler(t,j,offset);for(const value of t.values)values.push(value);offset+=t.values.length;}
 // OCIO emits nested writable swizzles (outColor.rgb.r). Naga's GLSL
 // frontend currently lowers their stores to values. Collapse only the exact
 // identity swizzle; arithmetic and component order remain unchanged.
 glsl=glsl.replace(/\.rgb\.([rgbxyz])\b/g,(_m:string,c:string)=>'.'+({x:'r',y:'g',z:'b'}[c]??c));
 const input='#version 450\nfloat ocio_data(uint i){return 0.;}\n'+(uniforms.layout.length?'uint ocio_dynamic_data(uint i){return 0u;}\n':'')+functions+'\n'+glsl+'\nlayout(local_size_x=1) in;void main(){}\n';
 await writeFile(join(dir,'processor.glsl'),input);
 // execFile cannot supply stdin: a bounded child process is used by the fixed
 // translation helper only. Keep exact source and compiler identity.
 const {spawn}=await import('node:child_process');const child=spawn(resolve(options.compiler),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;if(stdout.length>64*1024**2)child.kill();});child.stderr.on('data',b=>stderr+=b);child.stdin.end(JSON.stringify({glsl:input}));const timer=setTimeout(()=>child.kill(),60000);let code:number|null;try{code=await new Promise<number|null>((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});}finally{clearTimeout(timer);}if(code!==0)throw new EngineError('E_NATIVE_OCIO_TRANSLATE',stderr);
 const translated=JSON.parse(stdout) as {wgsl:string;mathCalls:MathCall[];matrices:MatrixCall[];binary:BinaryCall[]};let wgsl=preciseOcio(translated.wgsl,translated.mathCalls,translated.matrices,translated.binary);const placeholder=/fn ocio_data\w*\([^)]*\)\s*->\s*f32\s*\{[^}]*\}/;if(!placeholder.test(wgsl))throw new EngineError('E_NATIVE_OCIO_TRANSLATE','Naga data hook missing');wgsl=wgsl.replace(placeholder,'fn ocio_data(i:u32)->f32{return data1(i);}')
 if(uniforms.layout.length){const hook=/fn ocio_dynamic_data\w*\([^)]*\)\s*->\s*u32\s*\{[^}]*\}/;if(!hook.test(wgsl))throw new EngineError('E_NATIVE_OCIO_TRANSLATE','Naga dynamic-word hook missing');wgsl=wgsl.replace(hook,'fn ocio_dynamic_data(i:u32)->u32{return data3(i);}');}
 const prefix=`fn pixel(p:vec2u)->vec4f{let i=(p.y*outputSize().x+p.x)*4u;let a=data0(i+3u);var base=vec4f(data2(i),data2(i+1u),data2(i+2u),a);if(paramU32(0u)==1u){base=vec4f(base.rgb*a,a);}if(a==0.){return base;}var c=vec3f(data0(i),data0(i+1u),data0(i+2u));if(paramU32(0u)==0u){c/=a;}let v=ocio_apply(vec4f(c,1.)).rgb+vec3f(data1(0u));return vec4f(mix(base.rgb,v*a,paramF32(1u)),a);}`;
 wgsl+='\n'+prefix;await writeFile(join(dir,'processor.wgsl'),wgsl);
 const resources=[] as {path:string;sha256:string}[];for(const path of [...new Set([...data.files,...r.file?[r.file]:[],...isAbsolute(r.config)?[r.config]:[]])]){const file=await confined(path);resources.push({path:relative(root,file).replaceAll('\\','/'),sha256:sha(await readFile(file))});}
 const base={kind:'native-ocio' as const,operation:r.operation,inputColor:r.inputColor,outputColor:r.outputColor,kernel:{abiVersion:2 as const,id:'frameweave/ocio/'+sha(wgsl).slice(0,32),version:'1.0.0',inputCount:0,dataInputs:[{type:'f32' as const},{type:'f32' as const},{type:'f32' as const},...uniforms.layout.length?[{type:'u32' as const}]:[]],parameterWords:128,code:wgsl},lutValues:values.length?values:[0]},provenance={ocioVersion:data.ocioVersion,configSha256:sha(data.configText),processorCacheId:data.cacheId,glslSha256:sha(input),wgslSha256:sha(wgsl),lutSha256:sha(new Uint8Array(Float32Array.from(values.length?values:[0]).buffer)),compilerSha256:sha(await readFile(options.compiler)),resources};
 const definition:OcioDefinition=uniforms.layout.length?{...base,schemaVersion:2,uniforms:uniforms.layout,provenance:{...provenance,uniformSha256:sha(JSON.stringify(uniforms.layout))}}:{...base,schemaVersion:1,provenance};
 await writeFile(join(dir,'processor.json'),JSON.stringify(definition));return definition;
}
