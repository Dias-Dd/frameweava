import {runtimeCachePath} from '../runtime/paths.ts';
import ts from 'typescript';
import {readFile,stat,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {inside,type InstalledPlugin} from '../plugins/registry.ts';
import {parameters} from '../plugins/schema.ts';
import {v2Parameters} from '../plugins/parameters-v2.ts';
import {keyframes} from '../core/animation.ts';
import {EngineError,diagnostic} from '../core/errors.ts';
import {typecheckProject} from '../compiler/typecheck.ts';
import {engineRoot} from '../compiler/build.ts';
import type {CapabilityExample} from './types.ts';

const hash=(bytes:string|Uint8Array)=>'sha256-'+createHash('sha256').update(bytes).digest('hex');
export async function smallFile(record:InstalledPlugin,path:string,limit=65536):Promise<string|null>{
  try{await stat(join(record.directory,path));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  const file=await inside(record.directory,path);if((await stat(file)).size>limit)throw new EngineError('E_CAPABILITY_BUDGET',`${path} exceeds ${limit} bytes`,{details:{path,limit}});
  return readFile(file,'utf8');
}
export async function kitConfiguration(record:InstalledPlugin){
  const text=await smallFile(record,'module.config.json');if(text===null)return null;
  try{const c=JSON.parse(text);return ['worker','direct'].includes(c.execution)&&(c.kitVersion===1&&c.binding==='bytes-v1'||c.kitVersion===2&&c.binding==='wasm-bindgen-data-v1')?c:null;}catch{return null;}
}

/** Literal extraction only. Existing P4 validators and official keyframes implement all semantics. */
function validateCalls(code:string,record:InstalledPlugin){
  const source=ts.createSourceFile('example.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),plugins=new Set<string>(),tracks=new Set<string>();
  for(const statement of source.statements)if(ts.isImportDeclaration(statement)){
    const from=ts.isStringLiteral(statement.moduleSpecifier)?statement.moduleSpecifier.text:'';
    if(!['@frameweave/engine','@frameweave/engine/plugins'].includes(from))throw new EngineError('E_CAPABILITY_EXAMPLE_UNSUPPORTED','Examples must carry their dependencies; only public SDK imports are supported in ACL-1 snippets');
    const bindings=statement.importClause?.namedBindings;
    if(bindings&&ts.isNamedImports(bindings))for(const element of bindings.elements){const imported=(element.propertyName??element.name).text;
      if(from==='@frameweave/engine/plugins'&&imported==='plugin')plugins.add(element.name.text);
      if(from==='@frameweave/engine'&&imported==='keyframes')tracks.add(element.name.text);
    }
  }
  const protectedNames=new Set([...plugins,...tracks]);let nodes=0,calls=0;
  const unsupported=()=>{throw new EngineError('E_CAPABILITY_EXAMPLE_UNSUPPORTED','Example parameters must be literal P4 data or official keyframes; no user code is evaluated');};
  function data(node:ts.Expression,depth=0):any{
    if(depth>32||++nodes>4096)unsupported();
    if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isSatisfiesExpression(node))return data(node.expression,depth+1);
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
    if(ts.isNumericLiteral(node))return Number(node.text);
    if(node.kind===ts.SyntaxKind.TrueKeyword)return true;if(node.kind===ts.SyntaxKind.FalseKeyword)return false;if(node.kind===ts.SyntaxKind.NullKeyword)return null;
    if(ts.isPrefixUnaryExpression(node)&&ts.isNumericLiteral(node.operand)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(node.operator))return (node.operator===ts.SyntaxKind.MinusToken?-1:1)*Number(node.operand.text);
    if(ts.isArrayLiteralExpression(node))return node.elements.map(element=>data(element as ts.Expression,depth+1));
    if(ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(property=>{
      if(!ts.isPropertyAssignment(property)||!ts.isIdentifier(property.name)&&!ts.isStringLiteral(property.name))return unsupported();
      return [property.name.text,data(property.initializer,depth+1)];
    }));
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&tracks.has(node.expression.text)&&node.arguments.length===1)return keyframes(data(node.arguments[0],depth+1));
    return unsupported();
  }
  function visit(node:ts.Node){
    if((ts.isVariableDeclaration(node)||ts.isBindingElement(node)||ts.isParameter(node)||ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node))&&node.name&&ts.isIdentifier(node.name)&&protectedNames.has(node.name.text))unsupported();
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&plugins.has(node.expression.text)){
      if(node.arguments.length<1||node.arguments.length>3||!ts.isStringLiteral(node.arguments[0])||node.arguments[0].text!==`${record.manifest.id}@${record.manifest.version}`)
        throw new EngineError('E_CAPABILITY_EXAMPLE_VERSION','Example does not use only the selected exact capability version');
      const values=node.arguments[1]?data(node.arguments[1]):{};
      if(record.manifest.parameterSchemaVersion===2)v2Parameters(record.manifest,values,'static');else parameters(record.manifest,values);
      calls++;
    }
    ts.forEachChild(node,visit);
  }
  visit(source);if(!calls)throw new EngineError('E_CAPABILITY_EXAMPLE_INVALID','No exact plugin call found in the provided example');
}
export async function readExamples(record:InstalledPlugin,limit=3):Promise<CapabilityExample[]>{
  const candidates:{code:string;kind:'manifest'|'kit-demo';path:string;index:number|null}[]=[];
  for(const [index,code]of (record.manifest.examples??[]).entries()){
    if(candidates.length>=limit)break;candidates.push({code,kind:'manifest',path:'effect.json',index});
  }
  if(candidates.length<limit&&await kitConfiguration(record)){
    const code=await smallFile(record,'demo/project.tsx',8192);if(code!==null)candidates.push({code,kind:'kit-demo',path:'demo/project.tsx',index:null});
  }
  const parent=runtimeCachePath('capability-examples'),examples:CapabilityExample[]=[];
  for(const candidate of candidates){
    let directory:string|undefined;
    const origin={kind:candidate.kind,path:candidate.path,index:candidate.index,reference:`${record.manifest.id}@${record.manifest.version}`,integrity:hash(candidate.code)};
    try{
    if(Buffer.byteLength(candidate.code)>8192)throw new EngineError('E_CAPABILITY_BUDGET','An example exceeds 8192 bytes',{details:{path:candidate.path,index:candidate.index}});
    const project=candidate.kind==='kit-demo',checked=project?candidate.code:`import {plugin} from '@frameweave/engine/plugins';\nconst example = (${candidate.code.replace(/;\s*$/,'')});\nexport default example;\n`;
    validateCalls(checked,record);await mkdir(parent,{recursive:true});directory=await mkdtemp(join(parent,'check-'));
    try{const file=join(directory,'example.tsx');await writeFile(file,checked);await typecheckProject([{file}]);}
    finally{if(dirname(resolve(directory))!==resolve(parent))throw new EngineError('E_CAPABILITY_PATH','Invalid example check directory');await rm(directory,{recursive:true,force:true});}
    examples.push({format:project?'tsx-project':'tsx-expression',code:candidate.code,completeProject:project,source:{kind:candidate.kind,path:candidate.path,index:candidate.index,integrity:hash(candidate.code)},validation:{reference:'exact',parameters:'p4-static',typescript:'passed',execution:'not-run'}});
    }catch(error){
      const d=diagnostic(error),label=candidate.path+(candidate.index===null?'':`#/examples/${candidate.index}`);
      const sanitize=(value:any):any=>typeof value==='string'?directory?value.replaceAll(join(directory,'example.tsx'),label).replaceAll(directory,label):value:Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v)])):value;
      throw new EngineError(d.code,sanitize(d.message),{hint:d.hint,stageId:d.stageId,frame:d.frame,details:{source:origin,cause:sanitize(d.details??null)}});
    }
  }
  return examples;
}
