/** Explicit Node-only asset preparation. Never imported by the Stage entry. */
import {readFile,writeFile,mkdir,access,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,dirname} from 'node:path';
import {EngineError} from '../../../src/core/errors.ts';import {readIccImage} from '../../../src/media/input.ts';import {readExr} from '../../../src/media/ocio.ts';import {transformPixels} from '../../../src/media/color.ts';
import {linear709,pixelsFromSurface,surfaceFromPixels,isProfessionalSurface,type ProfessionalSurface,type ColorEncoding,type AlphaMode} from '../../../src/media/surface.ts';
import {cubeLut} from '../grading/index.ts';import type {LutEncoding} from '../grading/types.ts';
export {prepareOcio} from '../closure-filters/ocio/prepare.ts';
export type {OcioRequest} from '../closure-filters/ocio/prepare.ts';
export interface PrepareCubeLutOptions {inputEncoding:LutEncoding;outputEncoding:LutEncoding;maxBytes?:number}
/** Offline file → existing complete LUT JSON. Explicit paths, no overwrite,
 * source hash and adjustable input budget; no new Stage file permission. */
export async function prepareCubeLut(input:string,output:string,options:PrepareCubeLutOptions){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['inputEncoding','outputEncoding','maxBytes'].includes(k)))throw new EngineError('E_IMAGE_ASSET_OPTIONS','Expected explicit LUT encodings and optional maxBytes');
 const maximum=options.maxBytes??16*1024**2;if(!Number.isSafeInteger(maximum)||maximum<1)throw new EngineError('E_IMAGE_ASSET_OPTIONS','LUT maxBytes must be a positive adjustable byte budget');
 const file=resolve(input),destination=resolve(output);if((await stat(file)).size>maximum)throw new EngineError('E_IMAGE_ASSET_BUDGET','Cube source exceeds maxBytes',{details:{path:file,maxBytes:maximum}});const bytes=await readFile(file);if(bytes.length>maximum)throw new EngineError('E_IMAGE_ASSET_BUDGET','Cube source grew beyond maxBytes');
 const table=cubeLut(bytes.toString('utf8'),{inputEncoding:options.inputEncoding,outputEncoding:options.outputEncoding}),encoded=Buffer.from(JSON.stringify(table)+'\n');await mkdir(dirname(destination),{recursive:true});
 try{await writeFile(destination,encoded,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new EngineError('E_IMAGE_ASSET_EXISTS','Refusing to overwrite an existing LUT asset',{details:{path:destination}});throw error;}
 const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');return {path:destination,sha256:sha(encoded),source:{path:file,sha256:sha(bytes)},kind:table.kind,size:table.size,inputEncoding:table.inputEncoding,outputEncoding:table.outputEncoding};
}
export interface PrepareImageOptions {decode?:'icc-sdr'|'surface-v2'|'exr';workingColor?:ColorEncoding;alpha?:AlphaMode;missingProfile?:'error'|'assume-srgb'}
export async function prepareImageAsset(input:string,output:string,options:PrepareImageOptions={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['decode','workingColor','alpha','missingProfile'].includes(k)))throw new EngineError('E_IMAGE_ASSET_OPTIONS','Expected declared image preparation options');
  const file=resolve(input),destination=resolve(output),exists=()=>new EngineError('E_IMAGE_ASSET_EXISTS','Refusing to overwrite an existing prepared image asset',{details:{path:destination},hint:'Choose a new output filename or explicitly review/remove your old project asset.'});try{await access(destination);throw exists();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}const before=await readFile(file),sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex'),decode=options.decode??(/\.exr$/i.test(file)?'exr':/\.surface\.json$/i.test(file)?'surface-v2':'icc-sdr');
  let source:ProfessionalSurface;if(decode==='surface-v2'){const parsed:unknown=JSON.parse(before.toString('utf8'));if(!isProfessionalSurface(parsed))throw new EngineError('E_IMAGE_ASSET_SOURCE','Expected an existing Surface v2 input');pixelsFromSurface(parsed);source=parsed;}else if(decode==='exr')source=(await readExr(file)).surface;else if(decode==='icc-sdr')source=(await readIccImage(file,{onMissing:options.missingProfile??'assume-srgb'})).surface;else throw new EngineError('E_IMAGE_ASSET_OPTIONS','Unknown decode profile');
  if(sha(await readFile(file))!==sha(before))throw new EngineError('E_IMAGE_ASSET_SOURCE_CHANGED','Input changed while preparing the asset');
  const color=options.workingColor??linear709,alpha=options.alpha??'premultiplied';if(color.transfer!=='linear'||color.reference!=='scene')throw new EngineError('E_IMAGE_ASSET_COLOR','Prepared Native images require explicit scene-linear working color');const pixels=transformPixels(pixelsFromSurface(source),source.color,color,source.alpha).pixels;
  if(source.alpha!==alpha)for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3];if(source.alpha==='premultiplied'&&alpha!=='premultiplied'){if(a===0&&pixels.subarray(i,i+3).some(v=>v!==0))throw new EngineError('E_IMAGE_ASSET_ALPHA','Alpha-zero associated emission cannot be represented by straight RGB without loss');if(a>0)for(let j=0;j<3;j++)pixels[i+j]/=a;}else if(alpha==='premultiplied')for(let j=0;j<3;j++)pixels[i+j]*=a;}
  const surface=surfaceFromPixels(source.width,source.height,pixels,{format:'rgba32float',color,alpha,deferBase64:true}),values=pixelsFromSurface(surface),bytes=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++)bytes.writeFloatLE(values[i],i*4);
  // Fresh output only: never silently overwrite the creator's source/asset.
  await mkdir(dirname(destination),{recursive:true});try{await writeFile(destination,bytes,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw exists();throw error;}
  return {kind:'prepared-float-image' as const,schemaVersion:1 as const,path:destination,width:surface.width,height:surface.height,color:surface.color,alpha:surface.alpha,format:'rgba32float' as const,native:{width:surface.width,height:surface.height,color:surface.color,alpha:surface.alpha,format:'rgba32float' as const},layout:'row-major-rgba-f32le' as const,byteLength:bytes.length,sha256:sha(bytes),source:{path:file,sha256:sha(before),decode}};
}

export {prepareRotoAssets} from './model-assets.ts';
export type {RotoAssetFiles,RotoAssetOptions} from './model-assets.ts';
export {prepareVideoRotoAssets} from './video-model-assets.ts';
export type {VideoRotoAssetFiles} from './video-model-assets.ts';

export {inspectExr,readExr,writeExr} from '../../../src/media/ocio.ts';
export type {ReadExrOptions} from '../../../src/media/ocio.ts';
export type {ExrSelection,ExrPartInfo,ExrWindow} from '../../../src/media/exr-selection.ts';
export {pathAovChannels,writePathAovExr} from '../../native-gpu/path-aov.ts';
export type {NativePathAovFrame} from '../../native-gpu/path-aov.ts';
