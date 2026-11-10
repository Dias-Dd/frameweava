// Node-only trusted local file export. Not loaded by Native Stage/SpiderMonkey.
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname,basename} from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {writeDeepExr,readDeepExr} from '../deep-exr/io.ts';import {surfaceDeepDocument,aovFileChannels,type SurfaceDeepReadback,type CryptoReadback} from './aov-documents.ts';import {fail} from './lifecycle.ts';
import {mediaPython} from '../../src/media/python.ts';
export {surfaceDeepDocument,aovFileChannels,readDeepExr};
export function writeAovDeep(file:string,input:SurfaceDeepReadback,options:{maxBytes?:number;signal?:AbortSignal}={}){const maxBytes=options.maxBytes??512*1024**2,doc=surfaceDeepDocument(input,{maxBytes});return writeDeepExr([doc],file,{maxBytes,compression:'zips',signal:options.signal});}
/** Explicit whole-channel data export, never an automatic final-frame color conversion. */
export function writeAovExr(file:string,
    input:{width:number;height:number;values:Float32Array;labels:Uint32Array;crypto?:readonly CryptoReadback[]},
    options:{maxBytes?:number;signal?:AbortSignal}={}) {
  return writeFlatAovExr(file,input.width,input.height,
    ()=>aovFileChannels(input.width,input.height,input.values,input.labels,input.crypto,options),options);
}

export interface FlatAovPlanes {
  channels: Record<string,Float32Array|Uint32Array>;
  metadata: Record<string,string>;
}

/** Shared Node-only writer for admitted typed AOV planes. */
export async function writeFlatAovExr(file:string,width:number,height:number,planes:()=>FlatAovPlanes,
    options:{signal?:AbortSignal}={}) {
  const python=mediaPython('E_AOV_IO_UNAVAILABLE');
  if(options.signal?.aborted)fail('AOV export cancelled','E_RENDER_CANCELLED');
  try {
    await stat(file);
    fail('Refusing to overwrite AOV EXR output','E_AOV_OUTPUT_EXISTS');
  } catch(e) {
    if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  }
  const data=planes();
  const directory=await mkdtemp(join(tmpdir(),'frameweave-aov-'));
  try {
    const blocks=Object.values(data.channels).map(v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength));
    await writeFile(join(directory,'planes.bin'),Buffer.concat(blocks),{signal:options.signal});
    await writeFile(join(directory,'request.json'),JSON.stringify({width,height,metadata:data.metadata,
      channels:Object.entries(data.channels).map(([name,values])=>({name,type:values instanceof Uint32Array?'uint':'float'})),
    }),{signal:options.signal});
    const child=promisify(execFile)(python,[fileURLToPath(new URL('./aov-write.py',import.meta.url)),directory],
      {windowsHide:true,timeout:120000,maxBuffer:1024**2,signal:options.signal});
    const closed=new Promise<void>(r=>child.child.once('close',()=>r()));
    let result;
    try { result=await child; } finally { await closed; }
    const receipt=JSON.parse(result.stdout);
    if(!receipt.ok)fail(receipt.error,'E_AOV_IO');
    if(options.signal?.aborted)fail('AOV export cancelled','E_RENDER_CANCELLED');
    await mkdir(dirname(resolve(file)),{recursive:true});
    await copyFile(join(directory,'output.exr'),resolve(file),1);
    return receipt;
  } catch(e) {
    if(options.signal?.aborted)fail('AOV writer cancelled','E_RENDER_CANCELLED');
    throw e;
  } finally {
    const target=resolve(directory);
    if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('frameweave-aov-'))
      throw Error('Unexpected private AOV directory');
    await rm(target,{recursive:true,force:true});
  }
}
