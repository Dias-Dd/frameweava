import {join} from 'node:path';
import {EngineError} from '../../src/core/errors.ts';
import {freshDirectory} from '../render-inspection/common.ts';
import {openRenderSession,type RenderSessionOptions} from './index.ts';

/** Explicit foreground owner: one compiled project/backend, serial batches, unconditional close. */
export async function renderSessionCLI(args:string[]){
  if(args[0]==='run')return stageRunCLI(args.slice(1));
  const [project,...rest]=args;
  if(!project||project.startsWith('--'))throw new EngineError('E_ARGUMENT','session <project> [--frames CSV] [--repeat 1..16] [--output fresh-directory] [--mode accurate|preview] [--allow-wasm] [--no-cache]');
  const flags:Record<string,string|boolean>={};
  for(let i=0;i<rest.length;i++){
    const key=rest[i].slice(2);
    if(!rest[i].startsWith('--')||!['frames','repeat','output','mode','allow-wasm','no-cache','json'].includes(key)||Object.hasOwn(flags,key))throw new EngineError('E_ARGUMENT',`Unknown/repeated session flag ${rest[i]}`);
    if(['allow-wasm','no-cache','json'].includes(key))flags[key]=true;
    else{const value=rest[++i];if(!value||value.startsWith('--'))throw new EngineError('E_ARGUMENT',`--${key} needs a value`);flags[key]=value;}
  }
  const repeat=Number(flags.repeat??1),mode=flags.mode??'accurate';
  if(!Number.isInteger(repeat)||repeat<1||repeat>16||!['accurate','preview'].includes(String(mode)))throw new EngineError('E_ARGUMENT','Invalid session repeat/mode');
  const frames=flags.frames===undefined?undefined:String(flags.frames).split(',').map(Number);
  if(frames&&(!frames.length||frames.length>48||String(flags.frames).split(',').some(v=>!v.trim())||frames.some(n=>!Number.isSafeInteger(n)||n<0)))throw new EngineError('E_ARGUMENT','Use 1..48 nonnegative integer frames');
  const output=await freshDirectory(typeof flags.output==='string'?flags.output:undefined);
  const session=await openRenderSession(project,{mode:mode as RenderSessionOptions['mode'],allowWasm:flags['allow-wasm']===true,cache:flags['no-cache']!==true});
  const reports=[];
  try{for(let i=0;i<repeat;i++){
    const report=await session.inspect({frames,output:join(output,`batch-${i+1}`)});reports.push(report);
    if(!report.ok){const first=report.diagnostics.find(d=>d.severity==='error');throw new EngineError(first?.code??'E_RENDER_SESSION',first?.message??'Session inspection failed',{stageId:first?.stageId,frame:first?.frame,details:{reports}});}
  }return {output,reports};}finally{await session.close();}
}
async function stageRunCLI(args:string[]){
  const [project,...rest]=args,flags:Record<string,string|boolean>={};
  if(!project||project.startsWith('--'))throw new EngineError('E_ARGUMENT','session run <project> --stage ID [--inputs JSON] [--frame N | --time S]');
  for(let i=0;i<rest.length;i++){const key=rest[i].slice(2);if(!rest[i].startsWith('--')||Object.hasOwn(flags,key)||!['stage','inputs','frame','time','json','allow-wasm'].includes(key))throw new EngineError('E_ARGUMENT','Unknown/repeated Stage run option');if(['json','allow-wasm'].includes(key))flags[key]=true;else{const value=rest[++i];if(!value||value.startsWith('--'))throw new EngineError('E_ARGUMENT','Missing Stage run option value');flags[key]=value;}}
  if(typeof flags.stage!=='string'||typeof flags.inputs==='string'&&flags.inputs.length>4*1024*1024)throw new EngineError('E_ARGUMENT','Stage is required; input JSON is bounded');
  let inputs;try{inputs=JSON.parse(String(flags.inputs??'{}'));}catch{throw new EngineError('E_ARGUMENT','Malformed Stage inputs JSON');}
  const session=await openRenderSession(project,{allowWasm:flags['allow-wasm']===true}),controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);
  try{return await session.run(flags.stage,{inputs,...flags.frame===undefined?{}:{frame:Number(flags.frame)},...flags.time===undefined?{}:{time:Number(flags.time)},signal:controller.signal});}
  finally{process.off('SIGINT',stop);await session.close();}
}
