import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm,readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {hashValue} from '../render/cache.ts';
import {EngineError} from '../core/errors.ts';
import type {AnalysisArtifact,AnalysisIdentity} from './types.ts';

const fail=(message:string):never=>{throw new EngineError('E_ANALYSIS_ARTIFACT',message);};
const digest=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function canonicalAnalysisValue(value:unknown):any {
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return Array.from(value,v=>canonicalAnalysisValue(v));
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalAnalysisValue((value as any)[k])]));
  }
  return fail('Analysis values must be finite JSON (no undefined, live objects or binary buffers)');
}
export function analysisHash(value:unknown):string {return hashValue(canonicalAnalysisValue(value));}
export async function hashAnalysisFile(path:string,signal?:AbortSignal):Promise<{sha256:string;bytes:number}> {
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(path,{signal})){hash.update(chunk);bytes+=chunk.length;}
  return {sha256:hash.digest('hex'),bytes};
}
export function analysisIdentity(identity:AnalysisIdentity):AnalysisArtifact['identity'] {
  canonicalAnalysisValue(identity);
  const entity=(v:any)=>v&&typeof v.id==='string'&&!!v.id&&typeof v.version==='string'&&!!v.version&&hex(v.integrity);
  if(!identity||!Array.isArray(identity.inputs)||!identity.inputs.length||!identity.inputs.every(v=>v&&typeof v.id==='string'&&!!v.id&&hex(v.sha256)&&Number.isSafeInteger(v.bytes)&&v.bytes>=0&&(v.resource===undefined||typeof v.resource==='string'))||new Set(identity.inputs.map(v=>v.id)).size!==identity.inputs.length||!entity(identity.algorithm)||!Array.isArray(identity.models)||!identity.models.every(entity)||new Set(identity.models.map(v=>v.id)).size!==identity.models.length||!entity(identity.runtime))fail('Invalid analysis identity');
  const {parameters,...rest}=identity;
  return canonicalAnalysisValue({...rest,parametersHash:analysisHash(parameters)});
}
export const analysisCacheKey=(identity:AnalysisIdentity)=>analysisHash({schemaVersion:1,identity:analysisIdentity(identity)});
function localFile(path:string):void {
  if(typeof path!=='string'||!path||path.includes('\\')||path.includes(':')||path.includes('\0')||isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p))||['manifest.json','complete.json'].includes(path.split('/')[0].toLowerCase()))fail(`Unsafe artifact path: ${path}`);
}
const within=(root:string,path:string)=>{const r=relative(root,path);return r!==''&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
export interface AnalysisStoreOptions {maxResultBytes?:number; maxFiles?:number}
/** Explicit caller-owned directory. No global index, eviction daemon or Stage frame cache. */
export class AnalysisArtifactStore {
  readonly root:string;
  readonly maxResultBytes:number;
  readonly maxFiles:number;
  constructor(root:string,options:AnalysisStoreOptions={}) {
    this.root=resolve(root);this.maxResultBytes=options.maxResultBytes??256*1024*1024;this.maxFiles=options.maxFiles??1000;
    if(!Number.isSafeInteger(this.maxResultBytes)||this.maxResultBytes<1||!Number.isSafeInteger(this.maxFiles)||this.maxFiles<1)fail('Invalid analysis disk budget');
  }
  private async initialize() {
    await mkdir(this.root,{recursive:true});
    if((await lstat(this.root)).isSymbolicLink())fail('Cache root must not be a symbolic link');
    return realpath(this.root);
  }
  private key(key:string) {if(!hex(key))fail('Invalid analysis cache key');return join(this.root,key);}
  async begin():Promise<string> {
    await this.initialize();const path=join(this.root,`.tmp-${randomUUID()}`);await mkdir(path);return path;
  }
  private async checkedDirectory(directory:string) {
    await this.initialize();const path=resolve(directory);
    if(!within(this.root,path)||dirname(path)!==this.root||(await lstat(path)).isSymbolicLink()||!within(await realpath(this.root),await realpath(path)))fail('Artifact directory escapes the configured cache root');
    return path;
  }
  private async file(directory:string,path:string) {
    localFile(path);let cursor=directory;
    for(const part of path.split('/')){cursor=join(cursor,part);const s=await lstat(cursor);if(s.isSymbolicLink())fail('Artifact links are forbidden');}
    if(!(await lstat(cursor)).isFile()||!within(await realpath(directory),await realpath(cursor)))fail('Artifact result is not an ordinary in-scope file');
    return cursor;
  }
  private async filesOnDisk(directory:string,prefix=''):Promise<string[]> {
    const files:string[]=[];
    for(const entry of await readdir(join(directory,prefix),{withFileTypes:true})){
      const name=prefix?prefix+'/'+entry.name:entry.name;
      if(entry.isSymbolicLink())fail('Artifact links are forbidden');
      if(entry.isDirectory())files.push(...await this.filesOnDisk(directory,name));
      else if(entry.isFile())files.push(name);else fail('Special files are forbidden');
      if(files.length>this.maxFiles+2)fail('Artifact exceeds file budget');
    }
    return files;
  }
  private async readJSON(directory:string,path:string) {
    const file=join(directory,path),s=await lstat(file);
    if(!s.isFile()||s.isSymbolicLink()||s.size>4*1024*1024)fail('Invalid or oversized artifact metadata');
    return readFile(file,'utf8');
  }
  async prepare<Output>(directory:string,identity:AnalysisIdentity,output:Output,files:{path:string;format:string}[],signal?:AbortSignal):Promise<AnalysisArtifact<Output>> {
    await this.checkedDirectory(directory);signal?.throwIfAborted();canonicalAnalysisValue(output);
    if(!Array.isArray(files)||!files.length||files.length>this.maxFiles||new Set(files.map(f=>f.path.toLowerCase())).size!==files.length)fail('Invalid or duplicate artifact file list');
    const results:AnalysisArtifact['files']=[];let bytes=0;
    for(const f of files){localFile(f.path);if(typeof f.format!=='string'||!f.format)fail('Result format is required');const file=await this.file(directory,f.path),size=(await lstat(file)).size;if((bytes+=size)>this.maxResultBytes)fail('Artifact exceeds disk budget');results.push({...f,...await hashAnalysisFile(file,signal)});}
    const actual=(await this.filesOnDisk(directory)).sort(),expected=files.map(f=>f.path).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))fail('Every result file must be declared');
    const manifest:AnalysisArtifact<Output>={schemaVersion:1,kind:'frameweave.analysis-artifact',cacheKey:analysisCacheKey(identity),identity:analysisIdentity(identity),createdAt:new Date().toISOString(),output,files:results};
    const text=JSON.stringify(canonicalAnalysisValue(manifest),null,2);
    if(Buffer.byteLength(text)>4*1024*1024)fail('Artifact metadata exceeds 4 MiB');
    await writeFile(join(directory,'manifest.json'),text);
    await writeFile(join(directory,'complete.json'),JSON.stringify({schemaVersion:1,cacheKey:manifest.cacheKey,manifestSha256:digest(text)}));
    return manifest;
  }
  async validate<Output>(directory:string,key:string):Promise<AnalysisArtifact<Output>> {
    try{
      await this.checkedDirectory(directory);const text=await this.readJSON(directory,'manifest.json'),completeText=await this.readJSON(directory,'complete.json'),complete=JSON.parse(completeText);
      if(complete.schemaVersion!==1||complete.cacheKey!==key||complete.manifestSha256!==digest(text))fail('Manifest integrity mismatch');
      const m=JSON.parse(text) as AnalysisArtifact<Output>;canonicalAnalysisValue(m);
      if(m.schemaVersion!==1||m.kind!=='frameweave.analysis-artifact'||typeof m.createdAt!=='string'||!Number.isFinite(Date.parse(m.createdAt))||m.cacheKey!==key||!m.identity||analysisHash({schemaVersion:1,identity:m.identity})!==key||!Array.isArray(m.files)||!m.files.length||m.files.length>this.maxFiles||new Set(m.files.map(f=>f.path.toLowerCase())).size!==m.files.length)fail('Invalid or unsupported artifact manifest');
      // Revalidate the identity shape, using an arbitrary parameters value while checking its stored hash separately.
      analysisIdentity({...m.identity,parameters:null});if(!hex(m.identity.parametersHash))fail('Invalid parameters hash');
      let bytes=0;
      for(const f of m.files){localFile(f.path);if(!hex(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0||typeof f.format!=='string'||!f.format||(bytes+=f.bytes)>this.maxResultBytes)fail('Invalid result metadata or disk budget');}
      // Bounded filesystem parallelism only. Every path and every byte is authenticated on every read.
      // Wait for all readers on failure; never leave background validation streams behind.
      let next=0;
      const readers=await Promise.allSettled(Array.from({length:Math.min(4,m.files.length)},async()=>{
        while(next<m.files.length){
          const f=m.files[next++],file=await this.file(directory,f.path),before=await lstat(file,{bigint:true});
          if(before.size!==BigInt(f.bytes))fail('Result size mismatch');
          const h=await hashAnalysisFile(file),after=await lstat(file,{bigint:true});
          if(h.sha256!==f.sha256)fail('Result integrity mismatch');
          if(after.isSymbolicLink()||!after.isFile()||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)fail('Result changed during verification');
        }
      }));
      const failed=readers.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
      const actual=(await this.filesOnDisk(directory)).sort(),expected=[...m.files.map(f=>f.path),'manifest.json','complete.json'].sort();
      if(JSON.stringify(actual)!==JSON.stringify(expected))fail('Unexpected artifact files');
      if(await this.readJSON(directory,'manifest.json')!==text||await this.readJSON(directory,'complete.json')!==completeText)fail('Metadata changed during verification');
      return m;
    }catch(error){throw new EngineError('E_ANALYSIS_CACHE','Analysis artifact is corrupt or outside its configured boundary',{details:String(error)});}
  }
  async read<Output>(key:string):Promise<{directory:string;manifest:AnalysisArtifact<Output>}|undefined> {
    await this.initialize();const directory=this.key(key);
    try{await lstat(directory);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
    return {directory,manifest:await this.validate<Output>(directory,key)};
  }
  async publish<Output>(directory:string,key:string):Promise<{directory:string;manifest:AnalysisArtifact<Output>;publication:'created'|'concurrent-winner'}> {
    const manifest=await this.validate<Output>(directory,key),target=this.key(key);
    try{await rename(directory,target);return {directory:target,manifest,publication:'created'};}
    catch(error){const winner=await this.read<Output>(key);if(!winner)throw error;return {...winner,publication:'concurrent-winner'};}
  }
  async discard(directory:string):Promise<void> {
    // The caller may delete only its own random staging directory, never a published key.
    const path=resolve(directory);
    if(dirname(path)!==this.root||!/^\.tmp-[0-9a-f-]{36}$/.test(path.slice(this.root.length+1)))fail('Refusing to remove a non-staging path');
    try{await this.checkedDirectory(path);}catch(error){try{await lstat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;}throw error;}
    await rm(path,{recursive:true,force:true});
  }
}
