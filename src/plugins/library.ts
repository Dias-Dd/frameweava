import {mkdir,cp,stat,rm,rename,writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {discoverPlugins,PluginRegistry,builtinRoot} from './registry.ts';
import {userLibraryHome,userPluginRoot} from './paths.ts';
import {fail,validateManifest} from './schema.ts';
import {typecheckProject} from '../compiler/typecheck.ts';
import type {PluginManifest} from './sdk.ts';

/** Managed immutable snapshots: later edits to the author's working copy cannot change a render. */
export async function installUserPlugins(root:string) {
  const incoming=await discoverPlugins([resolve(root)]);
  let sharedExists=true;try{await stat(userPluginRoot());}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;sharedExists=false;}
  const current=await discoverPlugins([builtinRoot,...sharedExists?[userPluginRoot()]:[]]);
  const merged=new PluginRegistry();
  const additions=new Map(incoming.list().map(p=>[`${p.manifest.id}@${p.manifest.version}`,p]));
  for(const p of current.list())if(!additions.has(`${p.manifest.id}@${p.manifest.version}`))merged.add(p);
  for(const p of incoming.list())merged.add(p);
  merged.lock([...additions.keys()]);
  await typecheckProject(incoming.list().filter(p=>p.entry).map(p=>({file:p.entry!})));
  const home=userLibraryHome(),destination=userPluginRoot();await mkdir(destination,{recursive:true});
  const installed=await discoverPlugins([destination]),existing=new Map(installed.list().map(p=>[`${p.manifest.id}@${p.manifest.version}`,p]));
  for(const [ref,p] of additions){const old=existing.get(ref);if(old&&old.integrity!==p.integrity)fail('E_PLUGIN_IMMUTABLE',`${ref} already contains different code. Bump the version instead of replacing it.`);}
  const staging=await mkdtemp(join(home,'install-')),copied:string[]=[];
  try{
    for(const [ref,p] of additions){if(existing.has(ref))continue;
      const target=join(staging,ref);await cp(p.directory,target,{recursive:true,dereference:true,filter:path=>!relative(p.directory,path).split(/[\\/]/).some(x=>['node_modules','.git','.frameweave'].includes(x))});
      const check=(await discoverPlugins([target])).get(ref);if(check.integrity!==p.integrity)fail('E_PLUGIN_LOCK',`Source changed during installation: ${ref}`);
    }
    await typecheckProject((await discoverPlugins([staging])).list().filter(p=>p.entry).map(p=>({file:p.entry!})));
    for(const [ref] of additions){if(existing.has(ref))continue;await rename(join(staging,ref),join(destination,ref));copied.push(ref);}
  }finally{await rm(staging,{recursive:true,force:true});}
  return {scope:'user',home,installed:[...additions.keys()],copied,note:'Immutable local snapshots; all projects discover these versions automatically. Project locks remain explicit.'};
}

export async function createPlugin(directory:string,options:{id:string;name?:string;description?:string;kind?:string}) {
  const kind=options.kind??'function';if(!['generator','image-effect','function'].includes(kind))fail('E_ARGUMENT','Scaffolding supports generator, image-effect, or function; other kinds can be authored against the SDK.');
  if(kind!=='function')fail('E_PLUGIN_TEMPLATE_REMOVED','Browser generator/image templates were removed; use a Native R1 module or Servo content.');
  const manifest:PluginManifest={schemaVersion:1,apiVersion:1,id:options.id,name:options.name??options.id,version:'1.0.0',kind:kind as PluginManifest['kind'],engine:'native-gpu',compatible:'^0.1.0',entry:'./index.ts',description:options.description??'Describe the visual behavior, intended use, and searchable keywords here.',tags:[],parameters:{speed:{type:'number',default:1,minimum:0,maximum:10}},inputs:{},outputs:{value:'number'}};
  validateManifest(manifest);directory=resolve(directory);try{await stat(directory);fail('E_EXISTS',`Directory already exists: ${directory}`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await mkdir(directory,{recursive:true});
  const implementation=`import {definePlugin} from '@frameweave/engine/plugins';\nexport default definePlugin<{speed:number}>({kind:'function',evaluate(time,_inputs,p){return {value:Math.sin(time.time*p.speed)};}});\n`;
  await writeFile(join(directory,'effect.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(join(directory,'index.ts'),implementation);
  await writeFile(join(directory,'api.ts'),`import {typedPlugin} from '@frameweave/engine/plugins';\nexport const effect=typedPlugin<{speed:number}>('${manifest.id}@1.0.0');\n`);
  await writeFile(join(directory,'LICENSE'),'SPDX-License-Identifier: Apache-2.0\nOriginal plugin source. See https://www.apache.org/licenses/LICENSE-2.0\n');
  return {directory,reference:`${manifest.id}@1.0.0`,next:['Edit effect.json description/tags/parameters and index.ts','effects validate <directory>','effects install <directory> --project <entry>; effects lock --project <entry>','Render random-access frames and a short clip, inspect visuals','effects install <directory> --global']};
}
