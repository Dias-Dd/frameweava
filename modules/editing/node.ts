/** Explicit Node-side media inspection. Keep this entry out of Native Stage bundles. */
import {resolve} from 'node:path';
import {inspectMediaVideo} from '../../src/media/input.ts';
import {video,sdrVideo709} from './authoring.ts';
import type {VideoAsset} from './types.ts';
import type {ColorEncoding} from '../../src/media/surface.ts';
import {readWavFile} from '../../src/audio/io.ts';
import {EngineError} from '../../src/core/errors.ts';
import {audioSource,audioSourceInfo,type EditAudioInfo,type EditAudioSourceOptions} from './audio.ts';
import type {EditAudioResourceInspector} from './audio-resource.ts';
export {prepareTitle,prepareSubtitles,type TextPreparationOptions,type CaptionStyle,type CaptionPreparationServices,type CaptionParagraphProvider} from './text-node.ts';
export {analyzeEditSource,readEditCues,verifyCueSource,type EditAnalysisParameters,type EditAnalysisOutput} from './analysis-node.ts';
/** The caller explicitly authorizes inspection of this local path. Rendering still declares and seals the Resource. */
export async function inspectFootage(id:string,src:string,options:{baseDirectory?:string;decoder?:VideoAsset['decoder'];interpretation?:ColorEncoding;metadataPolicy?:VideoAsset['metadataPolicy'];signal?:AbortSignal}={}){
 const file=resolve(options.baseDirectory??'.',src),result=await inspectMediaVideo(file,{interpretation:options.interpretation??sdrVideo709,metadataPolicy:options.metadataPolicy??'validate',signal:options.signal});
 return {asset:video(id,src,{width:result.stream.width,height:result.stream.height,decoder:options.decoder,interpretation:result.color,metadataPolicy:options.metadataPolicy}),stream:result.stream,probe:result.probe};
}
/** Explicit trusted Node preparation using the existing WAV inspector. No conversion or permission change. */
export async function inspectAudioSource(id:string,src:string,options:{baseDirectory?:string;signal?:AbortSignal}={}):Promise<EditAudioInfo>{
 const cancel=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio inspection cancelled');};cancel();
 const {info}=await readWavFile(resolve(options.baseDirectory??'.',src));cancel();
 if(info.layout!=='mono'&&info.layout!=='stereo')throw new EngineError('E_EDIT_AUDIO','Editing source profile requires mono/stereo; convert the source explicitly');
 return {id,src,sampleRate:info.sampleRate,layout:info.layout,sampleCount:info.sampleCount};
}
/** Borrow Core's genuine sealed AudioResourceReader. The caller closes it.
 * Exact WAV lengths are converted to complete output samples; compressed sources
 * need an explicit authored sampleCount, then each read verifies real coverage. */
export async function inspectAudioResource(reader:EditAudioResourceInspector,id:string,src:string,options:Partial<EditAudioSourceOptions>={}):Promise<EditAudioInfo>{
 const stream=options.stream??0,actual=await reader.info(id,stream),conversion=options.conversion??{sampleRate:'reject',layout:'reject'},sampleRate=options.sampleRate??actual.sampleRate,layout=options.layout??actual.layout;
 if(actual.resourceId!==id||actual.stream!==stream||!Number.isSafeInteger(actual.sampleRate)||actual.sampleRate<=0)throw new EngineError('E_EDIT_AUDIO_METADATA','Resource metadata does not identify the requested audio stream');
 if(conversion.sampleRate==='reject'&&sampleRate!==actual.sampleRate||conversion.layout==='reject'&&layout!==actual.layout)throw new EngineError('E_EDIT_AUDIO_METADATA','Choose explicit sample-rate/layout conversion for this source');
 if(sampleRate!==48000&&sampleRate!==96000||layout!=='mono'&&layout!=='stereo')throw new EngineError('E_EDIT_AUDIO','Choose a supported 48/96 kHz mono/stereo output profile and explicit conversion');
 const known=actual.sampleCount===undefined?undefined:Number(BigInt(actual.sampleCount)*BigInt(sampleRate)/BigInt(actual.sampleRate));
 if(known!==undefined&&options.sampleCount!==undefined&&options.sampleCount!==known)throw new EngineError('E_EDIT_AUDIO_METADATA','Declared sampleCount differs from exact source duration');
 const sampleCount=options.sampleCount??known;if(sampleCount===undefined)throw new EngineError('E_EDIT_AUDIO_METADATA','Compressed/container metadata has no exact decoded length: declare sampleCount for the intended source view; real interval reads validate coverage');
 return audioSourceInfo(audioSource(id,src,{sampleRate,layout,sampleCount,stream,conversion}));
}
