import {diagnostic,EngineError} from './core/errors.ts';
import {selectCLIOutput,withCLIOutput,writeCLIResult,cliHumanOutput,cliJSONRequested} from './cli-output.ts';
import {agentResult,emitAgentResult} from './agent/result.ts';
import {distributionDoctor,distributionVersion,verifyDistribution} from './runtime/distribution.ts';

/** Other DX commands can supply a standalone wiring function; services own execution and serialization. */
export type CLICommand=(args:string[])=>Promise<unknown>;
export async function runCLI(args:string[],extensions:Readonly<Record<string,CLICommand>>={}):Promise<unknown>{
  const presentation=selectCLIOutput(args);
  return withCLIOutput(presentation,()=>executeCLI(presentation.args,extensions,presentation.issue));
}
async function executeCLI(args:string[],extensions:Readonly<Record<string,CLICommand>>,issue?:EngineError):Promise<unknown>{
  try{
    await verifyDistribution();
    if(issue)throw issue;
    const [command,...rest]=args;
    if(['version','--version','-V'].includes(command)){
      if(rest.some(a=>a!=='--json')||rest.length>1)throw new EngineError('E_ARGUMENT','version [--json]');
      const version=await distributionVersion();if(cliJSONRequested())return emitAgentResult(await agentResult(async()=>({version})));console.log(version);return version;
    }
    if(command==='browser')throw new EngineError('E_WEB_REMOVED','Chromium installation and Web Stages were removed; HTML/CSS runs in the Servo module.');
    if(command==='doctor')return emitAgentResult(await agentResult(async()=>{
      if(rest.some(a=>a!=='--json'))throw new EngineError('E_ARGUMENT','doctor [--json]');
      return distributionDoctor();
    }));
    if(Object.hasOwn(extensions,command))return await extensions[command](rest);
    if(command==='create')return emitAgentResult(await agentResult(()=>(import('./authoring-tools/cli.ts')).then(m=>m.creationCLI(rest))));
    if(command==='media')return emitAgentResult(await agentResult(()=>(import('./media/service.ts')).then(m=>m.professionalMediaCLI(rest))));
    if(command==='analyze'){
      const result=await (await import('./analysis-tools/cli.ts')).analysisCLI(rest);
      writeCLIResult(result);return result;
    }
    if(command==='session')return emitAgentResult(await agentResult(()=>(import('../modules/render-session/cli.ts')).then(m=>m.renderSessionCLI(rest))));
    if(command==='repl'){
      if(rest.length)throw new EngineError('E_ARGUMENT','repl takes no options; use explicit .open inside the console');
      const repl=(await import('../modules/repl/index.ts')).startFrameweaveRepl();await repl.closed;return;
    }
    const result=await (await import('./cli.ts')).main(args);
    if(result&&typeof result==='object'&&'ok' in result&&result.ok===false){
      process.exitCode=1;
      if(!cliHumanOutput()&&command==='inspect'&&'diagnostics' in result&&Array.isArray(result.diagnostics))
        for(const d of result.diagnostics)process.stderr.write(`${d.code}: ${d.message}\n`);
    }
    return result;
  }catch(error){
    // ACL-2 predates the shared emitter: preserve its stderr-only Diagnostic / --events JSONL contract.
    if(args[0]==='analyze'){
      writeCLIResult({ok:false,diagnostics:[diagnostic(error)]},{stream:'stderr',pretty:!args.includes('--events')});process.exitCode=1;return;
    }
    if(['capabilities','inspect'].includes(args[0]))return emitAgentResult(await agentResult(async()=>{throw error;}));
    writeCLIResult({ok:false,diagnostics:[diagnostic(error)]},{stream:'stderr'});process.exitCode=1;
  }
}
