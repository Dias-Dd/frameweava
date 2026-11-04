import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageRef,type PackageManifest} from './manifest.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));

/** Both discovery and installation use the shipped catalog or the latest completed source build. */
export async function officialCatalog(){
  const bundled=join(root,'catalog');
  try{if((await stat(bundled)).isDirectory())return bundled;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const source=join(root,'.frameweave','native-catalog');
  try{
    const delivery=(await readFile(join(source,'current'),'utf8')).trim();
    if(!/^delivery-[A-Za-z0-9]+$/.test(delivery))return undefined;
    const directory=join(source,delivery);
    if((await stat(directory)).isDirectory())return directory;
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
}

/** Callable names already declared by reviewed R1 packages. Keep the provider identity. */
export function catalogFunctionNames(manifests:PackageManifest[]){
  const names=new Map(manifests.filter(m=>m.bindings).map(m=>[packageRef(m),new Set(m.bindings!.gpuExports??[])]));
  for(const manifest of manifests){
    for(const {dependency,name} of Object.values(manifest.bindings?.forward??{})){
      const version=manifest.dependencies?.[dependency];
      if(version)names.get(`${dependency}@${version}`)?.add(name);
    }
  }
  return names;
}
