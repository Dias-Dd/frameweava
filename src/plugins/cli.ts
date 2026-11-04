import {runtimeCachePath} from '../runtime/paths.ts';
import {resolve,dirname,relative} from 'node:path';
import {stat,writeFile,readFile} from 'node:fs/promises';
import {projectPlugins,discoverPlugins,builtinRoot,writeLock,discoverableEffects} from './registry.ts';
import {typecheckProject} from '../compiler/typecheck.ts';
import {fail,parseRef} from './schema.ts';
import type {SearchFilter} from './registry.ts';
import {installUserPlugins,createPlugin} from './library.ts';
import {indexPlugins,searchPlugins} from './search.ts';
import {parsePortable,materializePortable,printPortable} from '../compiler/portable.ts';
import {engineRoot} from '../compiler/build.ts';
import {join} from 'node:path';
import {functionSearchDocuments,searchFunctions} from '../capabilities/functions.ts';

export async function effectsCLI(args:string[]):Promise<unknown>{
  const [command='list',...rest]=args,positionals:string[]=[],flags:Record<string,string>={};
  const allowed=['project','kind','engine','input','output','compatible','mode','limit','id','name','description'];
  for(let i=0;i<rest.length;i++){if(rest[i].startsWith('--')){const key=rest[i].slice(2);if(['global','offline'].includes(key)||command==='search'&&key==='include-low-level'){flags[key]='true';continue;}if(!allowed.includes(key)||!rest[i+1]||rest[i+1].startsWith('--'))fail('E_ARGUMENT',`Invalid effects option ${rest[i]}`);flags[key]=rest[++i];}else positionals.push(rest[i]);}
  if(flags.global&&flags.project)fail('E_ARGUMENT','Choose --global or --project');
  if(command==='create'){if(positionals.length!==1||!flags.id)fail('E_ARGUMENT','effects create <new-directory> --id author.name [--kind generator|image-effect|function]');return createPlugin(positionals[0],{id:flags.id,name:flags.name,description:flags.description,kind:flags.kind});}
  let directory=resolve(flags.project??'.'),capsulePath:string|undefined,capsule:ReturnType<typeof parsePortable>;
  if(!(await stat(directory)).isDirectory()){
    const source=await readFile(directory,'utf8');capsule=parsePortable(source);
    if(capsule){capsulePath=directory;directory=dirname((await materializePortable(directory,runtimeCachePath('portable')))!);}else directory=dirname(directory);
  }
  if(command==='lock'){
    const result=await writeLock(directory);
    if(capsule&&capsulePath){const project=await projectPlugins(directory),path=relative(directory,project.lockfile).replaceAll('\\','/');capsule.sources[path]=await readFile(project.lockfile,'utf8');delete capsule.siblings?.[path];await writeFile(capsulePath,printPortable(capsule));return {...result,path:capsulePath,note:'Updated the embedded lock after explicit review; no original library required.'};}
    return result;
  }
  if(command==='install'){
    if(capsule)fail('E_PORTABLE_EDIT','Add new plugins to the authoring project and re-export. Existing embedded plugins can be edited and explicitly re-locked.');
    if(positionals.length!==1)fail('E_ARGUMENT','effects install requires a trusted local plugin/root directory');
    if(flags.global||!flags.project)return installUserPlugins(positionals[0]);
    const root=resolve(positionals[0]),project=await projectPlugins(directory),installed=await discoverPlugins([root]);
    const combined=await discoverPlugins([builtinRoot,...project.config.roots.map(r=>resolve(directory,r)),root]);
    const keys=new Set(combined.list().map(p=>`${p.manifest.id}@${p.manifest.version}`));for(const p of project.registry.list())if(!keys.has(`${p.manifest.id}@${p.manifest.version}`))combined.add(p);combined.lock();
    const relativeRoot=relative(directory,root).replaceAll('\\','/')||'.';
    if(!project.config.roots.some(r=>resolve(directory,r)===root))project.config.roots.push(relativeRoot);
    await writeFile(project.path,JSON.stringify(project.config,null,2)+'\n');
    return {installed:installed.list().map(r=>`${r.manifest.id}@${r.manifest.version}`),config:project.path,note:'Review source, then run effects lock explicitly. No code executed or downloaded.'};
  }
  if(command==='validate'){
    if(positionals.length!==1)fail('E_ARGUMENT','effects validate requires a plugin directory');
    const project=await projectPlugins(directory),plugins=await discoverPlugins([builtinRoot,...project.config.roots.map(r=>resolve(directory,r)),resolve(positionals[0])]);const keys=new Set(plugins.list().map(p=>`${p.manifest.id}@${p.manifest.version}`));for(const p of project.registry.list())if(!keys.has(`${p.manifest.id}@${p.manifest.version}`))plugins.add(p);plugins.lock();
    await typecheckProject(plugins.list().filter(p=>p.entry).map(p=>({file:p.entry!})));
    return {valid:true,plugins:plugins.list().filter(p=>p.directory.startsWith(resolve(positionals[0]))).map(p=>`${p.manifest.id}@${p.manifest.version}`),note:'Manifest, paths, dependencies, source types checked without executing modules.'};
  }
  const {registry,packages}=await projectPlugins(directory);
  const functionsProject={installed:packages.records,catalog:[]};
  if(command==='index')return indexPlugins(discoverableEffects(registry),!!flags.offline,await functionSearchDocuments(functionsProject));
  if(command==='info'){
    if(positionals.length!==1)fail('E_ARGUMENT','effects info requires id or exact id@version');
    const query=positionals[0],ref=query.includes('@')?(parseRef(query),query):registry.list().filter(p=>p.manifest.id===query).at(-1)?.manifest;
    const record=typeof ref==='string'?registry.get(ref):ref?registry.get(`${ref.id}@${ref.version}`):undefined;
    if(!record)fail('E_PLUGIN_MISSING',`Unknown plugin ${query}`);
    const m=record.manifest;
    return {...m,examples:m.examples??[`plugin('${m.id}@${m.version}', ${JSON.stringify(Object.fromEntries(Object.entries(m.parameters).map(([key,p])=>[key,p.default])))})`],integrity:record.integrity,directory:record.directory};
  }
  if(!['list','search'].includes(command))fail('E_ARGUMENT',`Unknown effects command ${command}`);
  const filters=Object.fromEntries(Object.entries(flags).filter(([key])=>['kind','engine','input','output','compatible'].includes(key))) as SearchFilter;
  const active=discoverableEffects(registry);
  if(command==='search'){
    const query=positionals.join(' '),mode=flags.mode as 'keyword'|'semantic'|'hybrid'|undefined;
    const limit=flags.limit?Number(flags.limit):undefined,offline=!!flags.offline;
    const functions=await searchFunctions({query,mode,limit,filters,includeLowLevel:!!flags['include-low-level']},functionsProject,offline);
    const effects=(await searchPlugins(active,query,filters,{mode,limit,offline})).map(({record:{manifest:m},...ranking})=>
      ({id:m.id,version:m.version,name:m.name,kind:m.kind,engine:m.engine,description:m.description,tags:m.tags,...ranking}));
    return [...functions,...effects].slice(0,limit??10);
  }
  return active.search('',filters).map(({manifest:m})=>({id:m.id,version:m.version,name:m.name,kind:m.kind,engine:m.engine,description:m.description,tags:m.tags}));
}
