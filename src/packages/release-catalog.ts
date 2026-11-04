import {readFile,writeFile,mkdir,mkdtemp,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {runtimeCachePath} from '../runtime/paths.ts';
import {EngineError} from '../core/errors.ts';
import {discoverPackages,packageRef} from './manifest.ts';
import {officialCatalog} from './official-catalog.ts';

export const RELEASE_CATALOG='frameweave.official-catalog.json';
export interface ReleaseCatalogPin {schemaVersion:1;url:string;sha256:string;bytes:number;expandedBytes:number;packages:Record<string,string>}
const root=fileURLToPath(new URL('../../',import.meta.url));
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const problem=(message:string)=>new EngineError('E_PACKAGE_CATALOG',message);

export function verifyReleaseCatalogPin(pin:ReleaseCatalogPin){
  let url:URL;try{url=new URL(pin?.url);}catch{throw problem('Invalid pinned GitHub catalog URL');}
  if(pin.schemaVersion!==1||url.origin!=='https://github.com'||url.username||url.password||url.search||url.hash||
    !/^\/[\w.-]+\/[\w.-]+\/releases\/download\/[\w.-]+\/[\w.-]+\.json\.gz$/.test(url.pathname)||
    !/^[a-f0-9]{64}$/.test(pin.sha256)||!Number.isSafeInteger(pin.bytes)||pin.bytes<=0||
    !Number.isSafeInteger(pin.expandedBytes)||pin.expandedBytes<=0||!pin.packages)
    throw problem('Invalid pinned GitHub catalog release');
}

export async function unpackReleaseCatalog(archive:Uint8Array,pin:ReleaseCatalogPin,directory:string){
  if(archive.length!==pin.bytes||digest(archive)!==pin.sha256)throw new EngineError('E_PACKAGE_INTEGRITY','Official catalog archive fingerprint mismatch');
  const expanded=gunzipSync(archive,{maxOutputLength:pin.expandedBytes});
  if(expanded.length!==pin.expandedBytes)throw problem('Official catalog length mismatch');
  const files=JSON.parse(expanded.toString('utf8')) as Record<string,string>;
  if(!files||typeof files!=='object'||Array.isArray(files))throw problem('Invalid official catalog payload');
  for(const [path,encoded] of Object.entries(files)){
    const parts=path.split('/');
    if(parts.some(part=>!part||part==='.'||part==='..'||/[\\:\x00-\x1f<>|?*"]|[. ]$/.test(part))||typeof encoded!=='string')
      throw problem('Unsafe official catalog file path');
    const output=join(directory,...parts);
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,Buffer.from(encoded,'base64'),{flag:'wx'});
  }
}

async function verifyCatalog(directory:string,pin:ReleaseCatalogPin){
  const records=await discoverPackages([directory]);
  if(records.length!==Object.keys(pin.packages).length||records.some(record=>pin.packages[packageRef(record.manifest)]!==record.integrity))
    throw new EngineError('E_PACKAGE_INTEGRITY','Official catalog package fingerprints differ from the release');
}

/** Publisher-pinned catalog transport. A source checkout uses its reviewed local build. */
export async function officialInstallCatalog(){
  let text:string;
  try{text=await readFile(join(root,RELEASE_CATALOG),'utf8');}catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return officialCatalog();
    throw error;
  }
  const pin=JSON.parse(text) as ReleaseCatalogPin;verifyReleaseCatalogPin(pin);
  const parent=resolve(runtimeCachePath('official-catalog')),directory=join(parent,pin.sha256);
  try{await verifyCatalog(directory,pin);return directory;}catch(error){
    if(!(error instanceof EngineError)||error.code!=='E_PACKAGE_MISSING')throw error;
  }
  const response=await fetch(pin.url,{signal:AbortSignal.timeout(60_000)});
  if(!response.ok||!response.body)throw problem(`GitHub catalog download failed (HTTP ${response.status})`);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let received=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      received+=value.length;
      if(received>pin.bytes)throw problem('GitHub catalog exceeded its published size');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});}
  await mkdir(parent,{recursive:true});
  const staging=await mkdtemp(join(parent,'download-'));
  try{
    await unpackReleaseCatalog(Buffer.concat(chunks),pin,staging);await verifyCatalog(staging,pin);
    try{await rename(staging,directory);}catch(error){
      if(!['EEXIST','ENOTEMPTY','EPERM'].includes((error as NodeJS.ErrnoException).code??''))throw error;
      await verifyCatalog(directory,pin);
    }
  }finally{
    if(dirname(resolve(staging))===parent&&basename(staging).startsWith('download-'))await rm(staging,{recursive:true,force:true});
  }
  return directory;
}
