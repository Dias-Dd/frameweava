import {readFile,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,dirname,resolve} from 'node:path';

const cached=new Map<string,Promise<string[]>>();
/** Resolve only packages/versions in the engine lock, including npm's hoisted installation layout.
 * Never grant access to an entire parent node_modules or to a project's private dependencies.
 */
export function engineDependencyRoots(engineRoot:string):Promise<string[]>{
  const root=resolve(engineRoot);
  if(!cached.has(root))cached.set(root,(async()=>{
    let lockText:string;try{lockText=await readFile(join(root,'package-lock.json'),'utf8');}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;lockText=await readFile(join(root,'npm-shrinkwrap.json'),'utf8');}
    const lock=JSON.parse(lockText),pins=new Map<string,Set<string>>();
    for(const [path,value]of Object.entries(lock.packages) as [string,{version:string}][]){
      const index=path.lastIndexOf('node_modules/');if(index<0)continue;
      const name=path.slice(index+'node_modules/'.length);if(!pins.has(name))pins.set(name,new Set());pins.get(name)!.add(value.version);
    }
    const roots=new Set<string>(),visited=new Set<string>();
    async function visit(owner:string){
      const require=createRequire(join(owner,'package.json'));
      const pkg=JSON.parse(await readFile(join(owner,'package.json'),'utf8'));
      for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies})){
        if(!pins.has(name))continue;
        let file:string;
        try{file=require.resolve(`${name}/package.json`);}
        catch{try{let directory=dirname(require.resolve(name));for(;;){try{const candidate=join(directory,'package.json');if(JSON.parse(await readFile(candidate,'utf8')).name===name){file=candidate;break;}}catch{}const parent=dirname(directory);if(parent===directory)throw Error('Package manifest missing');directory=parent;}}catch{continue;}}
        const manifest=JSON.parse(await readFile(file!,'utf8'));
        if(manifest.name!==name||!pins.get(name)!.has(manifest.version))continue;
        const actual=await realpath(dirname(file!));roots.add(actual);
        if(!visited.has(actual)){visited.add(actual);await visit(actual);}
      }
    }
    await visit(root);return [...roots].sort();
  })());
  return cached.get(root)!;
}
