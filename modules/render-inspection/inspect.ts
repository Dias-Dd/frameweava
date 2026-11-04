import {runtimeCachePath} from '../../src/runtime/paths.ts';
import {mkdir,mkdtemp,readFile,stat} from 'node:fs/promises';
import {join,resolve,dirname,extname} from 'node:path';
import sharp from 'sharp';
import type {OverlayOptions} from 'sharp';
import {buildProject,engineRoot} from '../../src/compiler/build.ts';
import {Renderer,type RendererOptions} from '../../src/render/renderer.ts';
import type {PerformanceSink} from '../../src/render/performance.ts';
import {stageDependencies,assertValidTVG} from '../../src/core/graph.ts';
import {installedPackages} from '../../src/packages/manager.ts';
import {packageRef} from '../../src/packages/manifest.ts';
import {engineVersion,runtimePin} from '../../src/compiler/runtime-lock.ts';
import {hashAnalysisFile} from '../../src/analysis/artifact.ts';
import type {BuiltProject,TVG} from '../../src/core/types.ts';
import {assertMediaPolicy} from '../../src/media/compositor.ts';
import {assertSharedExecution} from '../shared-state/execution-host.ts';
import type {InspectOptions,InspectionReport,InspectionDiagnostic,ProjectSummary} from './types.ts';
import {LIMITS,finite,fail,freshDirectory,hash,issues,suggestions,sourcePath,saveJson} from './common.ts';
import {writeImage} from './images.ts';

