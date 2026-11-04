/** Explicit NODE terminal delivery of the existing named GPU-data lease.
 * This is not a Stage/Renderer/owner, and is deliberately not exported by the
 * Stage-safe index. OCIO runs on GPU; only terminal media IO/encoding reads back. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import type {Renderer} from '../../../src/render/renderer.ts';
import type {Diagnostic,Rational} from '../../../src/core/types.ts';
import {EngineError} from '../../../src/core/errors.ts';
import {surfaceFromPixels,assertColor,fromHalf,toHalf,linear709,srgb,type ColorEncoding} from '../../../src/media/surface.ts';
import {writeExr} from '../../../src/media/ocio.ts';
import {mediaPreview} from '../../../src/media/node.ts';
import {ProfessionalVideoEncoder} from '../../../src/media/encoding.ts';
type Ticket=Awaited<ReturnType<Renderer['submitNativeFrame']>>;
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const fail=(id:string,path:string):never=>{throw new EngineError('E_NATIVE_DISPLAY_DATA','Invalid explicitly selected display-linear GPU output',{details:{id,path}});};
export async function readNativeDisplayFrame(renderer:Renderer,ticket:Ticket,id:string,options:{signal?:AbortSignal}={}){options.signal?.throwIfAborted();await ticket.completed;const data=await renderer.exportNativeBuffer(ticket,id,options),info=data.info;
 const m=info.metadata;if(!m||typeof m!=='object'||Array.isArray(m))fail(id,'metadata');const meta=m as Record<string,unknown>;
 if(Object.keys(meta).some(k=>!['kind','schemaVersion','alpha','logicalFormat','color'].includes(k))||meta.kind!=='native-ocio-display-data'||meta.schemaVersion!==1||meta.alpha!=='premultiplied'||!['rgba16float','rgba32float'].includes(String(meta.logicalFormat)))fail(id,'metadata.schema');const color=meta.color as ColorEncoding;assertColor(color);
 if(color.transfer!=='linear'||color.reference!=='display'||info.type!=='f32'||info.components!==4||info.semantic!=='generic'||info.space!=='image'||info.units!=='linear-display-rgb'||info.channels?.join(',')!=='r,g,b,a'||info.dimensions[2]!==1||info.origin.some(x=>x!==0)||info.domain.some((v,j)=>v!==info.dimensions[j])||!(data.values instanceof Float32Array)||data.values.length!==info.dimensions[0]*info.dimensions[1]*4)fail(id,'layout/color');
 for(let j=0;j<data.values.length;j++){const v=data.values[j];if(!Number.isFinite(v)||j%4===3&&(v<0||v>1)||meta.logicalFormat==='rgba16float'&&v!==fromHalf(toHalf(v)))fail(id,'values['+j+']');}
 const surface=surfaceFromPixels(info.dimensions[0],info.dimensions[1],data.values,{format:'rgba32float',color,alpha:'premultiplied',deferBase64:true});return {schemaVersion:1 as const,surface,logicalFormat:meta.logicalFormat as 'rgba16float'|'rgba32float',gpuRgbaSha256:hash(new Uint8Array(data.values.buffer,data.values.byteOffset,data.values.byteLength)),outputId:id};
}
export async function writeNativeDisplayFrame(renderer:Renderer,ticket:Ticket,id:string,options:{output:string;kind:'png'|'exr';clip?:boolean;signal?:AbortSignal}){const frame=await readNativeDisplayFrame(renderer,ticket,id,options),output=resolve(options.output),diagnostics:Diagnostic[]=[];await mkdir(dirname(output),{recursive:true});
 if(options.kind==='exr'){if(options.clip!==undefined)fail(id,'EXR has no clipping option');await writeExr(frame.surface,output,'rgba32float');}
 else if(options.kind==='png'){if(typeof options.clip!=='boolean')fail(id,'explicit PNG clip policy');await writeFile(output,await mediaPreview(frame.surface,{workingColor:linear709,preview:{color:srgb,clip:options.clip===true}},d=>diagnostics.push(d)));}
 else fail(id,'kind');
 return {schemaVersion:1 as const,output,kind:options.kind,width:frame.surface.width,height:frame.surface.height,color:options.kind==='png'?srgb:frame.surface.color,sourceColor:frame.surface.color,alpha:frame.surface.alpha,logicalGpuFormat:frame.logicalFormat,gpuRgbaSha256:frame.gpuRgbaSha256,sha256:hash(await readFile(output)),diagnostics,terminalReadback:true};
}
/** Caller owns the Renderer/session. Frame order/duplicates are explicit, and
 * final encoding reuses PME. This function never starts another scheduler. */
export async function writeNativeDisplayVideo(renderer:Renderer,frames:readonly number[],id:string,options:{output:string;fps:Rational;clip:boolean;matte:readonly[number,number,number];signal?:AbortSignal}){if(!Array.isArray(frames)||!frames.length||Array.from(frames).some(f=>!Number.isSafeInteger(f)||f<0))fail(id,'frames');options.signal?.throwIfAborted();let encoder:ProfessionalVideoEncoder|undefined;const records:object[]=[];try{for(const frame of frames){options.signal?.throwIfAborted();const ticket=await renderer.submitNativeFrame(frame,{signal:options.signal}),value=await readNativeDisplayFrame(renderer,ticket,id,options);encoder??=await ProfessionalVideoEncoder.create(options.output,{preset:'sdr-h264',fps:options.fps,width:value.surface.width,height:value.surface.height,outputColor:srgb,conversion:{kind:'colorimetric',clip:options.clip},alpha:{mode:'flatten',matte:[...options.matte]}});await encoder.write(value.surface);records.push({frame,gpuRgbaSha256:value.gpuRgbaSha256,color:value.surface.color});}const report=await encoder!.finish();encoder=undefined;return {schemaVersion:1 as const,output:resolve(options.output),frames:records,report,policy:'GPU OCIO then explicit terminal readback; PME SDR lossy H.264, flattened Alpha; not HDR/PCM/PNG byte parity'};}finally{await encoder?.abort();}}
