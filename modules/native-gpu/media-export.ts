import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {EngineError} from '../../src/core/errors.ts';import {gamutMatrix} from '../../src/media/color.ts';
import {assertColor,type ColorEncoding} from '../../src/media/surface.ts';import type {ProfessionalEncodeOptions} from '../../src/media/encoding.ts';import {assertHdr10Metadata} from '../../src/media/encoding.ts';
import {runtimeCachePath} from '../../src/runtime/paths.ts';
import {mediaPython} from '../../src/media/python.ts';
export interface NativeColourLut{width:number;height:number;channels:number;linear:boolean;values:number[]}
export interface NativeMediaExport{
 version:1;image:number;output:string;codec:'hevc_nvenc'|'av1_nvenc';fps:[number,number];primaries:1|2;transfer:16|18;
 shader:string;textures:NativeColourLut[];matte:[number,number,number];alpha:number;workingColor:ColorEncoding;
 hdr?:{chromaticities:number[];maxNits:number;minNits:number;maxCLL:number;maxFALL:number};provenance:unknown;
}
const exec=promisify(execFile);
function colourShader(from:ColorEncoding,to:ColorEncoding){
 const m=gamutMatrix(from,to).map(row=>row.map(v=>v*from.referenceWhiteNits));
 const matrix=m.map(row=>'dot(rgb,float3('+row.map(v=>v.toPrecision(17)).join(',')+'))').join(',');
 const body=to.transfer==='pq'?'rgb=float3(pq(rgb.r),pq(rgb.g),pq(rgb.b));':'rgb=clamp(rgb,0.,'+to.peakNits+');rgb/='+to.peakNits+';float y=dot(rgb,float3(.2627,.6780,.0593));float gain=y>0.?pow(y,'+(1-to.hlgSystemGamma!)/to.hlgSystemGamma!+'):0.;rgb*=gain;rgb=float3(hlg(rgb.r),hlg(rgb.g),hlg(rgb.b));';
 return 'float pq(float n){float p=pow(clamp(n,0.,10000.)/10000.,2610./16384.);return pow((3424./4096.+2413./128.*p)/(1.+2392./128.*p),2523./32.);}float hlg(float x){return x<=1./12.?sqrt(3.*x):.17883277*log(12.*x-.28466892)+.55991073;}float4 fw_ocio(float4 v){float3 rgb=v.rgb;rgb=float3('+matrix+');'+body+'return float4(rgb,v.a);}';
}
/** One preparation per delivery. Exports OCIO instructions/LUTs, not pixels. */
export async function prepareNativeMediaExport(output:string,from:ColorEncoding,options:ProfessionalEncodeOptions,signal?:AbortSignal,limits:{maxPreparedBytes?:number;timeoutMs?:number}={}):Promise<Omit<NativeMediaExport,'image'|'alpha'>>{
 if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','GPU colour preparation cancelled');
 assertColor(from);assertColor(options.outputColor);
 if(options.conversion.clip!==true)throw new EngineError('E_NATIVE_MEDIA_RANGE_POLICY','Direct GPU delivery requires explicit clip:true; clip:false retains the reference path and its per-sample rejection semantics');
 if(!['hdr10','hlg'].includes(options.preset)||options.alpha.mode!=='flatten'||!['rec709','rec2020'].includes(options.outputColor.primaries)||from.transfer!=='linear'||options.alpha.matte.length!==3||options.alpha.matte.some(v=>!Number.isFinite(v)))throw new EngineError('E_NATIVE_MEDIA_PROFILE','Direct media v1 supports explicit scene-linear HDR10/HLG with a finite linear matte');
 const codec=options.encoder??'hevc_nvenc';if(!['hevc_nvenc','av1_nvenc'].includes(codec))throw new EngineError('E_NATIVE_MEDIA_CODEC','GPU delivery needs explicit HEVC/AV1 NVENC');
 const c=options.outputColor;if(c.primaries!=='rec2020'||c.transfer!==(options.preset==='hdr10'?'pq':'hlg'))throw new EngineError('E_MEDIA_CODEC_COLOR','HDR10/HLG output colour does not match preset');
 if(options.preset==='hdr10'){if(!options.hdr10)throw new EngineError('E_MEDIA_HDR_METADATA','HDR10 metadata is required');assertHdr10Metadata(options.hdr10);}else if(options.hdr10)throw new EngineError('E_MEDIA_HDR_METADATA','HLG cannot carry PQ mastering metadata');
 let shader:string,textures:NativeColourLut[]=[],provenance:unknown={kind:'colourimetric',from,to:c};
 if(options.conversion.kind==='colorimetric')shader=colourShader(from,c);
 else{
  if(c.transfer!=='pq'||options.conversion.transform.display!=='Rec.2100-PQ - Display'||options.conversion.transform.view!=='ACES 2.0 - HDR 1000 nits (Rec.2020)'||options.conversion.transform.destination)throw new EngineError('E_NATIVE_MEDIA_OCIO_PROFILE','GPU OCIO v1 is qualified for ACES 2.0 HDR 1000 nits Rec.2020 only; use the reference backend for other views');
  const python=mediaPython('E_MEDIA_OCIO_UNAVAILABLE');
  const source=options.conversion.transform.source,expected:Record<string,string>={'ACEScg':'acescg','Linear Rec.2020':'rec2020','Linear Rec.709 (sRGB)':'rec709'};
  if(expected[source]!==from.primaries||from.referenceWhiteNits!==100)throw new EngineError('E_NATIVE_MEDIA_OCIO_SOURCE','GPU OCIO source must match the scene-linear working encoding and 100-nit reference');
  const parent=runtimeCachePath('native-ocio-gpu');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'profile-'));
  try{const file=join(dir,'request.json');await writeFile(file,JSON.stringify(options.conversion.transform));const result=await exec(resolve(python),[fileURLToPath(new URL('./native-media/ocio_shader.py',import.meta.url)),file],{windowsHide:true,signal,timeout:limits.timeoutMs??30000,maxBuffer:limits.maxPreparedBytes??64*1024**2});const profile=JSON.parse(result.stdout);if(profile.version!==1)throw new EngineError('E_NATIVE_MEDIA_OCIO','Unsupported exported GPU shader version');shader=profile.shader;textures=profile.textures;provenance=profile.provenance;}
  catch(e){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','GPU colour preparation cancelled');if(e instanceof EngineError)throw e;throw new EngineError('E_NATIVE_MEDIA_OCIO',String((e as {stderr?:unknown}).stderr??e).slice(-16000));}
  finally{await rm(dir,{recursive:true,force:true});}
 }
 const d=options.hdr10?.masteringDisplay,scale=codec==='av1_nvenc'?65536:50000;
 return {version:1,output,codec:codec as NativeMediaExport['codec'],fps:[options.fps.num,options.fps.den],primaries:2,transfer:options.preset==='hdr10'?16:18,shader,textures,matte:options.alpha.matte,workingColor:structuredClone(from),provenance,...d?{hdr:{chromaticities:[...d.red,...d.green,...d.blue,...d.white].map(n=>Math.round(n*scale)),maxNits:Math.round(d.maxNits*(codec==='av1_nvenc'?256:10000)),minNits:Math.round(d.minNits*(codec==='av1_nvenc'?16384:10000)),maxCLL:options.hdr10!.maxCLL,maxFALL:options.hdr10!.maxFALL}}:{}};
}
