import sharp from 'sharp';
import {EngineError} from '../core/errors.ts';
import {inspectMediaFile,decodeVideoFloat} from './encoding.ts';
import {surfaceFromPixels,srgb,pq2020,hlg2020,linear709,linear2020,type ColorEncoding} from './surface.ts';
import {nativeIccRead,nativeIccWrite} from './ocio.ts';
/** Tagged still-image adapter. LCMS handles embedded ICC at 16-bit precision, not a float-HDR ICC claim. */
export async function readIccImage(file:string,options:{onMissing:'error'|'assume-srgb'}){
  if(!['error','assume-srgb'].includes(options.onMissing))throw new EngineError('E_MEDIA_POLICY','Explicit ICC missing-metadata policy required');
  const metadata=await sharp(file).metadata();if(!['jpeg','png','tiff','webp','heif'].includes(metadata.format??''))throw new EngineError('E_MEDIA_INPUT_FORMAT','ICC adapter accepts explicitly raster image formats only');if(!metadata.icc&&options.onMissing==='error')throw new EngineError('E_MEDIA_COLOR_MISSING','Image has no ICC profile; choose explicit sRGB interpretation');
  if(metadata.depth==='float'||metadata.depth==='double')throw new EngineError('E_MEDIA_ICC_PRECISION','Floating HDR ICC processing is not implemented; use linear EXR/OCIO instead');
  if(metadata.icc&&(metadata.icc.length<128||metadata.icc.readUInt32BE(0)>metadata.icc.length||metadata.icc.toString('ascii',36,40)!=='acsp'))throw new EngineError('E_MEDIA_ICC_PROFILE','Malformed embedded ICC profile');
  if(!metadata.width||!metadata.height||metadata.width*metadata.height*16>512*1024*1024)throw new EngineError('E_MEDIA_LAYOUT','ICC decode exceeds supported dimensions/bytes');
  const r=await nativeIccRead(file,!metadata.icc);
  return {surface:surfaceFromPixels(r.data.width,r.data.height,r.pixels!,{format:'rgba32float',color:srgb,alpha:'straight'}),source:{sourceDepth:metadata.depth,icc:metadata.icc?'embedded':'explicit-srgb',engine:'libvips-lcms2',workingPrecision:'integer16 / float-Lab PCS',...r.data},limitations:['ICC adapter is an SDR/16-bit path; it is not the float HDR path']};
}
/** Explicit ICC output for display-referred SDR. No silent quantization of an HDR surface. */
export async function writeIccTiff(surface:import('./surface.ts').ProfessionalSurface,file:string,profile:'srgb'|'p3'='srgb'){
  const {pixelsFromSurface}=await import('./surface.ts');if(surface.color.transfer!=='srgb'||surface.color.primaries!=='rec709'||surface.color.reference!=='display')throw new EngineError('E_MEDIA_ICC_PRECISION','ICC TIFF output accepts explicitly transformed sRGB display data only');
  const source=pixelsFromSurface(surface);for(let i=0;i<source.length;i++)if(i%4!==3){const a=source[i-i%4+3],v=surface.alpha==='premultiplied'?a?source[i]/a:0:source[i];if(v<0||v>1)throw new EngineError('E_MEDIA_CODE_RANGE','ICC output requires explicitly bounded source display codes');}
  return nativeIccWrite(surface,file,profile);
}
/** 10/12-bit YUV ingestion stays floating through zimg. Unknown/conflicting tags never silently default. */
export async function inspectMediaVideo(file:string,options:{interpretation?:ColorEncoding;metadataPolicy:'validate'|'override';alpha?:'straight'|'opaque';localVideo?:boolean;signal?:AbortSignal;probeFrames?:boolean}){
  if(!['validate','override'].includes(options.metadataPolicy)||options.metadataPolicy==='override'&&!options.interpretation)throw new EngineError('E_MEDIA_POLICY','Explicit metadata validation or overriding interpretation required');
  const probe=await inspectMediaFile(file,undefined,options),stream=probe.streams.find((s:any)=>s.codec_type==='video');if(!stream)throw new EngineError('E_MEDIA_DECODE','No video stream');
  if(!/^yuva?(?:420|422|444)p(?:(?:10|12|16)le)?$/.test(stream.pix_fmt)||stream.color_range!=='tv')throw new EngineError('E_MEDIA_DECODE_FORMAT','This adapter supports tagged limited-range planar YUV, including 10/12-bit; use a separate RGB/full-range adapter');
  let color:ColorEncoding|undefined;
  if(stream.color_primaries==='bt2020'&&stream.color_transfer==='smpte2084'){
    const master=probe.frames?.find((f:any)=>f.media_type==='video')?.side_data_list?.find((d:any)=>d.side_data_type==='Mastering display metadata'),value=master?.max_luminance?.split('/').map(Number),peak=value?.length===2?value[0]/value[1]:undefined;
    color={...linear2020,transfer:'pq',reference:'display',...(Number.isFinite(peak)?{peakNits:peak}:{})};
  }
  if(stream.color_primaries==='bt2020'&&stream.color_transfer==='arib-std-b67'){
    if(!options.interpretation)throw new EngineError('E_MEDIA_COLOR_MISSING','HLG requires explicit peak luminance and system gamma interpretation');color=hlg2020;
  }
  if(stream.color_primaries==='bt709'&&stream.color_transfer==='bt709'){
    if(!options.interpretation)throw new EngineError('E_MEDIA_COLOR_MISSING','SDR video needs an explicit reference-white interpretation');color={...linear709,transfer:'rec709',reference:'display'};
  }
  if(options.interpretation){if(color&&options.metadataPolicy==='validate'&&(color.primaries!==options.interpretation.primaries||color.transfer!==options.interpretation.transfer||color.whitePoint!==options.interpretation.whitePoint))throw new EngineError('E_MEDIA_COLOR_CONFLICT','Requested interpretation conflicts with media tags');color=options.interpretation;}
  if(!color)throw new EngineError('E_MEDIA_COLOR_MISSING','Missing/unknown media color tags require explicit interpretation');
  const expectedMatrix=color.primaries==='rec2020'?'bt2020nc':'bt709';if(options.metadataPolicy==='validate'&&(stream.color_space!==expectedMatrix||stream.color_range!=='tv'))throw new EngineError('E_MEDIA_COLOR_CONFLICT','Current YUV adapter requires tagged limited-range matching matrix; full-range or non-RGB matrix needs an explicit adapter');
  const hasAlpha=/^yuva|^gbrap|^rgba/.test(stream.pix_fmt);if(hasAlpha&&!options.alpha)throw new EngineError('E_MEDIA_ALPHA','Explicit interpretation of video alpha is required');
  return {probe,stream,color,hasAlpha};
}
export async function readMediaVideo(file:string,options:Parameters<typeof inspectMediaVideo>[1]){
  const {probe,stream,color,hasAlpha}=await inspectMediaVideo(file,options);
  const surface=await decodeVideoFloat(file,{color,width:stream.width,height:stream.height,alpha:hasAlpha});
  if(hasAlpha&&options.alpha==='opaque'){const {pixelsFromSurface}=await import('./surface.ts');if(pixelsFromSurface(surface).some((v,i)=>i%4===3&&v!==1))throw new EngineError('E_MEDIA_ALPHA','Decoded alpha contradicts opaque interpretation');surface.alpha='opaque';}
  return {surface,source:{codec:stream.codec_name,pixelFormat:stream.pix_fmt,bitsPerRawSample:stream.bits_per_raw_sample??null,primaries:stream.color_primaries,transfer:stream.color_transfer,matrix:stream.color_space,range:stream.color_range},diagnostics:options.metadataPolicy==='override'?[{code:'W_MEDIA_COLOR_OVERRIDE',message:'Explicit user interpretation replaced source tags'}]:[]};
}
