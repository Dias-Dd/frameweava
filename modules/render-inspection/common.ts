import {mkdir,mkdtemp,readdir,writeFile,readFile,realpath,stat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {EngineError,diagnostic} from '../../src/core/errors.ts';
import {serializeStageFailure} from '../../src/render/stage-failure.ts';
import {engineRoot} from '../../src/compiler/build.ts';
import type {InspectionDiagnostic,InspectionSource} from './types.ts';

export const LIMITS={frames:50,pixels:16777216,imageBytes:67108864,reportBytes:2097152,diagnostics:64,summaryEntries:128,iterations:5} as const;
export const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export function fail(code:string,message:string):never {throw new EngineError(code,message);}
export function finite(v:unknown,name:string,min:number,max:number,integer=false):number {
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))fail('E_ARGUMENT',`${name} must be ${integer?'an integer':'finite'} in [${min}, ${max}].`);return v;
}
export const within=(root:string,file:string)=>{const r=relative(root,file);return r!==''&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
export async function freshDirectory(requested?:string,parent=resolve('artifacts/inspection')):Promise<string>{
  if(!requested){await mkdir(parent,{recursive:true});return mkdtemp(join(parent,'run-'));}
  const target=resolve(requested);await mkdir(target,{recursive:true});if((await readdir(target)).length)fail('E_INSPECTION_OUTPUT',`Output must be a new or empty directory: ${target}`);return realpath(target);
}
export async function saveJson(file:string,value:unknown):Promise<void>{await writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
export async function boundedFile(file:string,maxBytes:number):Promise<Buffer>{const size=(await stat(file)).size;if(size>maxBytes)fail('E_INSPECTION_LIMIT',`${file} exceeds ${maxBytes} bytes`);const bytes=await readFile(file);if(bytes.length>maxBytes)fail('E_INSPECTION_LIMIT','File grew beyond the read budget');return bytes;}
export function issues(error:unknown,source:InspectionSource,path?:string):InspectionDiagnostic[]{
  const base=diagnostic(error),out:InspectionDiagnostic[]=[];
  function add(raw:unknown,depth=0){
    if(!plain(raw)||depth>4||out.length>=LIMITS.diagnostics)return;
    if(typeof raw.code!=='string'||typeof raw.message!=='string')return;
    let origin=source;if(raw.code.startsWith('E_RESOURCE')||raw.code.startsWith('E_SVG'))origin='resource';else if(/^E_(PLUGIN|PACKAGE|RUNTIME_LOCK)/.test(raw.code))origin='module';else if(/^E_RENDER_(?:SESSION_|CANCELLED$)|^E_CHROMIUM_DISCONNECTED$/.test(raw.code))origin='renderer';
    const item:InspectionDiagnostic={code:raw.code,severity:raw.severity==='warning'?'warning':'error',message:raw.message.slice(0,6000),source:origin,...(path?{path}:{})};
    if(typeof raw.stageId==='string')item.stageId=raw.stageId;if(typeof raw.frame==='number')item.frame=raw.frame;if(typeof raw.hint==='string')item.hint=raw.hint.slice(0,1000);
    if(typeof raw.file==='string'){item.location={file:raw.file,...(typeof raw.line==='number'?{line:raw.line}:{}),...(typeof raw.column==='number'?{column:raw.column}:{})};item.path=raw.file;}
    if(raw.code==='E_RESOURCE_MISSING'&&path){const match=/^Cannot load resource [^:]+: (.+)$/.exec(raw.message);if(match)item.path=sourcePath(path,match[1]);}
    out.push(item);
    const details=raw.details;
    if(raw.code.startsWith('E_SHARED_')&&plain(details)&&plain(details.cause))item.details={cause:serializeStageFailure(details.cause)};
    if(plain(details)&&Array.isArray(details.diagnostics))for(const d of details.diagnostics)add(d,depth+1);
    if(Array.isArray(details))for(const d of details){
      if(plain(d)&&typeof d.code==='string')add(d,depth+1);
      else if(plain(d)&&plain(d.location)&&typeof d.location.file==='string'){
        item.location={file:d.location.file,...(typeof d.location.line==='number'?{line:d.location.line}:{}),...(typeof d.location.column==='number'?{column:d.location.column+1}:{})};item.path=d.location.file;
      }
    }
  }
  add(base);return out;
}
const actions:Record<string,string>={
  E_TYPECHECK:'Fix the reported TypeScript source location, then inspect the affected frames again.',
  E_COMPILE:'Check the reported import or syntax location and the project JSX convention.',
  E_RESOURCE_MISSING:'Check the declared Resource path relative to the project entry and restore the missing local file.',
  E_PLUGIN_MISSING:'Locate the exact plugin reference in the configured project catalog before installing or changing the reference.',
  E_PLUGIN_LOCK:'Review plugin content and SDK identity against the lock; do not refresh a changed pin without review.',
  E_PACKAGE_INTEGRITY:'Restore the exact locked package bytes from a trusted local catalog; do not rewrite the hash.',
  E_PACKAGE_MISSING:'Restore the exact locked package from its trusted local catalog.',
  E_PLUGIN_PARAM:'Correct the reported parameter type or range using the plugin manifest.',
  E_FRAME_RANGE:'Choose frame numbers inside the composition duration.',
  E_OUTPUT_SIZE:'Choose dimensions that preserve the composition aspect ratio.',
  E_BACKEND_UNAVAILABLE:'Use an installed supported backend or register the required adapter explicitly.',
  E_RENDER_SESSION_CLOSED:'Open a new explicit render session before requesting more frames.',
  E_RENDER_CANCELLED:'Review the cancellation, then open a new session if more frames are needed.',
  E_RENDER_SESSION_POLICY:'Review the changed host environment or package trust before opening a new session.',
  E_RENDER_SESSION_CHANGED:'Keep module inputs stable during compilation and inspect again.',
  E_CHROMIUM_DISCONNECTED:'Inspect again to create a fresh backend; failed frames were not silently retried.',
  E_INSPECTION_WASM_AUTH:'Review the declared WASM use; pass --allow-wasm only when this project is authorized.',
  W_BLANK_FRAME:'Open the transparent image on black and white backgrounds and check visibility/time mappings.',
  W_BLACK_FRAME:'Open the captured frame and check whether its dark output is intentional.',
  W_COMPARE_POLICY:'Review the recorded backend policies; use an explicit tolerance and allowPolicyDifference only after reviewing the environments.',
  E_COMPARE_MEDIA:'Compare decoded still images; JPEG requires allowLossy with an explicit tolerance, and MP4 is not a PNG baseline.',
};
export function suggestions(diagnostics:InspectionDiagnostic[]):string[]{return [...new Set(diagnostics.flatMap(d=>actions[d.code]?[actions[d.code]]:d.hint?[d.hint]:[]))].slice(0,16);}
export function sourcePath(entry:string,src:string):string{return src.startsWith('data:')?'[embedded resource]':src.startsWith('package:')?src:resolve(dirname(entry),src);}
