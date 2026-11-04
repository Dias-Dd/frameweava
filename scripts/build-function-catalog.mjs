import ts from 'typescript';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/function-catalog');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const entries=Object.entries(pkg.exports).flatMap(([name,value])=>value.types?[{library:name==='.'?pkg.name:pkg.name+name.slice(1),version:pkg.version,file:resolve(root,value.types),status:'公开 SDK 声明',runtime:name.includes('/native')?'Native Stage':name.includes('/node')||name.includes('session')||name.includes('cli')||name.includes('repl')?'Node 主机':'依接口所属环境'}]:[]);
entries.push(
 {library:'pro-animation-native',version:JSON.parse(await readFile(join(root,'modules/pro-animation/native-sdk/frameweave.package.json'),'utf8')).version,file:join(root,'modules/pro-animation/native-sdk/public.ts'),status:'正式 R1 入口；未逐函数独立复验',runtime:'Native Stage / 受管理模块'},
 {library:'native-image-effects',version:'0.7.0',file:join(root,'modules/native-effects/public.ts'),status:'正式 R1 入口；未逐函数独立复验',runtime:'Native Stage / GPU 像素管线'},
 {library:'spatial-creation',version:'1.1.1',file:join(root,'modules/spatial-creation/api.d.ts'),status:'正式 R1 入口；未逐函数独立复验',runtime:'Native Stage'},
 {library:'native-2d',version:'0.1.0',file:join(root,'modules/native-2d/index.ts'),status:'正式 R1 入口；字体/复杂路径按服务合同',runtime:'Native Stage'},
 {library:'Servo（可选）',version:'source',file:join(root,'modules/servo/index.ts'),status:'可选源码入口；需单独配置 Servo runtime',runtime:'Native Stage + Servo'},
 {library:'spherical（WIP）',version:'266d2648',file:join(root,'modules/native-effects/spherical/index.ts'),status:'未验收候选；有失败/超时；非正式导出',runtime:'Native Stage / GPU'},
);
for(const name of ['deep-exr','sparse-volume']){
 const candidates=['index.ts','public.ts'];for(const file of candidates)try{await readFile(join(root,'modules',name,file));entries.push({library:name==='deep-exr'?'deep-image':name,version:'0.1.0',file:join(root,'modules',name,file),status:'已集成可选模块；专业格式/运行要求见契约',runtime:'依模块合同'});break;}catch{}
}
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,jsxImportSource:'@frameweave/engine'};
const program=ts.createProgram(entries.map(e=>e.file),options),checker=program.getTypeChecker(),rows=[],seen=new Set(),sourceHashes={};
const slash=s=>s.replaceAll('\\','/'),inside=p=>slash(relative(root,p));
function declarations(symbol){return symbol?.declarations??(symbol?.valueDeclaration?[symbol.valueDeclaration]:[]);}
function privateMember(symbol){return declarations(symbol).some(d=>d.name&&ts.isPrivateIdentifier(d.name)||d.modifiers?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword||m.kind===ts.SyntaxKind.ProtectedKeyword));}
function origin(symbol){const d=symbol?.valueDeclaration??declarations(symbol)[0];if(!d)return;const file=inside(d.getSourceFile().fileName);if(file.startsWith('../')||file.includes('node_modules/')||file.includes('/vendor/'))return;return {file,line:d.getSourceFile().getLineAndCharacterOfPosition(d.getStart()).line+1,position:d.pos};}
function signatures(type,construct=false){return construct?type.getConstructSignatures():type.getCallSignatures();}
function add(entry,name,symbol,type,role,sigs=signatures(type)){
 const at=origin(symbol);if(!at||!sigs.length)return;
 let status=entry.status;
 if(entry.library===pkg.name&&['Text','Rect','Circle','Group','Scene','Shape'].includes(name))status='旧声明式节点构造；原 Web 绘制通路已停用';
 if(entry.library==='native-2d'&&/^(text|path)$/.test(name))status='需已准备的字形/路径数据或声明的 PA 服务；非内置完整排版';
 const key=entry.library+'|'+name+'|'+role;if(seen.has(key))return;seen.add(key);
 const description=ts.displayPartsToString(symbol.getDocumentationComment(checker)).replace(/\s+/g,' ').trim();
 rows.push({library:entry.library,version:entry.version,name,role,runtime:entry.runtime,status,signature:sigs.map(s=>checker.signatureToString(s,undefined,ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)).join(' | '),description,source:at.file,line:at.line,identity:at.file+':'+at.position});
}
function awaited(type){try{return checker.getAwaitedType(type)??type;}catch{return type;}}
function callbackMethods(entry,sig,path,depth){
 for(const parameter of sig.getParameters()){
  const d=parameter.valueDeclaration??declarations(parameter)[0];if(!d)continue;const type=checker.getTypeOfSymbolAtLocation(parameter,d);
  for(const callback of signatures(type))for(const argument of callback.getParameters()){
   const a=argument.valueDeclaration??declarations(argument)[0];if(!a)continue;const t=checker.getTypeOfSymbolAtLocation(argument,a),label=checker.typeToString(t);
   if(/Filters|RecipeEffects/.test(label))container(entry,t,path+'.'+parameter.name+'.'+argument.name,'效果回调方法',depth+1,new Set());
  }
 }
}
function container(entry,type,path,role,depth,stack){
 type=awaited(type);if(depth>4||stack.has(type.id))return;stack.add(type.id);
 for(const property of checker.getPropertiesOfType(type)){
  if(privateMember(property)||['toJSON','then','catch','finally'].includes(property.name))continue;
  const at=origin(property);if(!at)continue;const d=property.valueDeclaration??declarations(property)[0],t=checker.getTypeOfSymbolAtLocation(property,d),sigs=signatures(t),name=path+'.'+property.name;
  if(sigs.length){add(entry,name,property,t,role,sigs);for(const sig of sigs){callbackMethods(entry,sig,name,depth);container(entry,checker.getReturnTypeOfSignature(sig),name+'()','返回对象方法',depth+1,stack);}}
  else if(depth<2)container(entry,t,name,role,depth+1,stack);
 }
 stack.delete(type.id);
}
for(const entry of entries){
 const source=program.getSourceFile(entry.file),module=source&&checker.getSymbolAtLocation(source);if(!module)continue;sourceHashes[inside(entry.file)]=createHash('sha256').update(await readFile(entry.file)).digest('hex');
 for(const exported of checker.getExportsOfModule(module)){
  const symbol=exported.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exported):exported,d=symbol.valueDeclaration??declarations(symbol)[0];if(!d||!(symbol.flags&ts.SymbolFlags.Value))continue;
  const type=checker.getTypeOfSymbolAtLocation(symbol,d),sigs=signatures(type);
  if(sigs.length){add(entry,exported.name,symbol,type,'命名导入函数',sigs);for(const sig of sigs){callbackMethods(entry,sig,exported.name,0);container(entry,checker.getReturnTypeOfSignature(sig),exported.name+'()','返回对象方法',0,new Set());}}
  else{const constructors=signatures(type,true);if(constructors.length&&!privateMember(symbol)&&!declarations(symbol).some(d=>ts.isClassDeclaration(d)&&d.members.some(m=>ts.isConstructorDeclaration(m)&&m.modifiers?.some(x=>x.kind===ts.SyntaxKind.PrivateKeyword||x.kind===ts.SyntaxKind.ProtectedKeyword)))){add(entry,exported.name,symbol,type,'构造入口',constructors);for(const sig of constructors)container(entry,checker.getReturnTypeOfSignature(sig),'new '+exported.name+'()','实例方法',0,new Set());}container(entry,type,exported.name,'公开对象/静态方法',0,new Set());}
 }
 // These types describe actual handles supplied by the admitted Stage/runtime.
 for(const name of ['NativeGpuScope','NativeTemporalStage','NativeStageCalls','CanvasRecorder2D']){const exp=checker.getExportsOfModule(module).find(s=>s.name===name);if(!exp)continue;const symbol=exp.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exp):exp;container(entry,checker.getDeclaredTypeOfSymbol(symbol),name,'SDK 提供的句柄方法',0,new Set());}
}
rows.sort((a,b)=>a.library.localeCompare(b.library)||a.name.localeCompare(b.name)||a.role.localeCompare(b.role));
const metadata={version:1,headBeforeCatalogCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,scope:'公开 SDK、正式库入口、返回对象/效果回调、可选 Servo；球面候选单独标记。排除私有实现、测试及第三方标准库方法。',counts:{rows:rows.length,canonicalDeclarations:new Set(rows.map(r=>r.identity)).size,namedImports:rows.filter(r=>r.role==='命名导入函数').length,unqualifiedSphericalRows:rows.filter(r=>r.library==='spherical（WIP）').length},limitations:['函数条目含工厂、辅助、别名和生命周期，不能当作视觉效果数量。','公开类型签名不等于逐函数或完整 Adobe 控制项验收；以验证状态及模块证据为准。','Source-only spherical entries retain failed acceptance and are excluded from the formal package entry.']};
await mkdir(out,{recursive:true});await writeFile(join(out,'functions.json'),JSON.stringify({metadata,rows},null,2)+'\n');
const columns=['library','version','name','role','runtime','status','signature','description','source','line'];const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await writeFile(join(out,'functions.csv'),'\ufeff'+[columns,...rows.map(r=>columns.map(k=>r[k]))].map(a=>a.map(csv).join(',')).join('\r\n')+'\r\n');
const safe=s=>String(s??'').replaceAll('|','\\|').replaceAll('\n',' ');let md='# Frameweave 函数清单\n\n'+metadata.scope+'\n\n'+metadata.limitations.map(s=>'- '+s).join('\n')+'\n';
for(const library of [...new Set(rows.map(r=>r.library))]){md+='\n## '+library+'\n\n| 函数/方法 | 类别 | 参数签名 | 状态 | 源码 |\n| --- | --- | --- | --- | --- |\n';for(const r of rows.filter(r=>r.library===library))md+='| '+[r.name,r.role,r.signature,r.status,r.source+':'+r.line].map(safe).join(' | ')+' |\n';}
await writeFile(join(out,'FUNCTIONS.md'),md);
const payload=JSON.stringify({metadata,rows}).replaceAll('<','\\u003c');
await writeFile(join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Frameweave 函数清单</title><style>body{font:15px system-ui;margin:28px;background:#f6f8fb;color:#172438}h1{margin-bottom:8px}header{position:sticky;top:0;background:#f6f8fb;padding:12px 0}input,select{padding:9px;margin:0 10px 10px 0;border:1px solid #bdc9d8;border-radius:6px}input{width:40%}table{border-collapse:collapse;width:100%;background:white}th,td{border:1px solid #dbe2eb;padding:9px;text-align:left;vertical-align:top}th{background:#e8eef7}code{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.warn{color:#a14c00}small{color:#526276}</style><h1>Frameweave 函数清单</h1><p>包含公开入口、效果回调和实例方法；函数条目数量不等于视觉效果数量。</p><header><input id="q" placeholder="按名称、签名、说明筛选"><select id="library"><option value="">所有库</option></select><select id="kind"><option value="">所有类别</option></select><span id="count"></span><br><small>球面 WIP 保留未通过状态。复杂服务、平台和资源条件仍按各接口合同执行。</small></header><table><thead><tr><th>库 / 版本</th><th>函数 / 类别</th><th>参数签名 / 说明</th><th>状态 / 源码</th></tr></thead><tbody id="rows"></tbody></table><script type="application/json" id="data">${payload}</script><script>const data=JSON.parse(document.getElementById('data').textContent);for(const [id,key]of [['library','library'],['kind','role']])for(const value of [...new Set(data.rows.map(r=>r[key]))]){const o=document.createElement('option');o.value=o.textContent=value;document.getElementById(id).append(o)}function render(){const q=document.getElementById('q').value.toLowerCase(),lib=document.getElementById('library').value,kind=document.getElementById('kind').value;const rows=data.rows.filter(r=>(!lib||r.library===lib)&&(!kind||r.role===kind)&&(!q||[r.library,r.name,r.signature,r.description].join(' ').toLowerCase().includes(q)));document.getElementById('count').textContent=rows.length+' / '+data.rows.length+' 条';const body=document.getElementById('rows');body.replaceChildren();for(const r of rows){const tr=document.createElement('tr');for(const text of [r.library+' @'+r.version,[r.name,r.role].join(String.fromCharCode(10)),[r.signature,r.description].join(String.fromCharCode(10)),[r.status,r.source+':'+r.line].join(String.fromCharCode(10))]){const td=document.createElement('td'),code=document.createElement('code');code.textContent=text;td.append(code);tr.append(td)}if(r.library.includes('WIP'))tr.className='warn';body.append(tr)}}for(const id of ['q','library','kind'])document.getElementById(id).addEventListener('input',render);render();</script></html>`);
await writeFile(join(out,'SUMMARY.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify({out,...metadata.counts}));
