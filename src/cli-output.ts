import {AsyncLocalStorage} from 'node:async_hooks';
import {EngineError} from './core/errors.ts';
import {describeCLIDiagnostic} from './cli-diagnostics.ts';
import type {Diagnostic} from './core/types.ts';

export interface CLIOutputContext {
 mode:'human'|'json';args:string[];command:string;verbose:boolean;explicitJson:boolean;issue?:EngineError;
}
const scope=new AsyncLocalStorage<CLIOutputContext>();
/** Select a presentation, never infer whether a process belongs to an Agent. */
export function selectCLIOutput(args:string[],tty=process.stdout.isTTY===true):CLIOutputContext{
 const json=args.filter(a=>a==='--json').length,human=args.filter(a=>a==='--human').length;
 const events=args.includes('--events'),verbose=args.includes('--verbose');
 const rest=args.filter(a=>!['--json','--human','--verbose'].includes(a));
 const result:CLIOutputContext={mode:json||events?'json':human||tty?'human':'json',args:rest,command:rest[0]??'help',verbose,explicitJson:json>0||events};
 if(json>1||human>1||args.filter(a=>a==='--verbose').length>1||json&&human||events&&human){
  // Honour an explicit --human for a rejected combination before any event
  // stream starts; otherwise preserve the requested JSON diagnostic channel.
  if(human&&!json)result.mode='human';
  result.issue=new EngineError('E_ARGUMENT','Choose one output mode: --human or --json; --events is a JSONL stream.');
 }
 if(rest[0]==='repl'&&json)result.issue=new EngineError('E_ARGUMENT','The interactive REPL does not produce one JSON result; use session --json for structured requests.');
 return result;
}
export function withCLIOutput<T>(context:CLIOutputContext,operation:()=>T):T{return scope.run(context,operation);}
export function cliHumanOutput(){return scope.getStore()?.mode==='human';}
export function cliJSONRequested(){return scope.getStore()?.explicitJson??false;}
export function cliVerboseOutput(){return scope.getStore()?.verbose??false;}
export function writeCLIProgress(message:string){if(cliHumanOutput())process.stderr.write(message+'\n');}
type RecordValue=Record<string,unknown>;
const record=(value:unknown):RecordValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};
const string=(value:unknown)=>typeof value==='string'?value:undefined;
const numeric=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
const bytes=(value:number)=>value>=1024**3?`${(value/1024**3).toFixed(2)} GiB`:value>=1024**2?`${(value/1024**2).toFixed(1)} MiB`:`${value} 字节`;
const labels:Record<string,string>={id:'标识',name:'名称',description:'说明',version:'版本',kind:'类别',engine:'执行环境',
 output:'输出',path:'路径',file:'文件',directory:'目录',entry:'工程',manifest:'清单',hash:'指纹',parameters:'参数',
 examples:'示例',dependencies:'依赖',resources:'资源',tags:'标签',count:'数量',total:'总数',status:'状态',note:'说明',
 message:'说明',usage:'用法',default:'默认值',minimum:'最小值',maximum:'最大值',type:'类型',required:'必填',
 input:'输入',inputs:'输入',outputs:'输出',compatible:'兼容版本',installed:'已安装',packages:'模块',items:'条目',
 results:'结果',matches:'匹配项',mode:'模式',query:'查询',steps:'步骤',ready:'已就绪',verified:'已验证'};

