import {cliHumanOutput,cliVerboseOutput,formatHumanResult} from '../../src/cli-output.ts';
import {diagnostic,EngineError} from '../../src/core/errors.ts';
import {start,type REPLServer} from 'node:repl';
import type {Readable,Writable} from 'node:stream';
import ts from 'typescript';
import {createReplSession,type ReplSessionOptions} from './session.ts';

export interface ReplOptions extends ReplSessionOptions {input?:Readable;output?:Writable;terminal?:boolean;banner?:boolean}
/** Parse only our command arguments, never shell-expand or execute them. */
export function commandArguments(text:string):string[]{
  const values:string[]=[];let value='',quote='',started=false;
  for(const c of text.trim()){
    if(quote){if(c===quote)quote='';else value+=c;started=true;}
    else if(c==='"'||c==="'"){quote=c;started=true;}
    else if(/\s/.test(c)){if(started){values.push(value);value='';started=false;}}
    else{value+=c;started=true;}
  }
  if(quote)throw SyntaxError('Unclosed command argument quote');if(started)values.push(value);return values;
}
export function transpileReplInput(source:string,filename='frameweave-repl.ts'):string{
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const check=(node:ts.Node)=>{if(ts.isFunctionLike(node))return;if(ts.isAwaitExpression(node)||ts.isForOfStatement(node)&&node.awaitModifier)throw SyntaxError('Top-level await is not supported by this lightweight REPL; asynchronous project commands are separate dot commands.');ts.forEachChild(node,check);};check(ast);
  const result=ts.transpileModule(source,{fileName:filename,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.None,verbatimModuleSyntax:true}});
  const errors=result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)??[];
  if(errors.length)throw SyntaxError(ts.formatDiagnostics(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>'.',getNewLine:()=> '\n'}));
  return result.outputText;
}
/** Trusted local TypeScript console. Node owns evaluation, bindings, writer and exit handling.
 * It is not a sandbox. Imports alone do not start it, load a project or launch Chromium.
 */
export function startFrameweaveRepl(options:ReplOptions={}){
  const output=options.output??process.stdout,session=createReplSession(options),human=cliHumanOutput(),verbose=cliVerboseOutput();
  if(options.banner!==false)output.write('Frameweave local TypeScript REPL — trusted local code, not a sandbox.\nExpressions can access Node. No project/browser/WASM is started automatically.\nProject commands: .open --trusted-local-code <path>, .stages, .time, .params <frame>, .modules, .diagnostics, .frame <frame> [--allow-wasm], .close, .exit\n');
  const server:REPLServer=start({prompt:'fw> ',input:options.input??process.stdin,output,terminal:options.terminal??!!process.stdin.isTTY,useGlobal:false,ignoreUndefined:true});
  const nativeEval=server.eval.bind(server);let pending=Promise.resolve(),ending=false;
  function commandError(error:unknown){
    const failure=error instanceof SyntaxError?new EngineError('E_ARGUMENT',error.message):error;
    output.write(human?formatHumanResult({ok:false,diagnostics:[diagnostic(failure)]},{command:'repl',args:[],verbose}):String(error)+'\n');
  }
  function enqueue(operation:()=>Promise<void>){pending=pending.then(operation).catch(commandError);return pending;}
  // Preserve Node's native REPL evaluator and lexical bindings. Its domain handles
  // synchronous runtime errors without invoking the callback; never wait for that callback.
  const evaluate:REPLServer['eval']=(source,context,filename,callback)=>{void enqueue(async()=>{
    try{const js=transpileReplInput(source,filename+'.ts');nativeEval(js,context,filename,callback);}
    catch(error){callback(error as Error,undefined);}
  });};
  if(!Reflect.set(server,'eval',evaluate))throw Error('This Node version does not permit wrapping its REPL evaluator');
  function command(name:string,help:string,action:(args:string[])=>Promise<unknown>){server.defineCommand(name,{help,action(text){void enqueue(async()=>{try{const result=await action(commandArguments(text));output.write(human?formatHumanResult(result,{command:name,args:[],verbose}):JSON.stringify(result,null,2)+'\n');}catch(error){commandError(error);}if(!ending)this.displayPrompt();});}});}
  for(const name of ['open','close','stages','time','params','modules','frame'])command(name,`Frameweave ${name} (see banner/README)`,args=>session.execute(name,args));
  command('diagnostics','Last project-command result',async args=>{if(args.length)throw SyntaxError('.diagnostics takes no arguments');return session.diagnostics();});
  server.defineCommand('exit',{help:'Drain foreground commands, then exit',action(){ending=true;void enqueue(async()=>{session.close();this.close();});}});
  const closed=new Promise<void>(resolve=>server.once('exit',()=>{void pending.finally(()=>{session.close();resolve();});}));
  return {server,closed,async close(){ending=true;await pending;session.close();server.close();await closed;}};
}
export {createReplSession} from './session.ts';
