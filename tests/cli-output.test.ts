import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdir,mkdtemp,writeFile,access} from 'node:fs/promises';
import {PassThrough} from 'node:stream';
import {startFrameweaveRepl} from '../modules/repl/index.ts';
import {selectCLIOutput,withCLIOutput,cliHumanOutput,formatHumanResult} from '../src/cli-output.ts';
import {emitAgentResult,type AgentIO} from '../src/agent/result.ts';
const exec=promisify(execFile),root=resolve('.');
test('terminal selection is explicit and independent of caller identity',()=>{
 assert.equal(selectCLIOutput(['frame','x.tsx'],true).mode,'human');
 assert.equal(selectCLIOutput(['frame','x.tsx'],false).mode,'json');
 assert.equal(selectCLIOutput(['frame','x.tsx','--json'],true).mode,'json');
 assert.equal(selectCLIOutput(['frame','x.tsx','--human'],false).mode,'human');
 assert.deepEqual(selectCLIOutput(['frame','x.tsx','--json'],true).args,['frame','x.tsx']);
 assert.equal(selectCLIOutput(['analyze','run','x','--events'],true).mode,'json');
 assert.equal(selectCLIOutput(['frame','x.tsx','--json','--human']).issue?.code,'E_ARGUMENT');
 assert.equal(selectCLIOutput(['analyze','run','x','--events','--human']).issue?.code,'E_ARGUMENT');
 assert.equal(selectCLIOutput(['repl','--json']).issue?.code,'E_ARGUMENT');
});
test('human success identifies exact file, frame zero and elapsed time without changing the result',()=>{
 const result={ok:true,output:'C:/art/frame.png',startFrame:0,frames:1,timings:{totalMs:1234},stats:{sourceOutput:{width:1920,height:1080}},diagnostics:[]};
 const original=structuredClone(result),text=formatHumanResult(result,{command:'frame',args:[],verbose:false});
 assert.match(text,/第 0 帧已保存/);assert.match(text,/C:\/art\/frame.png/);assert.match(text,/1920 × 1080/);assert.match(text,/1.23 秒/);
 assert.doesNotMatch(text,/"stats"/);assert.deepEqual(result,original);
});
test('human errors retain stable code, frame/stage, measured budget and a repair action',()=>{
 const error={ok:false,diagnostics:[{code:'E_NATIVE_BUDGET',severity:'error',message:'One native frame exceeds the memory budget',stageId:'world',frame:0,details:{budget:1024**3,perFrame:1560916316,fixed:259484}}]};
 const text=formatHumanResult(error);assert.match(text,/当前运行预算不足/);assert.match(text,/E_NATIVE_BUDGET/);assert.match(text,/Stage：world · 帧：0/);assert.match(text,/1.00 GiB/);assert.match(text,/--memory-mib/);
 assert.doesNotMatch(text,/"budget"/);
 const verbose=formatHumanResult(error,{command:'frame',args:[],verbose:true});assert.match(verbose,/详细信息/);assert.match(verbose,/"budget"/);
});
test('explicit AgentIO keeps the original JSON envelope and stderr/exit contract inside a human scope',()=>{
 const capture={stdout:'',stderr:'',code:-1},io:AgentIO={stdout:s=>capture.stdout+=s,stderr:s=>capture.stderr+=s,setExitCode:c=>capture.code=c};
 const result={schemaVersion:1 as const,ok:false as const,data:null,diagnostics:[{code:'E_ARGUMENT',severity:'error' as const,message:'bad input'}]};
 withCLIOutput(selectCLIOutput(['--human']),()=>emitAgentResult(result,io));
 assert.deepEqual(JSON.parse(capture.stdout),result);assert.equal(capture.stderr,'E_ARGUMENT: bad input\n');assert.equal(capture.code,1);
});
test('concurrent output contexts cannot leak presentation into each other',async()=>{
 const values=await Promise.all([true,false].map(human=>withCLIOutput(selectCLIOutput(human?['--human']:['--json']),async()=>{
  await new Promise<void>(r=>setImmediate(r));return cliHumanOutput();
 })));assert.deepEqual(values,[true,false]);assert.equal(cliHumanOutput(),false);
});
test('human REPL presentation survives input callbacks outside the original CLI async context',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',s=>text+=s.toString());
 const repl=withCLIOutput(selectCLIOutput(['repl','--human']),()=>startFrameweaveRepl({input,output,terminal:false,banner:false}));
 // These writes deliberately originate outside withCLIOutput, as terminal events do.
 input.write('.stages\n.exit\n');await repl.closed;
 assert.match(text,/尚未打开可用工程/);assert.match(text,/E_REPL/);assert.doesNotMatch(text,/"schemaVersion"/);
});
test('list/preview/workflow summaries remain useful and preview does not claim a hidden window opened',()=>{
 assert.match(formatHumanResult([{id:'example.glow',version:'1.0.0',description:'Soft glow'}]),/example.glow @ 1.0.0 — Soft glow/);
 const preview=formatHumanResult({preview:'native://frameweave/scene',entry:'scene.tsx'},{command:'scene.tsx',args:['scene.tsx','--no-open'],verbose:false});assert.match(preview,/未打开窗口/);assert.doesNotMatch(preview,/窗口已打开/);
 const text=formatHumanResult({commands:{discover:'effects search "intent"'},policy:'PRIVATE LONG POLICY'},{command:'workflow',args:['workflow'],verbose:false});assert.match(text,/查找效果/);assert.doesNotMatch(text,/PRIVATE LONG POLICY/);
});
async function cli(args:string[]){try{const r=await exec(process.execPath,['--import','tsx','src/cli.ts',...args],{cwd:root,windowsHide:true,maxBuffer:2*1024**2,timeout:20000});return {...r,code:0};}catch(e){return e as unknown as {stdout:string;stderr:string;code:number};}}
test('real CLI human errors use stderr and a failing exit; machine errors stay parseable',async()=>{
 const [human,machine]=await Promise.all([cli(['frame','--human']),cli(['frame','--json'])]);
 assert.equal(human.code,1);assert.equal(human.stdout,'');assert.match(human.stderr,/命令参数不正确/);assert.match(human.stderr,/E_ARGUMENT/);
 assert.equal(machine.code,1);assert.equal(machine.stdout,'');const error=JSON.parse(machine.stderr);assert.equal(error.ok,false);assert.equal(error.diagnostics[0].code,'E_ARGUMENT');
});
test('real CLI readable success and explicit machine success; non-TTY defaults remain JSON',async()=>{
 const [human,machine,automatic]=await Promise.all([cli(['workflow','--human']),cli(['version','--json']),cli(['workflow'])]);
 assert.equal(human.code,0);assert.match(human.stdout,/默认创作流程/);assert.doesNotMatch(human.stdout,/^\{/);
 assert.equal(machine.code,0);assert.equal(JSON.parse(machine.stdout).data.version,JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version);
 assert.equal(automatic.code,0);assert.equal(JSON.parse(automatic.stdout).version,1);
});
test('ACL errors and analysis JSONL preserve their existing machine channels',async()=>{
 const [acl,events,human]=await Promise.all([cli(['capabilities','inspect','--json']),cli(['analyze','unknown','--events']),cli(['capabilities','inspect','--human'])]);
 assert.equal(acl.code,1);assert.equal(JSON.parse(acl.stdout).schemaVersion,1);assert.equal(JSON.parse(acl.stdout).ok,false);assert.match(acl.stderr,/E_ARGUMENT/);
 assert.equal(events.code,1);assert.equal(events.stdout,'');assert.equal(events.stderr.trim().split(/\r?\n/).length,1);assert.equal(JSON.parse(events.stderr).diagnostics[0].code,'E_ARGUMENT');
 assert.equal(human.code,1);assert.equal(human.stdout,'');assert.match(human.stderr,/命令参数不正确/);
});
test('real build success names an existing manifest; human and JSON preserve the same service data',async()=>{
 const base=resolve(root,'.frameweave/cli-output-tests');await mkdir(base,{recursive:true});
 const directory=await mkdtemp(resolve(base,'case-')),entry=resolve(directory,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
export const image=defineNativeStage(async({gpu})=>{const kernel=await gpu.compile({abiVersion:1,id:'test/cli-source',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.);}'});return {renderAt(){return gpu.run(kernel,[],{output:{width:16,height:16,format:'rgba32float',alpha:'opaque',color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}}});}};});
export default <Composition width={16} height={16} fps={24} durationInFrames={1}>
<Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
 const human=await cli(['build',entry,'--human']);assert.equal(human.code,0,human.stderr);assert.match(human.stdout,/工程构建完成/);
 const machine=await cli(['build',entry,'--json']);assert.equal(machine.code,0,machine.stderr);const result=JSON.parse(machine.stdout);
 assert.equal(result.ok,true);assert.equal(result.stages.length,1);await access(result.manifest);assert.ok(human.stdout.includes(result.manifest));
});
