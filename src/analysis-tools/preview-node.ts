import {writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createTrackReader} from '../../modules/graphics-contracts/track.ts';
import {LIMITS} from '../../modules/graphics-contracts/check.ts';
import {artifactBytes,trackData} from './artifacts.ts';
import {AnalysisPaths,inside,toolError} from './paths.ts';
import type {ToolArtifact,AnalysisPreviewOptions} from './types.ts';

const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
/** One fixed overlay, not a general scene renderer. Same query/hold/background semantics as Web Stages. */
export async function previewArtifact(paths:AnalysisPaths,artifact:ToolArtifact,time:number,output:string,query:AnalysisPreviewOptions={}){
  const timings:Record<string,number>={},begin=performance.now(),data=await trackData(artifact),reader=createTrackReader(data),result=reader.query(time,{mode:query.mode,maxGapSeconds:query.maxGapSeconds});timings.trackLoadMs=performance.now()-begin;
  const timestampUs=Math.round(time*1e6);if(timestampUs<data.time.startUs||timestampUs>=data.time.endUs)toolError('E_ANALYSIS_TIME_RANGE','Preview time is outside the analyzed media range');
  const frame=[...data.samples].reverse().find(s=>s.timestampUs<=timestampUs);if(!frame)toolError('E_ANALYSIS_RESOURCE','No captured background frame precedes this time');
  output=await paths.check(output,true);if(extname(output).toLowerCase()!=='.png'||inside(join(paths.root,'.frameweave'),output))toolError('E_ANALYSIS_PATH','Preview output must be a fresh .png outside internal metadata directories');
  const source=await artifactBytes(artifact,frame.frameAsset),width=data.coordinates.width,height=data.coordinates.height;
  if(width*height>LIMITS.pixels)toolError('E_ANALYSIS_PREVIEW_LIMIT','Node overlay is limited to 4194304 pixels');
  let start=performance.now();const metadata=await sharp(source,{limitInputPixels:LIMITS.pixels}).metadata();if(metadata.format!=='png'||(metadata.pages??1)!==1)toolError('E_ANALYSIS_RESOURCE','Captured background must be a single PNG');const decoded=await sharp(source,{limitInputPixels:LIMITS.pixels}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});timings.decodeMs=performance.now()-start;
  if(decoded.info.width!==width||decoded.info.height!==height||decoded.info.channels!==4)toolError('E_ANALYSIS_RESOURCE','Captured PNG dimensions disagree with TrackData');
  let png:Buffer=source;timings.drawMs=0;timings.compositeMs=0;timings.encodeMs=0;
  if(result.valid){
    const x=result.anchor.x*width,y=result.anchor.y*height,lw=164,lx=Math.max(4,Math.min(width-lw-4,x-lw/2)),ly=Math.max(4,Math.min(height-40,y-49)),label='FACE · '+result.trackId.slice('face-segment-'.length);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g stroke="#7affd1" stroke-width="2"><path fill="none" d="M${x},${y} L${lx+lw/2},${ly+30}"/><rect x="${lx}" y="${ly}" width="${lw}" height="30" rx="6" fill="#102a36"/></g><text x="${lx+14}" y="${ly+15}" dominant-baseline="central" fill="#ecfff9" font-family="Arial,sans-serif" font-weight="bold" font-size="14">${xml(label)}</text><circle cx="${x}" cy="${y}" r="4" fill="#7affd1"/></svg>`;
    start=performance.now();const overlay=await sharp(Buffer.from(svg),{limitInputPixels:LIMITS.pixels}).ensureAlpha().raw().toBuffer();timings.drawMs=performance.now()-start;
    const raw={width,height,channels:4 as const};start=performance.now();const composite=await sharp(decoded.data,{raw}).composite([{input:overlay,raw}]).raw().toBuffer();timings.compositeMs=performance.now()-start;
    start=performance.now();png=await sharp(composite,{raw}).png().toBuffer();timings.encodeMs=performance.now()-start;
  }
  await paths.check(output,true);try{await writeFile(output,png,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')toolError('E_ANALYSIS_OUTPUT_EXISTS','Choose a fresh PNG output; analysis preview does not overwrite files');throw e;}
  const sha256=createHash('sha256').update(png).digest('hex');
  return {artifactId:data.cacheKey,sourceTimeSeconds:time,timestampUs,backgroundTimestampUs:frame.timestampUs,backgroundPolicy:'hold-previous-analysis-frame',backend:{id:'node-sharp-svg',sharp:sharp.versions.sharp,librsvg:sharp.versions.rsvg,font:'Arial,sans-serif',pixelCompatibility:'same-backend-and-environment-only'},observation:result.valid?(result.interpolated?'interpolated':'observed'):'missing',result,output:{path:output,uri:pathToFileURL(output).href,reference:{resourceId:'analysisPreview',kind:'image',sha256,bytes:png.length},format:'image/png',width,height},timings,diagnostics:[]};
}
