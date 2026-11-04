import {mkdir,open,readFile,readdir,writeFile,rename,rm,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import type {InspectOptions,InspectionDiagnostic,InspectionReport,ComparisonReport,InspectionIterationReport} from './types.ts';
import {inspectProject} from './inspect.ts';
import {compareInspections} from './compare.ts';
import {LIMITS,finite,fail,plain,issues,suggestions,within,boundedFile} from './common.ts';

interface Ledger {schemaVersion:1;project:string;limit:number;count:number}
/** One read-only check per call; caller edits between calls. The persisted budget cannot be raised. */
export async function inspectIteration(options:Omit<InspectOptions,'output'>&{session:string;maxIterations?:number}):Promise<InspectionIterationReport>{
  let handle:Awaited<ReturnType<typeof open>>|undefined,lock:string|undefined;
  const diagnostics:InspectionDiagnostic[]=[];
  try{
    if(typeof options.session!=='string'||!options.session||typeof options.project!=='string')fail('E_ARGUMENT','session and project are required');
    await mkdir(options.session,{recursive:true});const root=await realpath(options.session);lock=join(root,'inspection.operation');
    try{handle=await open(lock,'wx');}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')fail('E_INSPECTION_BUSY','Another check owns this session; do not remove its operation file while active');throw e;}
    const file=join(root,'session.json');let ledger:Ledger;
    try{
      if(!within(root,await realpath(file)))fail('E_INSPECTION_PATH','Session manifest escapes its directory');
      const v:unknown=JSON.parse((await boundedFile(file,4096)).toString('utf8'));
      if(!plain(v)||v.schemaVersion!==1||typeof v.project!=='string'||!Number.isInteger(v.limit)||Number(v.limit)<1||Number(v.limit)>LIMITS.iterations||!Number.isInteger(v.count)||Number(v.count)<0||Number(v.count)>Number(v.limit))fail('E_INSPECTION_SESSION','Invalid session manifest');
      ledger={schemaVersion:1,project:v.project,limit:Number(v.limit),count:Number(v.count)};
      if(ledger.project!==resolve(options.project))fail('E_INSPECTION_SESSION','A session belongs to one project');
      if(options.maxIterations!==undefined&&options.maxIterations!==ledger.limit)fail('E_INSPECTION_BUDGET','An existing session budget cannot be changed; create a separate session deliberately');
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
      if((await readdir(root)).some(x=>x!=='inspection.operation'))fail('E_INSPECTION_SESSION','New session directory must be empty');
      ledger={schemaVersion:1,project:resolve(options.project),limit:finite(options.maxIterations??3,'maxIterations',1,LIMITS.iterations,true),count:0};
    }
    if(ledger.count>=ledger.limit)fail('E_INSPECTION_BUDGET','Inspection session budget exhausted');
    ledger.count++;const temp=join(root,'session.pending.json');await writeFile(temp,JSON.stringify(ledger,null,2)+'\n',{flag:'wx'});await rename(temp,file);
    const revision=(n:number)=>`revision-${String(n).padStart(3,'0')}`,inspection:InspectionReport=await inspectProject({...options,output:join(root,revision(ledger.count))});
    let comparison:ComparisonReport|undefined;
    if(ledger.count>1&&inspection.rendered)comparison=await compareInspections(join(root,revision(ledger.count-1)),join(root,revision(ledger.count)),{output:join(root,`comparison-${ledger.count}`)});
    return {schemaVersion:1 as const,kind:'frameweave.inspection-iteration' as const,ok:inspection.ok,project:ledger.project,iteration:ledger.count,remaining:ledger.limit-ledger.count,inspection,...(comparison?{comparison}:{}),diagnostics:inspection.diagnostics,suggestedActions:inspection.suggestedActions};
  }catch(e){diagnostics.push(...issues(e,'inspection'));return {schemaVersion:1 as const,kind:'frameweave.inspection-iteration' as const,ok:false,diagnostics,suggestedActions:suggestions(diagnostics)};}
  finally{if(handle){await handle.close();await rm(lock!,{force:true});}}
}