const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function validateRequest(o:InspectOptions){
  if(!o||typeof o.project!=='string'||!o.project)fail('E_ARGUMENT','A project entry is required');
  if(o.media)assertMediaPolicy(o.media);
  if(o.frames!==undefined&&o.times!==undefined)fail('E_ARGUMENT','Choose frames or times, not both');
  for(const key of ['cache','allowWasm','storyboard'] as const)if(o[key]!==undefined&&typeof o[key]!=='boolean')fail('E_ARGUMENT',`${key} must be boolean`);
  if(o.mode!==undefined&&o.mode!=='accurate'&&o.mode!=='preview')fail('E_ARGUMENT','mode must be accurate or preview');
  for(const key of ['output','executablePath'] as const)if(o[key]!==undefined&&(typeof o[key]!=='string'||!o[key]))fail('E_ARGUMENT',`${key} must be nonempty text`);
  for(const key of ['width','height'] as const)if(o[key]!==undefined)finite(o[key],key,1,16384,true);
  if(o.timeoutMs!==undefined)finite(o.timeoutMs,'timeoutMs',1,120000,true);
  if(o.stageId!==undefined&&(typeof o.stageId!=='string'||!o.stageId))fail('E_ARGUMENT','stageId must be nonempty');
  const values=o.frames??o.times;
  if(values!==undefined){if(!Array.isArray(values)||values.length<1||values.length>LIMITS.frames)fail('E_ARGUMENT',`Supply 1–${LIMITS.frames} frames/times`);for(const v of values)finite(v,'frame/time',0,Number.MAX_SAFE_INTEGER,o.frames!==undefined);}
}
async function summary(build:BuiltProject,project:string,modules:ProjectSummary['modules'],capabilities:ProjectSummary['requirements']):Promise<ProjectSummary>{
  const graph:{files:string[];manifest:TVG}=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8')),t=build.manifest,c=t.composition;
  const resources:ProjectSummary['resources']=[];
  for(const r of t.resources.slice(0,LIMITS.summaryEntries)){
    const file=build.assets[r.src]??join(build.dir,r.src),integrity=await hashAnalysisFile(file),original=graph.manifest.resources.find(x=>x.id===r.id);
    resources.push({id:r.id,kind:r.kind,source:original?sourcePath(project,original.src):'[declared module resource]',...integrity});
  }
  const requirements=[...capabilities];
  if(t.resources.some(r=>extname(r.src)==='.wasm'))requirements.push({capability:'wasm',evidence:'Declared .wasm resource; execution use is not inferred',certainty:'possible'});
  if(graph.files.some(p=>p.replaceAll('\\','/').includes('/modules/gpu-effects/')))requirements.push({capability:'stage-local-gpu-helper',evidence:'GPU helper source import; its runtime backend/fallback is selected by the module',certainty:'possible'});
  const pluginReferences=[...new Set(t.stages.flatMap(s=>{
    const m=s.props.pluginMeta;if(!m||typeof m!=='object'||Array.isArray(m))return [];
    return Object.keys(m);
  }).concat(graph.manifest.stages.flatMap(s=>Array.isArray(s.props.pluginPipeline)?s.props.pluginPipeline.flatMap((v:unknown)=>v&&typeof v==='object'&&'plugin' in v&&typeof v.plugin==='string'?[v.plugin]:[]):[])))];
  return {hash:build.hash,tvgSchemaVersion:t.schemaVersion,composition:{id:c.id,width:c.width,height:c.height,fps:c.fps,durationInFrames:c.durationInFrames},stageCount:t.stages.length,
    stages:t.stages.slice(0,LIMITS.summaryEntries).map(s=>({id:s.id,engine:s.engine,dependencies:stageDependencies(s),outputs:s.outputs,...(graph.manifest.stages.find(x=>x.id===s.id)?.entry?{entry:graph.manifest.stages.find(x=>x.id===s.id)!.entry}:{})})),
    sourceFileCount:graph.files.length,resourceCount:t.resources.length,resources,modules:modules.slice(0,LIMITS.summaryEntries),pluginReferences:pluginReferences.slice(0,LIMITS.summaryEntries),requirements,
    omitted:{stages:Math.max(0,t.stages.length-LIMITS.summaryEntries),resources:Math.max(0,t.resources.length-LIMITS.summaryEntries),modules:Math.max(0,modules.length-LIMITS.summaryEntries),plugins:Math.max(0,pluginReferences.length-LIMITS.summaryEntries)}};
}
async function storyboard(directory:string,report:InspectionReport){
  const frames=report.frames.filter(f=>f.image);if(!frames.length)return;
  const width=Math.min(320,frames[0].image!.width),height=Math.max(1,Math.round(width*frames[0].image!.height/frames[0].image!.width)),cols=Math.min(3,frames.length),rows=Math.ceil(frames.length/cols),w=cols*(width+12)+12,h=rows*(height+30)+42;
  if(w*h>LIMITS.pixels)fail('E_INSPECTION_LIMIT','Storyboard pixel budget exceeded; choose smaller frames');
  const overlays:OverlayOptions[]=[],labels:string[]=[];
  for(let i=0;i<frames.length;i++){
    const f=frames[i],x=12+(i%cols)*(width+12),y=36+Math.floor(i/cols)*(height+30);
    const bytes=await readFile(join(directory,f.image!.file));if(hash(bytes)!==f.image!.sha256)fail('E_INSPECTION_INTEGRITY','Generated storyboard input changed');
    overlays.push({input:await sharp(bytes).resize(width,height).png().toBuffer(),left:x,top:y});
    labels.push(`<text x="${x}" y="${y+height+19}" fill="#d8e9f0" font-size="12">#${f.index} · frame ${f.frame} · ${f.time.toFixed(3)}s</text>`);
  }
  const svg=Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101d2a"/><g font-family="sans-serif"><text x="12" y="23" fill="white" font-size="15">${xml(report.summary?.composition.id??'Inspection')} / actual PNG frames</text>${labels.join('')}</g></svg>`);
  const image=await writeImage(directory,'storyboard',await sharp(svg).composite(overlays).png().toBuffer());report.images.push(image);report.storyboard=image;
}
/** Shared CLI/MCP service. Compiles trusted local project code through the existing build gate. */
export interface InspectionExecution {
  /** Host-only lifecycle injection. The batch/artifact/allowlist implementation remains here. */
  prepare?:()=>Promise<BuiltProject>;
  acquire?:(build:BuiltProject,options:RendererOptions)=>Promise<Pick<Renderer,'renderFrame'|'close'>>;
  onProfile?:PerformanceSink;
  finish?:(report:InspectionReport)=>void;
}
export async function inspectProject(options:InspectOptions,execution:InspectionExecution={}):Promise<InspectionReport>{
  const project=resolve(typeof options?.project==='string'?options.project:'.'),mode=options?.mode==='preview'?'preview':'accurate';
  const report:InspectionReport={schemaVersion:1,kind:'frameweave.render-inspection',ok:false,project,diagnostics:[],suggestedActions:[],
    policy:{mode,capture:'png',gpuPolicy:mode==='accurate'?'swiftshader':'auto',cache:options?.cache!==false,allowWasm:options?.allowWasm===true,...options?.media?{media:structuredClone(options.media)}:{},environment:{platform:process.platform,arch:process.arch,node:process.version,engineVersion,sdkIntegrity:runtimePin.integrity,browserVersion:'not-exposed',gpuDevice:'not-probed'}},frames:[],images:[],anomalies:[],reportFile:'',rendered:false};
  let directory:string|undefined,renderer:Pick<Renderer,'renderFrame'|'close'>|undefined;
  try{
    validateRequest(options);directory=await freshDirectory(options.output);report.reportFile=join(directory,'inspection.json');
    const packages=await installedPackages(dirname(project)),modules=packages.records.map(p=>({reference:packageRef(p.manifest),integrity:`sha256-${p.integrity}`,source:p.manifest.source}));
    const capabilities:ProjectSummary['requirements']=packages.records.flatMap(p=>p.manifest.capabilities.map(capability=>({capability,evidence:`${packageRef(p.manifest)} manifest`,certainty:'declared' as const})));
    let build:BuiltProject;try{
      if(execution.prepare)build=await execution.prepare();
      else {const parent=runtimeCachePath('inspection','builds');await mkdir(parent,{recursive:true});const outputDir=await mkdtemp(join(parent,'build-'));build=await buildProject(project,{outputDir,timeoutMs:options.timeoutMs,onProfile:execution.onProfile});}
      assertValidTVG(build.manifest);
    }catch(e){report.diagnostics.push(...issues(e,'compiler',project));return await finish();}
    report.summary=await summary(build,project,modules,capabilities);
    const c=build.manifest.composition,wasm=report.summary.requirements.some(r=>r.capability==='wasm');
    if(wasm&&!options.allowWasm)report.diagnostics.push({code:'W_WASM_AUTH',severity:'warning',source:'module',message:'WASM resources/capabilities are declared. Compilation in SpiderMonkey remains denied unless allowWasm is explicitly enabled.',hint:'Review actual WASM use before choosing --allow-wasm.'});
    for(const stage of build.manifest.stages)if(!['web','mock'].includes(stage.engine))report.diagnostics.push({code:'W_BACKEND_NOT_PROBED',severity:'warning',source:'inspection',stageId:stage.id,message:`Backend '${stage.engine}' is declared; custom adapter availability is only tested when frames are executed.`});
    let frames=options.frames??options.times?.map(t=>Math.round(t*c.fps.num/c.fps.den));
    if(!frames&&options.storyboard)frames=[0,.25,.5,.75,1].map(p=>Math.round((c.durationInFrames-1)*p));
    if(!frames)return await finish();
    for(const f of frames)if(!Number.isInteger(f)||f<0||f>=c.durationInFrames)fail('E_FRAME_RANGE',`Frame ${f} is outside [0, ${c.durationInFrames})`);
    const width=options.width??(options.height?Math.round(c.width*options.height/c.height):mode==='preview'?Math.min(640,c.width):c.width),height=options.height??Math.round(c.height*width/c.width);
    if(width*height>LIMITS.pixels||width*height*frames.length>67108864)fail('E_INSPECTION_LIMIT','Frame/total pixel budget exceeded; choose fewer or smaller frames');
    const renderOptions={width,height,preview:mode==='preview',cache:options.cache!==false,allowWasm:options.allowWasm,timeoutMs:options.timeoutMs??20000,onProfile:execution.onProfile,media:options.media};
    if(!execution.acquire)assertSharedExecution(build.manifest.stages);
    renderer=await (execution.acquire??Renderer.create.bind(Renderer))(build,renderOptions);
    report.rendered=true;
    for(const [index,frame]of frames.entries()){
      const f={index,frame,time:frame*c.fps.den/c.fps.num,...(options.stageId?{stageId:options.stageId}:{}),ok:false,diagnostics:[] as InspectionDiagnostic[],backend:{renderer:'FrameWeave.Renderer' as const,capture:options.stageId?'stage-surface' as const:'composition' as const,gpuPolicy:report.policy.gpuPolicy,stageEngines:[] as string[]},cache:{enabled:options.cache!==false,stageHits:0,stageResultsReused:false,finalImageReused:false as const},stageReportedBackends:{} as Record<string,string>};
      try{
        const rendered=await renderer.renderFrame(frame,options.stageId);f.cache.stageHits=rendered.cacheHits;f.cache.stageResultsReused=rendered.cacheHits>0;
        f.backend.stageEngines=[...new Set(Object.keys(rendered.stageOutputs).flatMap(id=>{const stage=build.manifest.stages.find(s=>s.id===id);return stage?[stage.engine]:[];}))];
        f.diagnostics=rendered.diagnostics.slice(0,4).map(d=>({code:d.code,severity:d.severity,message:d.message.slice(0,6000),source:'renderer' as const,...(d.stageId?{stageId:d.stageId}:{}),...(d.frame!==undefined?{frame:d.frame}:{}),...(d.hint?{hint:d.hint.slice(0,1000)}:{})}));
        for(const [stage,ports]of Object.entries(rendered.stageOutputs))if(typeof ports.backend==='string')f.stageReportedBackends[stage]=ports.backend.slice(0,100);
        const image=await writeImage(directory,`frame-${String(index).padStart(3,'0')}-${frame}`,rendered.png);report.images.push(image);
        const shared=(rendered as import('../render-session/index.ts').SessionFrame).shared;
        report.frames.push({...f,image,...shared?{shared}:{},ok:!f.diagnostics.some(d=>d.severity==='error')});
      }catch(e){f.diagnostics.push(...issues(e,'renderer',project).slice(0,4));
        for(const d of f.diagnostics){const entry=report.summary.stages.find(s=>s.id===d.stageId)?.entry;if(entry&&!entry.startsWith('@')&&!d.location){const candidate=sourcePath(project,entry);try{if((await stat(candidate)).isFile()){d.path=candidate;d.location={file:candidate};}}catch{/* Keep the verified project path rather than inventing a virtual source file. */}}}
        if(wasm&&!options.allowWasm&&f.diagnostics.some(d=>/WebAssembly|WASM|wasm-unsafe-eval/i.test(d.message)))f.diagnostics.push({code:'E_INSPECTION_WASM_AUTH',severity:'error',source:'renderer',frame,...(options.stageId?{stageId:options.stageId}:{}),message:'The frame failed while WASM execution was denied. Authorization was not changed.'});
        report.frames.push(f);
      }
      for(const d of report.frames.at(-1)!.diagnostics){report.diagnostics.push(d);if(d.severity==='error'||['W_BLANK_FRAME','W_BLACK_FRAME'].includes(d.code))report.anomalies.push({frame,code:d.code,reason:d.message});}
    }
    if(options.storyboard)await storyboard(directory,report);
  }catch(e){report.diagnostics.push(...issues(e,directory?'inspection':'request',project));}
  return await finish();
  async function finish(){
    if(renderer){try{await renderer.close();}catch(e){report.diagnostics.push(...issues(e,'renderer',project));}renderer=undefined;}
    report.ok=!report.diagnostics.some(d=>d.severity==='error');report.diagnostics=[...new Map(report.diagnostics.map(d=>[JSON.stringify([d.code,d.stageId,d.frame,d.message]),d])).values()];report.diagnostics.sort((a,b)=>Number(b.severity==='error')-Number(a.severity==='error'));report.diagnostics=report.diagnostics.slice(0,LIMITS.diagnostics);report.suggestedActions=suggestions(report.diagnostics);
    execution.finish?.(report);
    if(directory){try{await saveJson(join(directory,'inspection.json'),report);}catch(e){report.ok=false;report.diagnostics.push(...issues(e,'inspection',join(directory,'inspection.json')));}}
    return report;
  }
}
