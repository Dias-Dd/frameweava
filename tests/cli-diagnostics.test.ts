import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {PassThrough} from 'node:stream';
import {describeCLIDiagnostic} from '../src/cli-diagnostics.ts';
import {formatHumanResult,selectCLIOutput,withCLIOutput} from '../src/cli-output.ts';
import {startFrameweaveRepl} from '../modules/repl/index.ts';

const exec=promisify(execFile);
const failure=(code:string,message='ORIGINAL_REASON',extra:Record<string,unknown>={})=>({ok:false,diagnostics:[{code,message,severity:'error',...extra}]});

test('runtime source error codes all receive a cause category or a named subsystem and actionable advice',async()=>{
 const files=execFileSync('git',['ls-files','src','modules','bin'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)
  .filter(p=>/\.(?:ts|tsx|js|mjs|rs)$/.test(p)&&p!=='src/cli-diagnostics.ts'&&!/(?:^|\/)(?:validation|tests?|vendor|licenses|runtime|evidence)\//.test(p));
 const codes=new Map<string,string[]>();
 await Promise.all(files.map(async file=>{
  for(const match of (await readFile(file,'utf8')).matchAll(/\bE_[A-Z][A-Z0-9_]*[A-Z0-9]\b/g)){
   const paths=codes.get(match[0])??[];if(!paths.includes(file))paths.push(file);codes.set(match[0],paths);
  }
 }));
 const entries=[...codes].sort(([a],[b])=>a.localeCompare(b)).map(([code,files])=>({code,files,...describeCLIDiagnostic({code,message:''})}));
 const uncovered=entries.filter(e=>e.coverage==='fallback');
 const counts:Record<string,number>={};for(const e of entries)counts[e.coverage]=(counts[e.coverage]??0)+1;
 await mkdir('artifacts/cli-diagnostics',{recursive:true});
 await writeFile('artifacts/cli-diagnostics/coverage.json',JSON.stringify({source:'tracked runtime TS/JS/Rust; excludes tests, validation, vendor, generated runtime and this catalog',files:files.length,total:entries.length,counts,uncovered,entries},null,2));
 assert.ok(entries.length>1000,'the audit must include the actual effect/runtime source, not just a hand-picked fixture');
 assert.deepEqual(uncovered,[],'new error families need a meaningful human explanation');
 for(const e of entries){assert.match(e.title,/[\u4e00-\u9fff]/,e.code);assert.match(e.advice,/[\u4e00-\u9fff]/,e.code);assert.notEqual(e.title,'操作失败。',e.code);}
});

test('representative user problems explain migration, media, fonts, GPU and transactions without hiding the original cause',()=>{
 const cases:readonly [string,RegExp,RegExp][]=[
  ['E_WEB_REMOVED',/移除旧 Web Stage/,/Servo/],
  ['E_ENGINE_CONFLICT',/没有共同兼容/,/独立 Stage/],
  ['E_PORT_TYPE',/类型不兼容/,/PCM/],
  ['E_OUTPUT_EMPTY',/没有已放置/,/Layer/],
  ['E_PA_FONT_MISSING_GLYPH',/字体不包含所需的字形/,/字体覆盖范围/],
  ['E_NATIVE_FONT_IMAGE_COLOR',/字体内嵌图像.*色彩/,/精度/],
  ['E_AUDIO_TIME_MAPPING',/音频处理.*时间/,/采样率/],
  ['E_GPU_UNAVAILABLE',/GPU/,/不能用软件或 SDR 回退/],
  ['E_NATIVE_SEGMENT_FAILED',/会话已不可继续/,/重新打开/],
  ['E_NATIVE_BINARY_PERMISSION',/权限/,/声明/],
 ];
 for(const [code,title,advice] of cases){
  const text=formatHumanResult(failure(code,'Original explanation',{stageId:'title',frame:0}));
  assert.match(text,title,code);assert.match(text,advice,code);assert.ok(text.includes(code));
  assert.match(text,/说明：Original explanation/);assert.match(text,/Stage：title · 帧：0/);
 }
});

test('integrity and permission explanations take precedence over incidental words and never suggest bypassing checks',()=>{
 const integrity=formatHumanResult(failure('E_PACKAGE_INTEGRITY','ENOENT: package source missing'));
 assert.match(integrity,/完整性校验/);assert.match(integrity,/不要删除校验/);assert.doesNotMatch(integrity,/找不到需要的文件/);
 const wasm=formatHumanResult(failure('E_WASM_PERMISSION'));
 assert.match(wasm,/审阅工程/);assert.match(wasm,/--allow-wasm/);
 const lock=formatHumanResult(failure('E_RUNTIME_LOCK'));assert.match(lock,/不要.*盲目刷新锁文件/);
 const budget=formatHumanResult(failure('E_NATIVE_FONT_IMAGE_BUDGET'));assert.match(budget,/对应预算/);assert.doesNotMatch(budget,/--memory-mib/);
});

test('filesystem and future unknown errors have useful fallback advice and producer hints remain authoritative',()=>{
 for(const [message,expected] of [['ENOENT: missing font.ttf',/找不到/],['EPERM: output file',/系统拒绝/],['ENOSPC: write',/存储空间/]] as const)
  assert.match(formatHumanResult(failure('E_INTERNAL',message)),expected);
 const value=failure('E_FUTURE_CUSTOM_PROBLEM','Plugin detail',{hint:'请调整插件自己的 quality 参数',details:{privateValue:42}}),before=structuredClone(value);
 const text=formatHumanResult(value);assert.match(text,/未识别的错误/);assert.match(text,/说明：Plugin detail/);assert.match(text,/建议：请调整插件自己的 quality 参数/);
 assert.doesNotMatch(text,/privateValue/);assert.deepEqual(value,before);
 const verbose=formatHumanResult(value,{command:'frame',args:[],verbose:true});assert.match(verbose,/privateValue/);
});

test('REPL project command parse errors use human diagnostics outside the CLI async context and later commands still run',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',part=>text+=part.toString());
 const repl=withCLIOutput(selectCLIOutput(['repl','--human']),()=>startFrameweaveRepl({input,output,terminal:false,banner:false}));
 input.write('.open "unclosed\n.diagnostics extra\n.stages\n1+1\n.exit\n');await repl.closed;
 assert.match(text,/命令参数不正确.*E_ARGUMENT/);assert.match(text,/Unclosed command argument quote/);
 assert.match(text,/\.diagnostics takes no arguments/);assert.match(text,/尚未打开可用工程.*E_REPL_PROJECT/);assert.match(text,/^2$/m);
 assert.doesNotMatch(text,/"schemaVersion"/);
});

test('REPL non-human command errors and ordinary TypeScript evaluation keep their original presentation',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',part=>text+=part.toString());
 const repl=withCLIOutput(selectCLIOutput(['repl']),()=>startFrameweaveRepl({input,output,terminal:false,banner:false}));
 input.write('.open "unclosed\nthrow Error("ORDINARY_TS_ERROR")\n1+1\n.exit\n');await repl.closed;
 assert.match(text,/SyntaxError: Unclosed command argument quote/);assert.match(text,/ORDINARY_TS_ERROR/);assert.match(text,/fw> 2/);
 assert.doesNotMatch(text,/命令参数不正确/);
});

