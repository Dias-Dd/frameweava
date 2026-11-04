// SPDX-License-Identifier: Apache-2.0
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export const inside=(root,file)=>{const rel=relative(root,file);return rel!== '..'&&!rel.startsWith('../')&&!rel.startsWith('..\\')&&!isAbsolute(rel);};
const globals=new Set(['undefined','NaN','Infinity','Object','Symbol','Error','TypeError','RangeError','WebAssembly','FinalizationRegistry','TextDecoder','TextEncoder','Uint8Array','Uint32Array','Int32Array','Float32Array','Float64Array','ArrayBuffer','DataView','Math','Number','String','Boolean','Array','console']);
/** Semantic name resolution, not a regex claiming to sandbox arbitrary JS. */
export function auditSource(ts,text,{snippet=false,file='binding.mjs'}={}){
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),normalized=file.replaceAll('\\','/');
  const host=ts.createCompilerHost({allowJs:true,noLib:true});host.getSourceFile=name=>name.replaceAll('\\','/')===normalized?source:undefined;
  const program=ts.createProgram([file],{allowJs:true,noLib:true,noEmit:true,types:[]},host),checker=program.getTypeChecker();
  const allowed=snippet?new Set(['undefined','Math','Number','String']):globals;
  const deniedProperties=new Set(['constructor','__proto__','random']);
  function visit(node){
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)&&node.moduleSpecifier||ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)
      fail('E_BINDGEN_POLICY',`${file}: runtime imports must be bundled and explicitly collected`);
    if(snippet&&(ts.isElementAccessExpression(node)||ts.isNewExpression(node)))fail('E_BINDGEN_POLICY',`${file}: snippet permits primitive operations, not computed host access/constructors`);
    if(ts.isPropertyAccessExpression(node)&&(deniedProperties.has(node.name.text)||snippet&&!['trim','toUpperCase','toLowerCase','length','abs','min','max','sqrt','floor','ceil','isFinite'].includes(node.name.text)))
      fail('E_BINDGEN_POLICY',`${file}: unsupported property ${node.name.text}`);
    if(ts.isIdentifier(node)){
      const parent=node.parent;
      const property=ts.isPropertyAccessExpression(parent)&&parent.name===node||ts.isPropertyAssignment(parent)&&parent.name===node||ts.isMethodDeclaration(parent)&&parent.name===node||ts.isLabeledStatement(parent);
      if(!property){const symbol=checker.getSymbolAtLocation(node),local=symbol?.declarations?.some(d=>d.getSourceFile()===source);
        if(!local&&!allowed.has(node.text))fail('E_BINDGEN_POLICY',`${file}: undeclared/ambient host name ${node.text}`);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  return source;
}
export function intrinsicBodies(ts,text){
  const source=ts.createSourceFile('raw-glue.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),result={};
  const printer=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed});
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='import0'&&node.initializer&&ts.isObjectLiteralExpression(node.initializer)){
    for(const prop of node.initializer.properties)if(ts.isPropertyAssignment(prop)&&ts.isFunctionExpression(prop.initializer)){
      const name=prop.name.getText(source).replace(/^['"]|['"]$/g,''),body=printer.printNode(ts.EmitHint.Expression,prop.initializer,source);
      result[name]={sha256:sha(body),body};
    }
  }ts.forEachChild(node,visit);}visit(source);return result;
}
export async function auditBindings(root,settings,ts){
  const directory=join(root,'dist/generated'),raw=await readFile(join(directory,'module.js'),'utf8');
  const policy=JSON.parse(await readFile(join(root,'import-policy.json'),'utf8'));
  if(policy.revision!==1||policy.generator!==settings.wasmBindgen)fail('E_BINDGEN_POLICY','Unsupported intrinsic policy revision/generator');
  const bodies=intrinsicBodies(ts,raw),compiled=await WebAssembly.compile(await readFile(join(directory,'module_bg.wasm')));
  const imports=WebAssembly.Module.imports(compiled).map(({module,name,kind})=>({module,name,kind})).sort((a,b)=>{const x=a.module+'\0'+a.name,y=b.module+'\0'+b.name;return x<y?-1:x>y?1:0;});
  const snippets=new Map();
  const source=ts.createSourceFile('module.js',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const jsImports=source.statements.filter(n=>ts.isImportDeclaration(n));
  async function snippet(module){
    if(snippets.has(module))return snippets.get(module);
    if(!module.startsWith('./snippets/'))fail('E_BINDGEN_IMPORTS',`Undeclared JS import ${module}`);
    const file=resolve(directory,module);if(!inside(directory,file))fail('E_BINDGEN_IMPORTS','Snippet escapes generated directory');
    const key=Object.keys(settings.snippets).find(name=>module.endsWith('/'+name));if(!key)fail('E_BINDGEN_IMPORTS',`Snippet not declared: ${module}`);
    const bytes=await readFile(file),authored=await readFile(join(root,'rust',key));
    if(sha(bytes)!==settings.snippets[key].sha256||sha(authored)!==settings.snippets[key].sha256)fail('E_BINDGEN_POLICY',`Snippet source changed; review its explicit hash: ${key}`);
    const ast=auditSource(ts,bytes.toString(),{snippet:true,file:key});
    const names=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>n.name?.text);
    const record={path:relative(root,file).replaceAll('\\','/'),source:key,sha256:sha(bytes),exports:names};snippets.set(module,record);return record;
  }
  for(const declaration of jsImports){const record=await snippet(declaration.moduleSpecifier.text),bindings=declaration.importClause?.namedBindings;
    if(bindings&&ts.isNamedImports(bindings))for(const element of bindings.elements)if(!record.exports.includes((element.propertyName??element.name).text))fail('E_BINDGEN_IMPORTS','Undeclared snippet export');
  }
  for(const item of imports){
    if(item.kind!=='function')fail('E_BINDGEN_IMPORTS','Data profile permits function imports only, no imported memory/table/global');
    if(item.module==='./module_bg.js'){
      if(!bodies[item.name]||!policy.intrinsics[item.name]?.includes(bodies[item.name].sha256))
        fail('E_BINDGEN_IMPORTS',`Unreviewed wasm-bindgen intrinsic ${item.name}: ${JSON.stringify(bodies[item.name])}`);
    }else{
      const record=await snippet(item.module);if(!record.exports.includes(item.name))fail('E_BINDGEN_IMPORTS',`Snippet does not export function ${item.name}`);
    }
  }
  // Also reject unused ambient or missing imported JS; bundler handles relative graph collection.
  for(const statement of source.statements)if(ts.isImportDeclaration(statement)){
    const name=statement.moduleSpecifier.text;if(!snippets.has(name))fail('E_BINDGEN_IMPORTS',`Unreviewed JS import ${name}`);
  }
  return {imports,snippets:[...snippets.values()].sort((a,b)=>a.path.localeCompare(b.path)),intrinsics:Object.fromEntries(imports.filter(i=>i.module==='./module_bg.js').map(i=>[i.name,bodies[i.name]]))};
}
export function publicApi(ts,text,entryClass){
  const source=ts.createSourceFile('module.d.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const klass=source.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===entryClass);
  if(!klass)fail('E_BINDGEN_TYPES',`Generated declaration lacks class ${entryClass}`);
  const allowed=/^(?:void|number|string|boolean|Uint8Array|Uint32Array|Int32Array|Float32Array|Float64Array)(?:\s*\|\s*undefined)?$/;
  const methods=[];
  for(const member of klass.members)if(ts.isMethodDeclaration(member)&&ts.isIdentifier(member.name)&&member.name.text!=='free'){
    if(member.modifiers?.some(m=>m.kind===ts.SyntaxKind.StaticKeyword)||!member.type||!allowed.test(member.type.getText(source)))fail('E_BINDGEN_TYPES','Profile supports instance methods returning primitive data or typed arrays');
    if(['dispose','diagnostics','constructor','__proto__','prototype'].includes(member.name.text))fail('E_BINDGEN_TYPES','Reserved public method name');
    for(const param of member.parameters)if(!param.type||!allowed.test(param.type.getText(source)))fail('E_BINDGEN_TYPES',`Unsupported generated argument type in ${member.name.text}`);
    methods.push({name:member.name.text,signature:member.getText(source),documentation:member.jsDoc?.map(doc=>typeof doc.comment==='string'?doc.comment:'').join('\n')??''});
  }
  if(!methods.length||!klass.members.some(n=>ts.isConstructorDeclaration(n)&&n.parameters.length===0))fail('E_BINDGEN_TYPES','Expected a no-argument constructor and public data methods');
  return methods;
}
