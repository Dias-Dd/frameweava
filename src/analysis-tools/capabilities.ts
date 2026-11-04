import {readFile,lstat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashAnalysisFile} from '../analysis/artifact.ts';
import {diagnostic,EngineError} from '../core/errors.ts';
import type {Diagnostic} from '../core/types.ts';
import {installedPackages} from '../packages/manager.ts';
import {ffmpegPath} from '../encoding/ffmpeg.ts';
import type {AnalysisCapability,CapabilityDescription} from './types.ts';
import {AnalysisPaths,toolError} from './paths.ts';

const engine=fileURLToPath(new URL('../../',import.meta.url));
const faceRoot=join(engine,'prototypes/analysis-job-mvp');
const modelSha='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
function parameters(schema:CapabilityDescription['parameters'],values:Record<string,unknown>) {
  if(!values||typeof values!=='object'||Array.isArray(values))toolError('E_ARGUMENT','Parameters must be an object');
  for(const key of Object.keys(values))if(!Object.hasOwn(schema,key))toolError('E_ARGUMENT',`Unknown analysis parameter ${key}`);
  const out:Record<string,number>={};for(const [name,s]of Object.entries(schema)){const v=Object.hasOwn(values,name)?values[name]:s.default;if(typeof v!=='number'||!Number.isFinite(v)||v<s.minimum||v>s.maximum||s.integer&&!Number.isInteger(v))toolError('E_ARGUMENT',`Invalid ${name}; expected ${s.minimum}..${s.maximum}${s.integer?' integer':''}`);out[name]=v;}return out;
}
export async function installedAnalysisCapabilities(paths:AnalysisPaths,options:{forExecution?:string}={}) {
  // R1 verifies trust, locked content, dependencies and installed module bytes. Never import its descriptions.
  const packages=await installedPackages(paths.root);
  const installedModules=packages.records.map(r=>({id:r.manifest.id,version:r.manifest.version,integrity:`sha256-${r.integrity}`,source:r.manifest.source,moduleIntegrity:r.moduleIntegrity,analysisExecution:'not-authorized-by-R1-v1-manifest'}));
  let configuration:any={};
  try{await lstat(join(paths.root,'frameweave.analysis.json'));configuration=await paths.json('frameweave.analysis.json',65536);}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(!configuration||typeof configuration!=='object'||Array.isArray(configuration)||Object.keys(configuration).some(k=>!['schemaVersion','faceModel'].includes(k))||Object.keys(configuration).length&&configuration.schemaVersion!==1)toolError('E_ANALYSIS_CONFIG','Unknown analysis configuration fields/version');
  let modelPath=join(faceRoot,'assets/face_landmarker.task'),modelVersion='float16/1',expectedModelSha=modelSha;
  if(Object.hasOwn(configuration,'faceModel')){const m=configuration.faceModel;if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['path','version','sha256'].includes(k))||typeof m.path!=='string'||typeof m.version!=='string'||!m.version||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256))toolError('E_ANALYSIS_CONFIG','faceModel requires a project path, explicit version and SHA256');modelPath=await paths.check(m.path);modelVersion=m.version;expectedModelSha=m.sha256;}
  const faceSchema:CapabilityDescription['parameters']={startSeconds:{default:0,minimum:0,maximum:1e9},endSeconds:{default:8,minimum:0,maximum:1e9},sampleRate:{default:8,minimum:1,maximum:30,integer:true},analysisWidth:{default:640,minimum:128,maximum:1280,integer:true},minFaceDetectionConfidence:{default:.5,minimum:0,maximum:1},minFacePresenceConfidence:{default:.5,minimum:0,maximum:1},minTrackingConfidence:{default:.5,minimum:0,maximum:1}};
  const definitions=[{
    id:'frameweave.analysis.face-tracking',aliases:['face-tracking'],name:'Face tracking',version:'1.0.0',algorithmId:'mediapipe.FaceLandmarker',module:fileURLToPath(new URL('../../prototypes/analysis-job-mvp/worker.ts',import.meta.url)),exportName:'task',schema:faceSchema,outputType:'analysis.track/1',operations:['inspect','sample','sampleBatch','preview'],description:'Precompute a single visible face and query its source-media trajectory',limitations:['single-visible-face-segments-not-person-identity','confidence-unavailable-null','20-seconds-600-samples','model-preprovisioned-no-download'],
    ready:async()=>{throw new EngineError('E_ANALYSIS_RUNTIME_REMOVED','The Chromium face adapter was removed; no Native/Servo face adapter is implemented.');},
    input:async(input:string,p:Record<string,number>)=>{if(!['.webm','.mp4','.mov','.mkv'].includes(extname(input).toLowerCase()))toolError('E_ANALYSIS_INPUT','Face input must be a supported local video');if(p.endSeconds<=p.startSeconds||p.endSeconds-p.startSeconds>20||Math.ceil((p.endSeconds-p.startSeconds)*p.sampleRate)>600||p.analysisWidth%2)toolError('E_ARGUMENT','Use a positive range up to 20s / 600 samples and an even width');return {mediaPath:input,modelPath,modelVersion,...p};}
  },{
    id:'frameweave.analysis.image-brightness',aliases:['image-brightness','brightness'],name:'Image brightness',version:'1.0.0',algorithmId:'frameweave.image-luma-histogram',module:fileURLToPath(new URL('../../examples/analysis/brightness-task.ts',import.meta.url)),exportName:'brightnessTask',schema:{batchRows:{default:16,minimum:1,maximum:1024,integer:true}},outputType:'frameweave.brightness/1',operations:['inspect'],description:'Encoded RGB P6 image luminance statistics without a model or browser',limitations:['P6-RGB-without-header-comments','32-MiB-input','encoded-rgb-not-scene-linear'],ready:async()=>{},input:async(input:string,p:Record<string,number>)=>{if(extname(input).toLowerCase()!=='.ppm')toolError('E_ANALYSIS_INPUT','Brightness input must be a P6 .ppm file');return {imagePath:input,...p};}
  }];
  const capabilities:AnalysisCapability[]=[];
  for(const d of definitions){const diagnostics:Diagnostic[]=[];let entrySha256='';try{if(d.id==='frameweave.analysis.face-tracking')await d.ready();entrySha256=(await hashAnalysisFile(d.module)).sha256;if(options.forExecution&&options.forExecution!==d.id&&!d.aliases.includes(options.forExecution))diagnostics.push({code:'W_ANALYSIS_NOT_EVALUATED',severity:'warning',message:'Readiness not evaluated for an unrelated execution adapter'});else await d.ready();}catch(e){diagnostics.push(diagnostic(e));}
    capabilities.push({module:d.module,exportName:d.exportName,description:{id:d.id,name:d.name,aliases:d.aliases,version:d.version,description:d.description,source:{kind:'engine-bundled',algorithmId:d.algorithmId,entrySha256},availability:{ready:diagnostics.length===0,runtimeVerified:false,diagnostics},parameters:d.schema as CapabilityDescription['parameters'],outputType:d.outputType,operations:d.operations,limitations:d.limitations},prepare:async(input,values)=>{if(diagnostics.length)throw new EngineError('E_ANALYSIS_UNAVAILABLE',`${d.id} is not available`,{details:diagnostics});return d.input(await paths.input(input,d.id.endsWith('image-brightness')?32*1024*1024:1024*1024*1024),parameters(d.schema as CapabilityDescription['parameters'],values));}});
  }
  return {capabilities,installedModules};
}