async function extensionCLI(mode:string){
 const script=`import {runCLI} from './src/cli-entry.ts';import {EngineError} from './src/core/errors.ts';await runCLI(['extension',${JSON.stringify(mode)}],{extension:async()=>{await Promise.resolve();throw new EngineError('E_NATIVE_FONT_IMAGE_COLOR','ORIGINAL_EXTENSION_REASON',{stageId:'letters',frame:3});}});`;
 try{const value=await exec(process.execPath,['--import','tsx','--input-type=module','--eval',script],{windowsHide:true,timeout:20000,maxBuffer:1024**2});return {...value,code:0};}
 catch(error){return error as unknown as {stdout:string;stderr:string;code:number};}
}
test('asynchronously rejected CLI extensions pass through the unified formatter and preserve JSON/exit contracts',async()=>{
 const [human,json]=await Promise.all([extensionCLI('--human'),extensionCLI('--json')]);
 assert.equal(human.code,1);assert.equal(human.stdout,'');assert.match(human.stderr,/字体内嵌图像.*色彩/);assert.match(human.stderr,/Stage：letters · 帧：3/);
 assert.equal(json.code,1);assert.equal(json.stdout,'');const envelope=JSON.parse(json.stderr);
 assert.equal(envelope.diagnostics[0].code,'E_NATIVE_FONT_IMAGE_COLOR');assert.equal(envelope.diagnostics[0].message,'ORIGINAL_EXTENSION_REASON');
 assert.doesNotMatch(json.stderr,/色彩、透明度/);
});

test('removed Web CLI commands explain the actual migration while JSON retains the original diagnostic',async()=>{
 async function invoke(mode:string){
  try{const result=await exec(process.execPath,['--import','tsx','src/cli.ts','browser',mode],{windowsHide:true,timeout:20000});return {...result,code:0};}
  catch(error){return error as unknown as {stdout:string;stderr:string;code:number};}
 }
 const [human,json]=await Promise.all([invoke('--human'),invoke('--json')]);
 assert.equal(human.code,1);assert.equal(human.stdout,'');assert.match(human.stderr,/已移除旧 Web Stage/);assert.match(human.stderr,/Servo/);
 assert.equal(json.code,1);const result=JSON.parse(json.stderr);assert.equal(result.diagnostics[0].code,'E_WEB_REMOVED');
 assert.equal(result.diagnostics[0].message,'Chromium installation and Web Stages were removed; HTML/CSS runs in the Servo module.');
});
