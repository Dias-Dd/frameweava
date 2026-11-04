import {fields,integer} from './block.ts';

/** Operator policy, never a ceiling on total source duration/size. */
export interface AudioResourceOptions {
  maxRequestBytes?:number;maxCacheBytes?:number;maxLegacyBytes?:number;
  maxOpenSources?:number;maxProbeBytes?:number;decoderTimeoutMs?:number;
  ffmpeg?:string;ffprobe?:string;
}
type ResolvedAudioResourceOptions=Required<Omit<AudioResourceOptions,'ffmpeg'|'ffprobe'>>&Pick<AudioResourceOptions,'ffmpeg'|'ffprobe'>;
export function audioResourceOptions(options:AudioResourceOptions={}):ResolvedAudioResourceOptions {
  fields(options,['maxRequestBytes','maxCacheBytes','maxLegacyBytes','maxOpenSources','maxProbeBytes','decoderTimeoutMs','ffmpeg','ffprobe'],'audioResources');
  for(const [key,value]of Object.entries(options))if(value!==undefined){
    if(key==='ffmpeg'||key==='ffprobe'){if(typeof value!=='string'||!value.trim())throw new TypeError(`audioResources.${key}: expected an executable path`);}
    else integer(value,`audioResources.${key}`,key==='maxCacheBytes'?0:1);
  }
  return {maxRequestBytes:16*1024**2,maxCacheBytes:64*1024**2,maxLegacyBytes:32*1024**2,
    maxOpenSources:8,maxProbeBytes:256*1024,decoderTimeoutMs:30000,...Object.fromEntries(Object.entries(options).filter(([,v])=>v!==undefined))};
}
