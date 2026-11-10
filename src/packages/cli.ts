import {runtimeCachePath} from '../runtime/paths.ts';
import {resolve,dirname,relative} from 'node:path';
import {stat,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parsePortable,materializePortable} from '../compiler/portable.ts';
import {engineRoot} from '../compiler/build.ts';
import {fail,satisfies,version} from '../plugins/schema.ts';
import {readPackage,packageRef,discoverPackages} from './manifest.ts';
import {projectPlugins} from '../plugins/registry.ts';
import {checkFlatPackages} from '../compiler/flat-integrity.ts';
import {checkRuntimeFile} from '../compiler/runtime-lock.ts';
import {installPackages,restorePackages,uninstallPackage,uninstallPackages,installedPackages,verifyPackages} from './manager.ts';
import {installRemotePackage,registryConfig} from './remote-registry.ts';
import {officialInstallCatalog} from './release-catalog.ts';
import {effectivePackages,programLibraryDirectory,programPackages} from './program-library.ts';

export async function packagesCLI(args:string[]):Promise<unknown>{
  const [command='list',...rest]=args,positionals:string[]=[],flags:Record<string,string[]>={};
  for(let i=0;i<rest.length;i++){
    const arg=rest[i];if(!arg.startsWith('--')){positionals.push(arg);continue;}
    const name=arg.slice(2);if(name==='all'){(flags.all??=[]).push('true');continue;}if(!['project','add','trust','integrity','catalog'].includes(name)||!rest[i+1]||rest[i+1].startsWith('--'))fail('E_ARGUMENT',`Invalid packages option ${arg}`);
    (flags[name]??=[]).push(rest[++i]);
  }
  if(flags.all&&(command!=='uninstall'||flags.all.length!==1||positionals.length))fail('E_ARGUMENT','Use packages uninstall --all without package IDs');
  if(flags.project&&flags.project.length!==1)fail('E_ARGUMENT','Specify one --project');
  const program=!flags.project&&['install','uninstall','list','verify'].includes(command);
  let directory=program?programLibraryDirectory():resolve(flags.project?.[0]??process.cwd());
  if(!program&&!(await stat(directory)).isDirectory()){
    const embedded=checkFlatPackages(directory);
    if(embedded){checkRuntimeFile(directory);if(['install','restore','uninstall','types'].includes(command))fail('E_PORTABLE_EDIT','Embedded Flat packages are sealed; edit the reviewed authoring project and re-export');const packages=Object.entries(embedded.packages).map(([reference,p])=>({reference,source:p.manifest.source,integrity:p.integrity,modules:p.modules,embedded:true}));if(command==='verify')return {valid:true,kind:'embedded-flat',packages};if(command==='list')return packages;if(command==='inspect'){const p=Object.entries(embedded.packages).find(([ref,p])=>ref===positionals[0]||p.manifest.id===positionals[0])?.[1];if(!p)fail('E_PACKAGE_MISSING','No matching embedded package');return {...p.manifest,integrity:p.integrity,moduleIntegrity:p.modules};}fail('E_ARGUMENT',`Unsupported embedded package command ${command}`);}
    const capsule=parsePortable(await readFile(directory,'utf8'));
    if(capsule){
      if(['install','restore','uninstall'].includes(command))fail('E_PORTABLE_EDIT','Change packages in the authoring project, then re-export; package commands cannot mutate a portable cache');
      directory=dirname((await materializePortable(directory,runtimeCachePath('portable')))!);
    }else directory=dirname(directory);
  }
  if(command==='install'){
    if(positionals.length!==1)fail('E_ARGUMENT','packages install <name[@version]|name>=version|trusted-local-package> [--catalog <directory>] --trust local:authority');
    const candidate=resolve(positionals[0]);let local=false;try{local=(await stat(candidate)).isDirectory();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(local)return installPackages(directory,[candidate],{add:flags.add,trust:flags.trust,integrity:flags.integrity?.[0]});
    const match=/^([a-z][a-z0-9.-]*)(?:@((?:\^|~|>=)?\d+\.\d+\.\d+)|(>=\d+\.\d+\.\d+))?$/.exec(positionals[0]);if(!match)fail('E_PACKAGE_CATALOG','Use a local catalog path or a managed package name and optional version range');
    const range=match[2]??match[3];
    if(!flags.catalog&&await registryConfig()){const result=await installRemotePackage(directory,positionals[0],{trust:flags.trust,integrity:flags.integrity?.[0],add:flags.add});await initialEffectLock(directory,result.roots[match[1]]);return result;}
    const bundled=flags.catalog?undefined:await officialInstallCatalog();
    const catalogs=(flags.catalog??(bundled?[bundled]:[])).map(p=>resolve(p));
    const candidates=await discoverPackages(catalogs),state=await installedPackages(directory);
    const availableProgram=flags.catalog?[]:program?state.records:(await programPackages()).records;
    const catalog=[...new Map([...candidates,...availableProgram].map(record=>[packageRef(record.manifest),record])).values()];
    const pinned=state.lock?.roots[match[1]],eligible=catalog.filter(r=>r.manifest.id===match[1]&&(!range||satisfies(r.manifest.version,range)));
    const found=eligible.find(record=>packageRef(record.manifest)===pinned)??eligible.sort((a,b)=>{const x=version(a.manifest.version),y=version(b.manifest.version);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];}).at(-1);
    if(!found)fail('E_PACKAGE_MISSING',`No matching ${positionals[0]} in the official or installed catalog`);
    const result=await installPackages(directory,catalog.map(record=>record.directory),{
      add:[packageRef(found.manifest),...flags.add??[]],trust:flags.trust,integrity:flags.integrity?.[0],
      ranges:range||state.config.requirements[match[1]]?{[match[1]]:range??state.config.requirements[match[1]]}:undefined,
    });
    // Initial reviewed installation may CREATE a minimal effect lock. Existing
    // locks are never refreshed, expanded or overwritten by package installation.
    await initialEffectLock(directory,packageRef(found.manifest));
    return result;
  }
  if(command==='restore'){if(!positionals.length)fail('E_ARGUMENT','packages restore <local-catalog> --project <entry>');return restorePackages(directory,positionals.map(p=>resolve(p)));}
  if(command==='share'){
    if(positionals.length!==1)fail('E_ARGUMENT','packages share <id> --project <entry>');
    const state=await installedPackages(directory),ref=state.lock?.roots[positionals[0]];
    if(!ref)fail('E_PACKAGE_MISSING',`No installed direct dependency ${positionals[0]} to move into the program library`);
    return installPackages(programLibraryDirectory(),state.records.map(record=>record.directory),{add:[ref],trust:state.config.trustedSources});
  }
  if(command==='uninstall'){if(flags.all)return uninstallPackages(directory,'all');if(!positionals.length)fail('E_ARGUMENT','packages uninstall <package-id...> | --all');return positionals.length===1?uninstallPackage(directory,positionals[0]):uninstallPackages(directory,positionals);}
  if(command==='verify'){if(positionals.length)fail('E_ARGUMENT','packages verify --project <entry>');return verifyPackages(directory);}
  if(command==='types'){
    if(positionals.length)fail('E_ARGUMENT','packages types [--project <entry>]');
    const state=await effectivePackages(directory),target=join(directory,'.frameweave/managed.tsconfig.json');
    const paths=Object.fromEntries(state.records.filter(r=>r.manifest.bindings).map(r=>[r.manifest.id,['./'+relative(dirname(target),resolve(r.directory,r.manifest.bindings!.types)).replaceAll('\\','/')]]));
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,JSON.stringify({compilerOptions:{baseUrl:'.',paths}},null,2)+'\n');
    return {file:target,extend:'./.frameweave/managed.tsconfig.json',packages:Object.keys(paths).filter(id=>Object.hasOwn(state.lock?.roots??{},id))};
  }
  if(command==='inspect'){if(positionals.length!==1)fail('E_ARGUMENT','packages inspect <local-package> --project <entry>');const record=await readPackage(resolve(positionals[0]));return {...record.manifest,integrity:`sha256-${record.integrity}`,moduleIntegrity:record.moduleIntegrity};}
  if(command==='list'){if(positionals.length)fail('E_ARGUMENT','packages list --project <entry>');const state=await installedPackages(directory);return state.records.map(r=>({reference:packageRef(r.manifest),source:r.manifest.source,integrity:`sha256-${r.integrity}`,direct:Object.hasOwn(state.config.requirements,r.manifest.id),capabilities:r.manifest.capabilities,modules:r.manifest.modules}));}
  fail('E_ARGUMENT',`Unknown packages command ${command}`);
}

async function initialEffectLock(directory:string,reference:string){
 const record=(await installedPackages(directory)).records.find(r=>packageRef(r.manifest)===reference);
 if(!record?.manifest.bindings||!record.effect)return;
 const project=await projectPlugins(directory);try{await stat(project.lockfile);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(project.lockfile,JSON.stringify(project.registry.lock([reference]),null,2)+'\n',{flag:'wx'});}
}
