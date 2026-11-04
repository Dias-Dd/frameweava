import {resolve,join} from 'node:path';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {agentResult} from '../../src/agent/result.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {BuiltProject} from '../../src/core/types.ts';

export interface ReplSessionOptions {cwd?:string;outputRoot?:string}
const problem=(code:string,message:string):never=>{throw new EngineError(code,message);};
/** A small foreground session over existing services; no renderer or background host retained. */
export function createReplSession(options:ReplSessionOptions={}){
  const cwd=resolve(options.cwd??process.cwd()),outputRoot=resolve(options.outputRoot??join(cwd,'.frameweave/repl'));
  let opened:BuiltProject|undefined,project:string|undefined,last:unknown=null,closed=false;
  function current(){if(!opened||!project)problem('E_REPL_PROJECT','No project open; use .open --trusted-local-code <path>');return {build:opened!,project:project!};}
  function frame(value:string|undefined,build:BuiltProject){const n=Number(value);if(value===undefined||!Number.isInteger(n)||n<0||n>=build.manifest.composition.durationInFrames)problem('E_FRAME_RANGE','Expected an integer frame in the open composition range');return n;}
  async function execute(name:string,args:string[]=[]){
    const result=await agentResult(async()=>{
      if(closed)problem('E_REPL_CLOSED','REPL session closed');
      if(name==='close'){if(args.length)problem('E_ARGUMENT','.close takes no arguments');opened=undefined;project=undefined;return {closed:true};}
      if(name==='open'){
        if(args.length!==2||args[0]!=='--trusted-local-code')problem('E_REPL_TRUST','Opening compiles and executes local project Node code. Use .open --trusted-local-code <path> only for code you reviewed; this does not grant module trust or WASM permission.');
        const next=resolve(cwd,args[1]),{buildProject}=await import('../../src/node.ts');
        const built=await buildProject(next);opened=built;project=next;
        return {project,buildHash:built.hash,composition:built.manifest.composition,stages:built.manifest.stages.map(s=>({id:s.id,engine:s.engine,outputs:s.outputs})),rendered:false};
      }
      if(name==='modules'){
        if(args.length)problem('E_ARGUMENT','.modules takes no arguments');
        const {searchCapabilities}=await import('../../src/capabilities/index.ts');
        return searchCapabilities({project:project??cwd,query:'',mode:'keyword',limit:100});
      }
      const selected=current();
      if(name==='stages'||name==='time'){
        if(args.length)problem('E_ARGUMENT',`.${name} takes no arguments`);
        return name==='time'?{project:selected.project,composition:selected.build.manifest.composition,buildHash:selected.build.hash,snapshot:true}:{project:selected.project,stages:selected.build.manifest.stages.map(s=>({id:s.id,engine:s.engine,inputs:s.inputs,outputs:s.outputs,time:s.time})),buildHash:selected.build.hash,snapshot:true};
      }
      if(name==='params'){
        if(args.length!==1)problem('E_ARGUMENT','.params <frame>');
        const n=frame(args[0],selected.build),{evaluate,frameContext,isActive}=await import('../../src/index.ts');
        return {project:selected.project,frame:n,buildHash:selected.build.hash,snapshot:true,stages:selected.build.manifest.stages.map(s=>{
          const active=isActive(s,n);if(!active)return {id:s.id,active};const context=frameContext(selected.build.manifest,s,n);
          return {id:s.id,active,context,props:evaluate(s.props,context),nodes:evaluate(s.nodes??[],context)};
        })};
      }
      if(name==='frame'){
        if(args.length<1||args.length>2||args.length===2&&args[1]!=='--allow-wasm')problem('E_ARGUMENT','.frame <frame> [--allow-wasm]');
        const n=frame(args[0],selected.build),{inspectProject}=await import('../../src/node.ts');
        await mkdir(outputRoot,{recursive:true});const output=await mkdtemp(join(outputRoot,'frame-'));
        // Rebuild through Inspection: source edits are checked; no cached renderer or hidden browser.
        const report=await inspectProject({project:selected.project,frames:[n],output,allowWasm:args[1]==='--allow-wasm'});
        if(!report.ok){const d=report.diagnostics[0];throw new EngineError(d?.code??'E_REPL_INSPECTION',d?.message??'Frame inspection failed',{stageId:d?.stageId,frame:d?.frame,details:{inspection:report}});}
        return report;
      }
      problem('E_ARGUMENT',`Unknown REPL command .${name}`);
    });
    last=result;return result;
  }
  return {execute,diagnostics:()=>last,close(){closed=true;opened=undefined;project=undefined;}};
}