function diagnostics(value:unknown):Diagnostic[]{
 const root=record(value),data=record(root.data),items:Diagnostic[]=[];
 if(typeof root.code==='string'&&typeof root.message==='string')items.push(root as unknown as Diagnostic);
 for(const list of [root.diagnostics,data.diagnostics])if(Array.isArray(list))for(const d of list)if(typeof record(d).code==='string'&&typeof record(d).message==='string')items.push(d as Diagnostic);
 const seen=new Set<string>();return items.filter(d=>{const key=JSON.stringify([d.code,d.message,d.stageId,d.frame]);if(seen.has(key))return false;seen.add(key);return true;});
}
function errorText(value:unknown,verbose:boolean):string{
 const issues=diagnostics(value),lines:string[]=[];
 if(!issues.length)lines.push('操作未完成。',...fields(value));
 for(const d of issues){
  const {title,advice}=describeCLIDiagnostic(d);lines.push(`${title} [${d.code}]`);
  const position=[d.stageId===undefined?undefined:`Stage：${d.stageId}`,d.frame===undefined?undefined:`帧：${d.frame}`].filter(Boolean);
  if(position.length)lines.push(position.join(' · '));
  const details=record(d.details),budget=numeric(details.budget),perFrame=numeric(details.perFrame),fixed=numeric(details.fixed);
  if(budget!==undefined)lines.push(`当前预算：${bytes(budget)}`);
  if(perFrame!==undefined)lines.push(`单帧需要：${bytes(perFrame)}${fixed===undefined?'':`；固定资源：${bytes(fixed)}`}`);
  lines.push(`说明：${d.message}`);
  if(d.hint||advice)lines.push(`建议：${d.hint??advice}`);
  if(verbose&&d.details!==undefined)lines.push('详细信息：\n'+JSON.stringify(d.details,null,2));
 }
 const actions=record(value).suggestedActions;if(Array.isArray(actions))for(const action of actions)if(typeof action==='string')lines.push(`建议：${action}`);
 return lines.join('\n')+'\n';
}
function fields(value:unknown,indent='',seen=new WeakSet<object>()):string[]{
 if(value===null||typeof value!=='object')return [indent+String(value)];
 if(seen.has(value))return [indent+'（重复引用）'];seen.add(value);
 if(Array.isArray(value))return value.flatMap((item,i)=>{const r=record(item),manifest=record(r.manifest);
  const id=string(r.id)??string(r.ref)??string(r.name)??string(r.title)??string(manifest.id);
  if(id){const version=string(r.version)??string(manifest.version),description=string(r.description)??string(manifest.description);return [indent+id+(version?' @ '+version:'')+(description?' — '+description:'')];}
  return typeof item==='object'?[`${indent}${i+1}.`,...fields(item,indent+'  ',seen)]:[`${indent}${i+1}. ${String(item)}`];
 });
 return Object.entries(value).filter(([key])=>!['schemaVersion','ok','diagnostics'].includes(key)).flatMap(([key,item])=>{
  const label=labels[key]??key;if(item===null||typeof item!=='object')return [`${indent}${label}：${String(item)}`];
  return [`${indent}${label}：`,...fields(item,indent+'  ',seen)];
 });
}
function signatureLines(name:unknown,value:unknown):string[]{
 if(!Array.isArray(value))return [];
 return value.map(item=>{
  const signature=record(item),parameters=Array.isArray(signature.parameters)?signature.parameters:[];
  return `  ${name}(${parameters.map(value=>{
   const parameter=record(value);return `${parameter.name}${parameter.optional?'?':''}: ${parameter.type}`;
  }).join(', ')}) → ${signature.returns}`;
 });
}
function contractLines(value:unknown):string[]{
 const contract=record(value);
 return [...typeof contract.input==='string'?[`  输入 ${contract.input}`]:[],...typeof contract.output==='string'?[`  输出 ${contract.output}`]:[]];
}
function functionSearchLines(hit:unknown):string[]{
 const item=record(hit),pkg=record(item.package);
 const versions=Array.isArray(pkg.installedVersions)?pkg.installedVersions:[];
 const status=pkg.installation==='program'?' · 程序库已安装':pkg.installed?' · 工程锁已安装':
   versions.length?` · 已有版本 ${versions.join(', ')}，此版本可另行选择`:item.install?' · 官方目录可安装':'';
 const level=item.level==='low-level'?' · 底层':item.level==='reference'?' · API 参考':'';
 return [
  `${item.name} (${pkg.reference})${level}${status}`,
  `  ${item.description}`,
  ...contractLines(item.contract),...signatureLines(item.name,item.signatures),
  ...[item.import,item.exampleKind==='project-file'?`包内示例 ${item.example}`:item.example].filter((value):value is string=>typeof value==='string').flatMap(value=>value.split('\n').map(line=>'  '+line)),
 ];
}
export function formatHumanResult(value:unknown,context:Pick<CLIOutputContext,'command'|'args'|'verbose'>={command:'',args:[],verbose:false}):string{
 const root=record(value),envelope=root.schemaVersion===1&&typeof root.ok==='boolean'&&Array.isArray(root.diagnostics)&&Object.hasOwn(root,'data'),data=envelope?root.data:value,p=record(data);
 const issues=diagnostics(value),failed=root.ok===false||p.ok===false||root.severity==='error';
 if(failed)return errorText(value,context.verbose);
 const lines:string[]=[],path=string(p.output),preview=string(p.preview),command=context.command;
 if(preview){
  lines.push(context.args.includes('--no-open')?'预览已就绪（未打开窗口）。':'预览窗口已打开。');
  if(p.entry)lines.push(`工程：${p.entry}`);
  if(!context.args.includes('--no-watch'))lines.push('保存源码后会自动更新。');lines.push('按 Ctrl+C 结束预览。');
 }else if(path){
  const frame=numeric(p.frame)??numeric(p.startFrame);
  if(command==='storyboard'||Array.isArray(p.frames))lines.push('故事板已生成。');
  else if(/\.wav$/i.test(path))lines.push('音频已导出。');
  else if(/\.(mp4|mov|webm)$/i.test(path))lines.push('视频已导出。');
  else if(frame!==undefined&&/\.(png|exr|jpe?g)$/i.test(path))lines.push(`第 ${frame} 帧已保存。`);
  else lines.push('输出已保存。');
  lines.push(`文件：${path}`);
  if(Array.isArray(p.frames))lines.push(`画面：${p.frames.length} 格`);else if(numeric(p.frames)!==undefined)lines.push(`帧数：${p.frames}`);
  const stats=record(p.stats),source=record(stats.sourceOutput),meta=record(p.metadata);
  const w=numeric(p.width)??numeric(meta.width)??numeric(source.width),h=numeric(p.height)??numeric(meta.height)??numeric(source.height);
  if(w!==undefined&&h!==undefined)lines.push(`画幅：${w} × ${h}`);
  const timings=record(p.timings),ms=numeric(timings.totalMs),seconds=numeric(p.elapsedSeconds);
  if(ms!==undefined||seconds!==undefined)lines.push(`总耗时：${((ms??seconds!*1000)/1000).toFixed(2)} 秒`);
 }else if(p.manifest&&command==='build'){
  lines.push('工程构建完成。',`清单：${p.manifest}`);if(Array.isArray(p.stages))lines.push(`Stage：${p.stages.length} 个`);
 }else if(command==='workflow'){
  lines.push('默认创作流程：');
  const names:Record<string,string>={discover:'查找效果',inspect:'查看用法',create:'编写效果',validate:'检查效果',register:'注册到工程',pin:'固定版本',promote:'加入共享库',export:'导出工程'};
  for(const [key,value]of Object.entries(record(p.commands)))lines.push(`${names[key]??key}：frameweave ${value}`);
  if(p.userLibrary)lines.push(`共享库：${p.userLibrary}`);
  lines.push('完整规则可用 --verbose 或 --json 查看。');
 }else if(command==='capabilities'&&Array.isArray(p.functions)&&Array.isArray(p.items)){
  const page=record(p.functionPage);
  const presetPage=record(p.presetPage),presets=Array.isArray(p.presets)?p.presets:[];
  if(p.functions.length||!presetPage.total)
   lines.push(`本页 ${p.functions.length} 个函数，共匹配 ${page.total??p.functions.length} 个。`);
  if(presetPage.total)lines.push(`本页 ${presets.length} 个预设，共匹配 ${presetPage.total} 个。`);
  for(const value of presets){
   const preset=record(value);
   const label=`${preset.name} · ${preset.callable} 预设`;
   if(preset.package)lines.push(...functionSearchLines({...preset,name:label}));
   else lines.push(`${label} · SDK`,`  ${preset.description}`,`  ${preset.import}`,`  ${preset.example}`,
    ...typeof preset.requires==='string'?[`  ${preset.requires}`]:[]);
  }
  for(const value of Array.isArray(p.entrypoints)?p.entrypoints:[]){
   const entry=record(value);
   lines.push(`${entry.name} · ${entry.availability==='sdk'?'SDK 入口':'源码入口'}`,`  ${entry.description}`,
    ...contractLines(entry.contract),...signatureLines(entry.name,entry.signatures),
    ...[entry.import,entry.example,entry.documentation].filter(value=>typeof value==='string').map(value=>'  '+value));
  }
  for(const hit of p.functions)lines.push(...functionSearchLines(hit));
  const sdkPage=record(p.sdkPage);
  if(Array.isArray(p.sdkReferences)&&p.sdkReferences.length){
   lines.push(`SDK 函数本页 ${p.sdkReferences.length} 个，共匹配 ${sdkPage.total} 个。`);
   for(const value of p.sdkReferences){
    const item=record(value);lines.push(`${item.name} · SDK`,...typeof item.description==='string'?[`  ${item.description}`]:[],
     ...signatureLines(item.name,item.signatures),`  ${item.import}`);
   }
  }
  const apiGroups=Array.isArray(p.apiGroups)?p.apiGroups:[];
  if(apiGroups.length){
   const names=new Set(apiGroups.flatMap(group=>{const methods=record(group).methods;return Array.isArray(methods)?methods:[];}));
   lines.push(`另有 ${names.size} 个公开方法名，按实际调用入口分组。`);
  }
  for(const value of apiGroups){
   const recipe=record(value),methods=Array.isArray(recipe.methods)?recipe.methods:[];
   lines.push(`${recipe.path} (${recipe.package}) · ${methods.length} 个公开方法`,`  ${methods.join(', ')}`);
   for(const [method,signatures] of Object.entries(record(recipe.signatures)))lines.push(...signatureLines(method,signatures));
  }
  const next=[page.nextOffset,sdkPage.nextOffset,presetPage.nextOffset].find(value=>typeof value==='number');
  if(typeof next==='number')lines.push(`下一页加 --offset ${next}`);
  if(p.items.length)lines.push(...fields(p.items));
 }else if(command==='effects'&&Array.isArray(data)&&data.some(hit=>record(hit).resultType==='function')){
  lines.push(`找到 ${data.length} 项。`);
  for(const hit of data)lines.push(...(record(hit).resultType==='function'?functionSearchLines(hit):fields([hit])));
 }else{
  lines.push(Array.isArray(data)?`找到 ${data.length} 项。`:command==='doctor'?'环境检查完成。':'操作完成。');
  lines.push(...fields(data));
 }
 for(const d of issues)if(d.severity==='warning'||d.severity==='error')lines.push(`${d.severity==='error'?'问题':'提醒'}：${d.message} [${d.code}]`);
 if(context.verbose&&!(root.severity==='error'))lines.push('原始结果：\n'+JSON.stringify(value,null,2));
 return lines.join('\n')+'\n';
}
/** Formatting only. Service values and sidecar JSON are never rewritten. */
export function writeCLIResult<T>(value:T,options:{stream?:'stdout'|'stderr';pretty?:boolean}={}):T{
 const context=scope.getStore(),root=record(value),failed=root.ok===false||root.severity==='error'||record(root.data).ok===false;
 const stream=options.stream??(context?.mode==='human'&&failed?'stderr':'stdout');
 process[stream].write(context?.mode==='human'?formatHumanResult(value,context):JSON.stringify(value,null,options.pretty===false?undefined:2)+'\n');
 return value;
}
