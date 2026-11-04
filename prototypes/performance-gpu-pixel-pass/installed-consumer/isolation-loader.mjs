import {realpath,appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {relative,isAbsolute} from 'node:path';
let root,log;
export function initialize(data){root=data.consumerRoot;log=data.resolutionLog;}
export async function resolve(specifier,context,nextResolve){
  const result=await nextResolve(specifier,context);
  if(result.url.startsWith('file:')){
    const path=await realpath(fileURLToPath(result.url)),r=relative(root,path);
    if(r==='..'||r.startsWith('..\\')||r.startsWith('../')||isAbsolute(r))throw new Error('INSTALLED_CONSUMER_ESCAPE: '+path);
    await appendFile(log,JSON.stringify({specifier,parentURL:context.parentURL??null,url:result.url,realPath:path})+'\n');
  }
  return result;
}
