import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {installedPackages} from './manager.ts';
import {packageRef,type PackageRecord} from './manifest.ts';
import {satisfies} from '../plugins/schema.ts';
import {EngineError} from '../core/errors.ts';

export function programLibraryDirectory(){
  return resolve(process.env.FRAMEWEAVE_PROGRAM_LIBRARY??fileURLToPath(new URL('../../.frameweave/library/',import.meta.url)));
}

export const programPackages=()=>installedPackages(programLibraryDirectory());

type PackageState=Awaited<ReturnType<typeof installedPackages>>;
export type EffectivePackageState=PackageState&{unavailableProgramIds?:ReadonlySet<string>};

export async function checkProgramRequirements(directory:string,state:EffectivePackageState){
  const path=join(directory,'frameweave.requirements.json');
  let source:string;
  try{source=await readFile(path,'utf8');}catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return;
    throw error;
  }
  let config:{schemaVersion?:unknown;requirements?:Record<string,unknown>};
  const invalid=()=>new EngineError('E_PACKAGE_REQUIREMENTS',`Invalid package requirements in ${path}`);
  try{config=JSON.parse(source);}catch{throw invalid();}
  if(config?.schemaVersion!==1||!config.requirements||typeof config.requirements!=='object'||Array.isArray(config.requirements))throw invalid();
  const versions=new Map(state.records.map(record=>[record.manifest.id,record.manifest.version]));
  for(const [id,range] of Object.entries(config.requirements)){
    if(!/^[a-z][a-z0-9.-]*$/.test(id)||typeof range!=='string')throw invalid();
    const version=versions.get(id);
    if(!satisfies(version??'0.0.0',range)||!version)
      throw new EngineError('E_PACKAGE_REQUIREMENTS',`${id} requires ${range}; available version is ${version??'none'}`,
        {hint:`Install a matching version with packages install "${id}@${range}".`});
  }
}

/** Resolve pinned project packages first, then admit complete, verified program-library closures. */
export async function effectivePackages(directory:string):Promise<EffectivePackageState>{
  const project=await installedPackages(directory);
  if(resolve(directory)===programLibraryDirectory())return project;
  const program=await programPackages();
  if(!program.lock)return project;
  const programRecords=new Map(program.records.map(record=>[packageRef(record.manifest),record]));
  const selected=new Map(project.records.map(record=>[record.manifest.id,record]));
  const requirements={...project.lock?.requirements},roots={...project.lock?.roots},packages={...project.lock?.packages};
  const unavailableProgramIds=new Set<string>();
  for(const [id,ref] of Object.entries(program.lock.roots)){
    if(Object.hasOwn(roots,id)||!programRecords.get(ref)?.manifest.bindings)continue;
    const closure=new Map<string,PackageRecord>();
    const visit=(target:string):boolean=>{
      if(closure.has(target))return true;
      const record=programRecords.get(target)!;
      const previous=selected.get(record.manifest.id);
      if(previous&&(packageRef(previous.manifest)!==target||previous.integrity!==record.integrity))return false;
      closure.set(target,record);
      return Object.values(program.lock!.packages[target].dependencies).every(visit);
    };
    if(!visit(ref)){unavailableProgramIds.add(id);continue;}
    for(const [target,record] of closure){
      if(!selected.has(record.manifest.id)){
        selected.set(record.manifest.id,record);
        packages[target]=program.lock.packages[target];
      }
    }
    requirements[id]=program.lock.requirements[id];roots[id]=ref;
  }
  return {
    ...project,records:[...selected.values()],unavailableProgramIds,
    lock:{schemaVersion:1,apiVersion:1,platform:'web',requirements,roots,packages},
    config:{...project.config,requirements,trustedSources:[...new Set([...project.config.trustedSources,...program.config.trustedSources])]},
  };
}
