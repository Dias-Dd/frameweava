import sharp from 'sharp';
import {resolve,join} from 'node:path';
import type {CompareOptions,PixelTolerance,PixelComparison,ComparisonReport,ImageReference,InspectionPolicy} from './types.ts';
import {LIMITS,finite,fail,plain,freshDirectory,issues,suggestions,saveJson,boundedFile} from './common.ts';
import {loadInspection,readInspectionImage,writeImage} from './images.ts';

function tolerance(input:CompareOptions):PixelTolerance {
  for(const key of ['allowLossy','allowPolicyDifference'] as const)if(input[key]!==undefined&&typeof input[key]!=='boolean')fail('E_ARGUMENT',`${key} must be boolean`);
  if(input.tolerance!==undefined&&(!plain(input.tolerance)||Object.keys(input.tolerance).some(k=>!['maxChannelDifference','mae','maxAlphaDifference'].includes(k))))fail('E_ARGUMENT','Unknown or invalid pixel tolerance');
  return {maxChannelDifference:finite(input.tolerance?.maxChannelDifference??0,'maxChannelDifference',0,255,true),mae:finite(input.tolerance?.mae??0,'mae',0,255),maxAlphaDifference:finite(input.tolerance?.maxAlphaDifference??0,'maxAlphaDifference',0,255,true)};
}
async function decode(bytes:Buffer){
  if(bytes.length>LIMITS.imageBytes)fail('E_INSPECTION_LIMIT','Comparison image byte limit exceeded');
  try{
    const metadata=await sharp(bytes,{limitInputPixels:LIMITS.pixels}).metadata();
    if(metadata.format!=='png'&&metadata.format!=='jpeg')fail('E_COMPARE_MEDIA','Only PNG/JPEG still images are supported. Use the existing probe command for MP4 and explicitly decode a still before comparison.');
    const raw=await sharp(bytes,{limitInputPixels:LIMITS.pixels}).rotate().toColourspace('srgb').ensureAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
    return {data:raw.data,width:raw.info.width,height:raw.info.height,format:metadata.format};
  }catch(e){if(e&&typeof e==='object'&&'code' in e&&typeof e.code==='string'&&e.code.startsWith('E_'))throw e;fail('E_COMPARE_MEDIA','Cannot decode a supported PNG/JPEG still image; MP4/JPEG bytes are not PNG byte baselines.');}
}
function flatten(data:Buffer,white:boolean):Buffer {
  const out=Buffer.alloc(data.length);for(let i=0;i<data.length;i+=4){for(let c=0;c<3;c++)out[i+c]=Math.round(data[i+c]*data[i+3]/255+(white?255:0)*(1-data[i+3]/255));out[i+3]=255;}return out;
}
/** Compare decoded sRGB RGBA8, never compressed bytes. No implicit resize or lossy-video equality. */
export async function compareImageBuffers(beforeBytes:Buffer,afterBytes:Buffer,options:CompareOptions={}){
  const tol=tolerance(options),a=await decode(beforeBytes),b=await decode(afterBytes),lossy=a.format==='jpeg'||b.format==='jpeg';
  if(lossy&&(!options.allowLossy||!options.tolerance||!Object.keys(options.tolerance).length))fail('E_COMPARE_MEDIA','JPEG comparison requires allowLossy and an explicit tolerance; compressed byte equality is not a visual test.');
  const report:PixelComparison={schemaVersion:1,kind:'frameweave.image-comparison',ok:false,status:'dimension-mismatch',dimensions:{before:{width:a.width,height:a.height},after:{width:b.width,height:b.height}},sourceFormats:{before:a.format,after:b.format},strategy:lossy?'lossy-decoded-rgba8-srgb':'decoded-rgba8-srgb',tolerance:tol};
  const png=(data:Buffer,w:number,h:number)=>sharp(data,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
  const ab=flatten(a.data,false),aw=flatten(a.data,true),bb=flatten(b.data,false),bw=flatten(b.data,true);
  const previews={beforeBlack:await png(ab,a.width,a.height),beforeWhite:await png(aw,a.width,a.height),afterBlack:await png(bb,b.width,b.height),afterWhite:await png(bw,b.width,b.height)};
  if(a.width!==b.width||a.height!==b.height)return {report,previews};
  const heat=Buffer.alloc(a.data.length);let changed=0,outside=0,max=0,sum=0,alphaChanged=0,alphaMax=0,alphaSum=0,blackMax=0,blackSum=0,whiteMax=0,whiteSum=0;
  for(let i=0;i<a.data.length;i+=4){let pixelMax=0;
    for(let c=0;c<4;c++){const d=Math.abs(a.data[i+c]-b.data[i+c]);pixelMax=Math.max(pixelMax,d);max=Math.max(max,d);sum+=d;if(c===3){if(d)alphaChanged++;alphaMax=Math.max(alphaMax,d);alphaSum+=d;}}
    if(pixelMax)changed++;if(pixelMax>tol.maxChannelDifference)outside++;
    for(let c=0;c<3;c++){const db=Math.abs(ab[i+c]-bb[i+c]),dw=Math.abs(aw[i+c]-bw[i+c]);blackMax=Math.max(blackMax,db);blackSum+=db;whiteMax=Math.max(whiteMax,dw);whiteSum+=dw;}
    heat[i]=pixelMax;heat[i+1]=0;heat[i+2]=Math.abs(a.data[i+3]-b.data[i+3]);heat[i+3]=255;
  }
  const count=a.width*a.height,mae=sum/(count*4);
  report.metrics={exact:changed===0,changedPixels:changed,outsideTolerancePixels:outside,maxChannelDifference:max,mae,alpha:{changedPixels:alphaChanged,maxDifference:alphaMax,mae:alphaSum/count},black:{maxDifference:blackMax,mae:blackSum/(count*3)},white:{maxDifference:whiteMax,mae:whiteSum/(count*3)}};
  report.ok=max<=tol.maxChannelDifference&&mae<=tol.mae&&alphaMax<=tol.maxAlphaDifference;report.status=report.ok?'match':'different';
  return {report,previews,heatmap:await png(heat,a.width,a.height)};
}
export async function compareImageFiles(before:string,after:string,options:CompareOptions={}){
  const directory=await freshDirectory(options.output),result=await compareImageBuffers(await boundedFile(resolve(before),LIMITS.imageBytes),await boundedFile(resolve(after),LIMITS.imageBytes),options),images:ImageReference[]=[];
  if(result.heatmap)images.push(await writeImage(directory,'difference',result.heatmap));
  for(const [key,bytes]of Object.entries(result.previews))images.push(await writeImage(directory,key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),bytes));
  const report={...result.report,images,reportFile:join(directory,'image-comparison.json')};await saveJson(report.reportFile,report);
  // Also publish the standard image allowlist for the same safe delivery API.
  await saveJson(join(directory,'inspection.json'),{schemaVersion:1,kind:'frameweave.inspection-comparison',images});return report;
}
function policyKey(p:InspectionPolicy|undefined):string{return JSON.stringify(p&&{mode:p.mode,gpuPolicy:p.gpuPolicy,allowWasm:p.allowWasm,media:p.media,environment:p.environment});}
function frameMap(frames:Awaited<ReturnType<typeof loadInspection>>['frames']){
  const counts=new Map<string,number>();return new Map(frames.map(f=>{const base=JSON.stringify([f.frame,f.stageId??null]),n=counts.get(base)??0;counts.set(base,n+1);return [`${base}:${n}`,f] as const;}));
}
export async function compareInspections(before:string,after:string,options:CompareOptions={}):Promise<ComparisonReport>{
  const report:ComparisonReport={schemaVersion:1,kind:'frameweave.inspection-comparison',ok:false,status:'invalid',before:resolve(before),after:resolve(after),diagnostics:[],suggestedActions:[],pairs:[],images:[],anomalies:[],reportFile:''};let directory:string|undefined;
  try{
    tolerance(options);directory=await freshDirectory(options.output);report.reportFile=join(directory,'inspection.json');
    const a=await loadInspection(before),b=await loadInspection(after);if(a.kind!=='frameweave.render-inspection'||b.kind!=='frameweave.render-inspection')fail('E_INSPECTION_REPORT','Compare requires two render inspections');
    const policiesDiffer=policyKey(a.policy)!==policyKey(b.policy),auto=a.policy?.gpuPolicy==='auto'||b.policy?.gpuPolicy==='auto';
    const explicitTolerance=options.tolerance&&Object.values(options.tolerance).some(v=>v!==undefined);
    const review=policiesDiffer?!options.allowPolicyDifference||!explicitTolerance:auto&&!explicitTolerance;
    if(review)report.diagnostics.push({code:'W_COMPARE_POLICY',severity:'warning',source:'comparison',message:'Execution policies differ or use GPU auto without an explicit tolerance. Metrics are available; this is a review candidate, not a severity judgment.'});
    const amap=frameMap(a.frames),bmap=frameMap(b.frames),keys=[...new Set([...amap.keys(),...bmap.keys()])];
    if(!keys.length)fail('E_COMPARE_EMPTY','No requested frames exist in either report');
    for(const [index,key]of keys.entries()){
      const fa=amap.get(key),fb=bmap.get(key),frame=fa?.frame??fb!.frame;
      if(!fa||!fb||!fa.image||!fb.image){
        report.pairs.push({key,frame,status:!fa?'missing-before':!fb?'missing-after':'render-failed',images:[]});
        const recovered=fa&&!fa.ok&&fb?.ok;report.anomalies.push({frame,code:recovered?'W_FRAME_RECOVERED':'W_COMPARE_MISSING_FRAME',reason:recovered?'Baseline frame failed and the new frame rendered; no baseline pixels exist for a visual diff.':'A requested frame or baseline image is missing.'});continue;
      }
      let beforeBytes:Buffer,afterBytes:Buffer;
      try{beforeBytes=(await readInspectionImage(before,fa.image.id)).bytes;afterBytes=(await readInspectionImage(after,fb.image.id)).bytes;}
      catch(e){const diagnostics=issues(e,'comparison').map(d=>({...d,frame}));report.diagnostics.push(...diagnostics);report.pairs.push({key,frame,status:'render-failed',images:[]});report.anomalies.push({frame,code:diagnostics[0]?.code??'E_INSPECTION_IMAGE',reason:'A declared frame image is missing, changed, or outside its allowed directory.'});continue;}
      const result=await compareImageBuffers(beforeBytes,afterBytes,options),images:ImageReference[]=[];
      if(result.heatmap)images.push(await writeImage(directory,`pair-${index}-difference`,result.heatmap));
      for(const [name,bytes]of Object.entries(result.previews))images.push(await writeImage(directory,`pair-${index}-${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}`,bytes));
      report.images.push(...images);report.pairs.push({key,frame,status:'compared',comparison:result.report,images});
      if(!result.report.ok)report.anomalies.push({frame,code:result.report.status==='dimension-mismatch'?'W_COMPARE_SIZE':'W_COMPARE_DIFFERENCE',reason:'Frame dimensions or decoded pixels exceed the supplied tolerance; inspect the diff and alpha previews.'});
    }
    const matches=report.pairs.every(p=>p.comparison?.ok),invalid=report.diagnostics.some(d=>d.severity==='error');report.status=invalid?'invalid':review?'needs-review':matches?'match':'different';report.ok=!invalid&&!review&&matches;
  }catch(e){report.diagnostics.push(...issues(e,'comparison'));}
  report.suggestedActions=suggestions(report.diagnostics);if(directory)await saveJson(join(directory,'inspection.json'),report);return report;
}
