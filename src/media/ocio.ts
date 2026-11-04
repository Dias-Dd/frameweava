import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,writeFile,readFile,rm,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {EngineError} from '../core/errors.ts';
import {runtimeCachePath} from '../runtime/paths.ts';
import type {OcioWorker} from './ocio-worker.ts';
import {pixelsFromSurface,surfaceFromPixels,assertColor,acescg,linear2020,linear709,srgb,pq2020,type ProfessionalSurface,type ColorEncoding} from './surface.ts';
export interface OcioTransform {config?:'cg-config-v4.0.0_aces-v2.0_ocio-v2.5'|'studio-config-v4.0.0_aces-v2.0_ocio-v2.5';source:string;destination?:string;display?:string;view?:string;outputColor:ColorEncoding}
const exec=promisify(execFile);
async function bridge<T>(request:Record<string,unknown>,pixels?:Float32Array,inputFile?:string,outputFile?:string,worker?:OcioWorker):Promise<{data:T;pixels?:Float32Array}>{
  const icc=['read-icc','write-icc'].includes(String(request.operation)),component=icc?'ICC':'OCIO';
  const python=process.env.FRAMEWEAVE_MEDIA_PYTHON;if(!python)throw new EngineError(`E_MEDIA_${component}_UNAVAILABLE`,'Explicit FRAMEWEAVE_MEDIA_PYTHON is required; no dependency is downloaded at runtime');
  const parent=runtimeCachePath('media-bridge');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'job-'));
  try{
    if(pixels)await writeFile(join(directory,'input.f32'),Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength));
    if(inputFile)await copyFile(resolve(inputFile),join(directory,'input.exr'));
    const input=join(directory,inputFile?'input.exr':'input.f32'),output=join(directory,outputFile?'output.exr':'output.f32');
    let vipsDirectory=process.env.FRAMEWEAVE_MEDIA_VIPS;
    if(icc&&process.platform==='win32'&&!vipsDirectory){try{vipsDirectory=join(dirname(createRequire(import.meta.url).resolve(`@img/sharp-win32-${process.arch}/package`)),'lib');}catch{throw new EngineError('E_MEDIA_ICC_UNAVAILABLE','Provide the reviewed libvips directory through FRAMEWEAVE_MEDIA_VIPS');}}
    await writeFile(join(directory,'request.json'),JSON.stringify({...request,input,output,...icc&&vipsDirectory?{vipsDirectory:resolve(vipsDirectory)}:{}}));
    let stdout:string;try{stdout=worker?await worker.run(join(directory,'request.json')):(await exec(resolve(python),[fileURLToPath(new URL('./ocio_bridge.py',import.meta.url)),join(directory,'request.json')],{timeout:120000,maxBuffer:1024*1024,windowsHide:true})).stdout;}
    catch(e){if(e instanceof EngineError)throw e;const v=e as {stdout?:string;stderr?:string};throw new EngineError(`E_MEDIA_${component}`,v.stdout??v.stderr??String(e));}
    const result=JSON.parse(stdout);if(!result.ok)throw new EngineError(`E_MEDIA_${component}`,result.error);
    if(outputFile){await mkdir(dirname(resolve(outputFile)),{recursive:true});await copyFile(output,resolve(outputFile));return {data:result.data};}
    if(pixels||inputFile){const bytes=await readFile(output);return {data:result.data,pixels:new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};}
    return {data:result.data};
  }finally{if(dirname(directory)!==parent)throw new EngineError('E_MEDIA_PATH','Invalid owned temporary directory');await rm(directory,{recursive:true,force:true});}
}
export async function ocioInfo(){return (await bridge<any>({operation:'ocio-info'})).data;}
/** Internal fixed-operation adapters; not exported from the public Node entry. */
export async function nativeIccRead(file:string,assumeSrgb:boolean){return bridge<any>({operation:'read-icc',assumeSrgb},undefined,file);}
export async function nativeIccWrite(surface:ProfessionalSurface,file:string,profile:'srgb'|'p3'){return (await bridge<any>({operation:'write-icc',width:surface.width,height:surface.height,alpha:surface.alpha,profile},pixelsFromSurface(surface),undefined,file)).data;}
export async function ocioTransform(surface:ProfessionalSurface,transform:OcioTransform,worker?:OcioWorker){
  if(!transform.source||!transform.outputColor||!!transform.destination===!!transform.display||transform.display&&!transform.view)throw new EngineError('E_MEDIA_OCIO_PROFILE','Choose either destination or display/view, with explicit outputColor');
  const spaces:Record<string,ColorEncoding>={'ACEScg':acescg,'Linear Rec.2020':linear2020,'Linear Rec.709 (sRGB)':linear709,'sRGB Encoded Rec.709 (sRGB)':srgb,'sRGB - Display':srgb,'Rec.2100-PQ - Display':pq2020,'Linear P3-D65':{...linear709,primaries:'display-p3'},'sRGB Encoded P3-D65':{...srgb,primaries:'display-p3'},'Display P3 - Display':{...srgb,primaries:'display-p3'}};
  const matches=(a:ColorEncoding,b:ColorEncoding)=>a.primaries===b.primaries&&a.transfer===b.transfer&&a.whitePoint===b.whitePoint&&a.reference===b.reference&&a.referenceWhiteNits===b.referenceWhiteNits;
  assertColor(surface.color);assertColor(transform.outputColor);
  if(!spaces[transform.source]||!matches(surface.color,spaces[transform.source]))throw new EngineError('E_MEDIA_COLOR_CONFLICT','OCIO source space is unknown or conflicts with surface encoding');
  const destination=transform.destination??transform.display!;if(!spaces[destination]||!matches(transform.outputColor,spaces[destination]))throw new EngineError('E_MEDIA_COLOR_CONFLICT','OCIO output space conflicts with declared output encoding');
  if(transform.display&&!transform.view?.startsWith('ACES 2.0 - '))throw new EngineError('E_MEDIA_OCIO_PROFILE','This profile requires an explicit ACES 2.0 rendering view');
  const r=await bridge<any>({...transform,operation:'ocio',width:surface.width,height:surface.height,alpha:surface.alpha},pixelsFromSurface(surface),undefined,undefined,worker);
  return {surface:surfaceFromPixels(surface.width,surface.height,r.pixels!,{format:'rgba32float',color:transform.outputColor,alpha:surface.alpha,deferBase64:true}),provenance:r.data};
}
const chromaticities={rec709:[.64,.33,.30,.60,.15,.06,.3127,.3290],rec2020:[.708,.292,.170,.797,.131,.046,.3127,.3290],'display-p3':[.68,.32,.265,.69,.15,.06,.3127,.3290],acescg:[.713,.293,.165,.830,.128,.044,.32168,.33767]};
export async function writeExr(surface:ProfessionalSurface,file:string,format:'rgba16float'|'rgba32float'='rgba16float'){
  if(surface.color.transfer!=='linear')throw new EngineError('E_MEDIA_EXR_COLOR','EXR intermediate requires explicit linear color; no preview transform is baked');
  if(format==='rgba16float')surfaceFromPixels(surface.width,surface.height,pixelsFromSurface(surface),{format,color:surface.color,alpha:surface.alpha});
  return (await bridge({...surface,operation:'write-exr',format,chromaticities:chromaticities[surface.color.primaries]},pixelsFromSurface(surface),undefined,file)).data;
}
export async function readExr(file:string,options?:{color:ColorEncoding;alpha:ProfessionalSurface['alpha']}){
  const r=await bridge<any>({operation:'read-exr'},undefined,file),color:ColorEncoding=options?.color??r.data.color,alpha:ProfessionalSurface['alpha']=options?.alpha??r.data.alpha;
  if(!color||!alpha)throw new EngineError('E_MEDIA_COLOR_MISSING','EXR without complete Frameweave color/alpha metadata requires explicit interpretation');
  assertColor(color);
  if(options&&((r.data.color&&Object.keys(color).some(k=>color[k as keyof ColorEncoding]!==r.data.color[k]))||(r.data.alpha&&alpha!==r.data.alpha)))throw new EngineError('E_MEDIA_COLOR_CONFLICT','Explicit EXR interpretation contradicts embedded color/alpha metadata');
  if(r.data.chromaticities?.length&&(r.data.chromaticities.length!==8||r.data.chromaticities.some((v:number,i:number)=>Math.abs(v-chromaticities[color.primaries][i])>2e-6)))throw new EngineError('E_MEDIA_COLOR_CONFLICT','EXR chromaticities contradict declared color primaries/white');
  return {surface:surfaceFromPixels(r.data.width,r.data.height,r.pixels!,{format:'rgba32float',color,alpha}),metadata:r.data};
}
