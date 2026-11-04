import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTrackReader,validateTrackData,type TrackData} from '../../modules/graphics-contracts/track.ts';
import {readJsonResource,verifyResource} from '../../modules/graphics-contracts/resources.ts';
import type {ResourceReference} from '../../modules/graphics-contracts/types.ts';
import {brightnessTask} from '../../examples/analysis/brightness-task.ts';
import {analysisHash} from '../analysis/artifact.ts';
import {toolError} from './paths.ts';
import type {ToolArtifact,AnalysisQuery} from './types.ts';

const trackFormat='application/vnd.frameweave.track+json;version=1';
export function resource(artifact:ToolArtifact,path:string,resourceId='result') {
  const file=artifact.manifest.files.find(f=>f.path===path);if(!file)toolError('E_ANALYSIS_RESOURCE','Result file is not declared in its validated Artifact');
  const absolute=join(artifact.directory,file.path),reference:ResourceReference={resourceId,kind:file.format.startsWith('image/')?'image':'file',sha256:file.sha256,bytes:file.bytes};
  return {reference,path:absolute,uri:pathToFileURL(absolute).href,format:file.format};
}
export async function artifactBytes(artifact:ToolArtifact,path:string) {const r=resource(artifact,path);const bytes=await readFile(r.path);await verifyResource(r.reference,bytes);return bytes;}
export async function trackData(artifact:ToolArtifact,bytes?:Uint8Array):Promise<TrackData> {
  const path=artifact.manifest.output?.trackFile;
  if(typeof path!=='string'||!artifact.manifest.files.some(f=>f.path===path&&f.format===trackFormat))toolError('E_ANALYSIS_QUERY_UNSUPPORTED','This Artifact has no registered TrackData output');
  const r=resource(artifact,path,'trackFile'),data=await readJsonResource(r.reference,bytes??await readFile(r.path),validateTrackData),m=artifact.manifest;
  const input=m.identity.inputs.find(i=>i.id==='video'),model=m.identity.models[0],time=m.identity.time;
  if(data.cacheKey!==m.cacheKey||data.media.sha256!==input?.sha256||data.media.bytes!==input?.bytes||data.model.sha256!==model?.integrity||data.model.id!==model?.id||data.model.version!==model?.version||data.algorithm.id!==m.identity.algorithm.id||data.algorithm.implementationSha256!==m.identity.algorithm.integrity||data.algorithm.runtimeSha256!==m.identity.runtime.integrity||data.algorithm.packageVersion!==m.identity.runtime.version||analysisHash(data.config)!==m.identity.parametersHash||!time||typeof time!=='object'||Array.isArray(time)||data.time.startUs!==time.startUs||data.time.endUs!==time.endUs||data.time.unit!==time.unit||data.time.origin!==time.origin)toolError('E_ANALYSIS_ARTIFACT','TrackData identity disagrees with its containing Artifact');
  for(const s of data.samples)if(!m.files.some(f=>f.path===s.frameAsset&&f.sha256===s.frameSha256&&f.format==='image/png'))toolError('E_ANALYSIS_ARTIFACT','Track frame reference disagrees with its Artifact');
  return data;
}
export function range(data:TrackData,q:AnalysisQuery) {
  const from=q.from??data.time.startUs/1e6,to=q.to??data.time.endUs/1e6;
  if(!Number.isFinite(from)||!Number.isFinite(to)||!Number.isSafeInteger(Math.round(from*1e6))||!Number.isSafeInteger(Math.round(to*1e6))||to<=from)toolError('E_ARGUMENT','Range needs finite source-media from < to within safe microseconds');
  return {fromUs:Math.round(from*1e6),toUs:Math.round(to*1e6),samples:data.samples.filter(s=>s.timestampUs>=Math.round(from*1e6)&&s.timestampUs<Math.round(to*1e6))};
}
export async function inspectArtifact(artifact:ToolArtifact,query:AnalysisQuery={}) {
  const m=artifact.manifest;
  const base={artifactId:m.cacheKey,artifactVersion:m.schemaVersion,integrity:{verified:true,filesVerified:m.files.length},createdAt:m.createdAt,inputIdentity:m.identity.inputs,algorithm:m.identity.algorithm,models:m.identity.models,runtime:m.identity.runtime,parametersHash:m.identity.parametersHash};
  if(m.identity.algorithm.id==='mediapipe.FaceLandmarker'){
    const data=await trackData(artifact),selection=range(data,query),valid=selection.samples.filter(s=>s.valid);
    return {...base,taskType:'frameweave.analysis.face-tracking',artifactType:data.schemaVersion,time:data.time,coordinates:data.coordinates,selectedRange:{fromUs:selection.fromUs,toUs:selection.toUs},summary:{sampleCount:selection.samples.length,validSamples:valid.length,missingSamples:selection.samples.length-valid.length,visibleSegments:new Set(valid.map(s=>s.trackId)).size},availableOperations:['inspect','sample','sampleBatch','preview'],resources:[resource(artifact,m.output.trackFile,'trackFile')],resourceCount:m.files.length,limitations:['segment-id-is-not-person-identity','confidence-is-unavailable-null','no-extrapolation-or-gap-bridging','preview-background-is-held-analysis-frame']};
  }
  if(m.identity.algorithm.id==='frameweave.image-luma-histogram'){
    if(query.from!==undefined||query.to!==undefined)toolError('E_ANALYSIS_QUERY_UNSUPPORTED','A still image has no media time range');
    const file=m.files.find(f=>f.format==='application/vnd.frameweave.brightness+json;version=1');if(!file)toolError('E_ANALYSIS_ARTIFACT','Brightness output file is missing');
    const data=JSON.parse(new TextDecoder().decode(await artifactBytes(artifact,file.path)));brightnessTask.validateOutput(data);
    return {...base,taskType:'frameweave.analysis.image-brightness',artifactType:file.format,summary:{pixels:data.pixels,width:data.width,height:data.height,meanLuma:data.meanLuma,minimum:data.minimum,maximum:data.maximum},availableOperations:['inspect'],resources:[resource(artifact,file.path,'brightnessFile')],resourceCount:m.files.length,limitations:['encoded-rgb-not-scene-linear','no-time-query-or-preview-adapter-registered']};
  }
  return {...base,taskType:'unregistered-analysis',artifactType:m.kind,summary:{fileCount:m.files.length,totalBytes:m.files.reduce((a,f)=>a+f.bytes,0)},availableOperations:['inspect'],resources:m.files.slice(0,8).map((f,i)=>resource(artifact,f.path,`file${i}`)),resourceCount:m.files.length,limitations:['no-professional-reader-registered','resources-truncated-to-eight']};
}
export async function sampleArtifact(artifact:ToolArtifact,query:AnalysisQuery,loaded?:{data:TrackData;reader:ReturnType<typeof createTrackReader>}) {
  const data=loaded?.data??await trackData(artifact),reader=loaded?.reader??createTrackReader(data);
  const options={...(query.mode!==undefined?{mode:query.mode}:{}),...(query.maxGapSeconds!==undefined?{maxGapSeconds:query.maxGapSeconds}:{})};
  // Validate options through the official Reader even for an empty result page.
  reader.query(data.time.startUs/1e6,options);
  const point=(seconds:number)=>{const result=reader.query(seconds,options);return {sourceTimeSeconds:seconds,timestampUs:Math.round(seconds*1e6),observation:result.valid?(result.interpolated?'interpolated':'observed'):'missing',result};};
  if(query.time!==undefined){if(query.from!==undefined||query.to!==undefined||query.limit!==undefined||query.offset!==undefined)toolError('E_ARGUMENT','Choose one time or an observed-sample range');return {artifactId:data.cacheKey,artifactType:data.schemaVersion,...point(query.time),queryRule:{mode:query.mode??'linear',maxGapSeconds:query.maxGapSeconds??2/data.config.sampleRate},diagnostics:[]};}
  if(query.from===undefined||query.to===undefined)toolError('E_ARGUMENT','sample needs --time or both --from and --to');
  const limit=query.limit??16,offset=query.offset??0;if(!Number.isSafeInteger(limit)||limit<1||limit>128||!Number.isSafeInteger(offset)||offset<0||offset>600)toolError('E_ARGUMENT','Use limit 1..128 and offset 0..600');
  const selected=range(data,query);return {artifactId:data.cacheKey,artifactType:data.schemaVersion,range:{fromUs:selected.fromUs,toUs:selected.toUs,endExclusive:true},totalMatches:selected.samples.length,offset,limit,truncated:offset+limit<selected.samples.length,records:selected.samples.slice(offset,offset+limit).map(s=>point(s.timestampUs/1e6)),diagnostics:[]};
}
