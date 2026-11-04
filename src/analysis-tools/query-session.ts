import {createTrackReader,type TrackData,type TrackReader} from '../../modules/graphics-contracts/track.ts';
import {analysisHash} from '../analysis/artifact.ts';
import {artifactBytes,trackData} from './artifacts.ts';
import {toolError} from './paths.ts';
import type {ToolArtifact} from './types.ts';

type Entry={data:TrackData;reader:TrackReader;bytes:number};
/** Parser/Reader memoization, never an Artifact authentication cache. Private to one service/root. */
export class AnalysisQuerySession {
  private entries=new Map<string,Entry>();private bytes=0;private epoch=0;private closed=false;
  readonly maxEntries=4;readonly maxBytes=2*1024*1024;
  hits=0;misses=0;
  async track(artifact:ToolArtifact):Promise<Entry>{
    try{return await this.load(artifact);}catch(error){this.clear();throw error;}
  }
  private async load(artifact:ToolArtifact):Promise<Entry>{
    if(this.closed)toolError('E_ANALYSIS_SERVICE_CLOSED','Query session is closed');
    const epoch=this.epoch,path=artifact.manifest.output?.trackFile;
    if(typeof path!=='string')toolError('E_ANALYSIS_QUERY_UNSUPPORTED','This Artifact has no registered TrackData output');
    // Caller has just run the complete C3 validation. Re-authenticate used JSON bytes as well;
    // cached parsed objects never grant trust to a new path, stat tuple or file replacement.
    const bytes=await artifactBytes(artifact,path),key=artifact.directory+'\0'+analysisHash(artifact.manifest);
    if(this.closed)toolError('E_ANALYSIS_SERVICE_CLOSED','Query session closed during loading');
    const found=this.entries.get(key);
    if(found){this.hits++;this.entries.delete(key);this.entries.set(key,found);return found;}
    this.misses++;const data=await trackData(artifact,bytes),entry={data,reader:createTrackReader(data),bytes:bytes.byteLength};
    if(this.closed)toolError('E_ANALYSIS_SERVICE_CLOSED','Query session closed during parsing');
    if(epoch===this.epoch&&entry.bytes<=this.maxBytes){
      const old=this.entries.get(key);if(old)this.bytes-=old.bytes;
      this.entries.delete(key);this.entries.set(key,entry);this.bytes+=entry.bytes;
      while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.bytes;this.entries.delete(first);}
    }
    return entry;
  }
  clear(){this.epoch++;this.entries.clear();this.bytes=0;}
  close(){this.closed=true;this.clear();}
  status(){return {entries:this.entries.size,serializedBytes:this.bytes,maxEntries:this.maxEntries,maxSerializedBytes:this.maxBytes,hits:this.hits,misses:this.misses,authentication:'full-c3-every-call' as const};}
}
