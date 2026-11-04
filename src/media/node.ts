import sharp from 'sharp';
import type {Surface,Diagnostic,LayerSpec,PortValue} from '../core/types.ts';
import {EngineError} from '../core/errors.ts';
import {isProfessionalSurface,pixelsFromSurface,surfaceFromPixels,srgb,type ProfessionalSurface} from './surface.ts';
import {transformPixels} from './color.ts';
import {assertMediaPolicy,compositeMedia,type MediaPolicy} from './compositor.ts';
import {ocioTransform} from './ocio.ts';
import type {OcioWorker} from './ocio-worker.ts';

export async function expandLegacySurface(s:Surface,policy:MediaPolicy):Promise<ProfessionalSurface>{
  if(policy.legacySdr!=='srgb')throw new EngineError('E_MEDIA_COLOR','Mixed PNG/float composition requires explicit legacySdr: srgb');
  const {data,info}=await sharp(Buffer.from(s.dataUrl.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==s.width||info.height!==s.height)throw new EngineError('E_OUTPUT_SIZE','PNG dimensions mismatch');
  return surfaceFromPixels(s.width,s.height,Float32Array.from(data,v=>v/255),{format:'rgba32float',color:srgb,alpha:'straight'});
}
export async function composeMediaFrame(options:{width:number;height:number;compositionWidth:number;compositionHeight:number;background:string;layers:LayerSpec[];outputs:Record<string,Record<string,PortValue>>;sizes:Record<string,{width:number;height:number}>;frame:number;timing?:(phase:string,durationMs:number)=>void;policy:MediaPolicy;diagnostics:Diagnostic[]}):Promise<ProfessionalSurface>{
  assertMediaPolicy(options.policy);const surfaces:Record<string,ProfessionalSurface>={};
  const needed=new Set(options.layers.flatMap(l=>[l.source,l.mask].filter(Boolean).map(r=>`${r!.$ref}:${r!.port}`)));
  for(const [stage,ports]of Object.entries(options.outputs))for(const [port,value]of Object.entries(ports))if(needed.has(`${stage}:${port}`)){
    if(isProfessionalSurface(value))surfaces[`${stage}:${port}`]=value;
    else if(value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='surface'&&value.format==='png'){
      surfaces[`${stage}:${port}`]=await expandLegacySurface(value as unknown as Surface,options.policy);options.diagnostics.push({code:'I_MEDIA_SDR_EXPANSION',severity:'warning',message:`${stage}.${port} remains 8-bit source data; explicitly expanded from sRGB PNG`,stageId:stage});
    }
  }
  return compositeMedia({...options,surfaces,workingColor:options.policy.workingColor});
}
/** Explicit bounded SDR preview. This is never used as a professional intermediate. */
export async function mediaPreview(s:ProfessionalSurface,policy:MediaPolicy,onDiagnostic?:(diagnostic:Diagnostic)=>void,worker?:OcioWorker):Promise<Buffer>{
  if(!policy.preview)throw new EngineError('E_MEDIA_PREVIEW','Professional pixels require an explicit preview transform; use renderMediaFrame for unquantized output');
  if(policy.preview.ocio)s=(await ocioTransform(s,{...policy.preview.ocio,outputColor:policy.preview.color},worker)).surface;
  const target=policy.preview.color;if(target.primaries!=='rec709'||target.transfer!=='srgb'||target.reference!=='display')throw new EngineError('E_MEDIA_PREVIEW','PNG preview currently requires explicit sRGB display output');
  const converted=transformPixels(pixelsFromSurface(s),s.color,target,s.alpha,policy.preview.clip).pixels,bytes=new Uint8Array(converted.length);let clipped=0;
  for(let i=0;i<converted.length;i+=4){const a=converted[i+3];for(let c=0;c<3;c++){const v=s.alpha==='premultiplied'?a?converted[i+c]/a:0:converted[i+c];if(v<0||v>1){if(!policy.preview.clip)throw new EngineError('E_MEDIA_PREVIEW_RANGE','Out-of-range preview value; request explicit clipping or an OCIO view');clipped++;}bytes[i+c]=Math.round(Math.max(0,Math.min(1,v))*255);}bytes[i+3]=Math.round(a*255);}
  if(clipped)onDiagnostic?.({code:'W_MEDIA_PREVIEW_CLIPPED',severity:'warning',message:'Explicit preview clamp applied; scene-linear intermediates are unchanged',details:{clippedSamples:clipped}});
  return sharp(bytes,{raw:{width:s.width,height:s.height,channels:4}}).png().toBuffer();
}
