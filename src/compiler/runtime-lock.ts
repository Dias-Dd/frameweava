import ts from 'typescript';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import type {RuntimeIdentity,RuntimeRequirement} from '../core/portable.ts';
import {EngineError} from '../core/errors.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(join(root,'package.json'));
export const engineVersion:string=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
function sources(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(join(directory,entry.name)):[relative(root,join(directory,entry.name)).replaceAll('\\','/')]);}
const moduleSources=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>['tests','validation','node_modules','target'].includes(entry.name)?[]:entry.isDirectory()?moduleSources(join(directory,entry.name)):/\.(?:tsx?|m?js|json|wasm|wgsl|glsl)$/.test(entry.name)&&relative(root,join(directory,entry.name)).replaceAll('\\','/')!=='modules/shared-state/node.ts'?[relative(root,join(directory,entry.name)).replaceAll('\\','/')]:[]);
// Public module implementations are SDK code too. Distribution retains these
// source bytes so an installed pin covers the same authority as the checkout.
const files=[...sources(join(root,'src')),...sources(join(root,'plugins/builtin')),...moduleSources(join(root,'modules'))].sort().concat(['package.json','package-lock.json','tsconfig.json']);
export const runtimePin:RuntimeIdentity={apiVersion:1,engineVersion,integrity:files.reduce((hash,file)=>hash.update(file).update('\0').update(readFileSync(join(root,file==='package-lock.json'&&!existsSync(join(root,file))?'npm-shrinkwrap.json':file))).update('\0'),createHash('sha256')).digest('hex')};
function packageVersion(name:string):string{
  let directory=dirname(require.resolve(name));
  for(;;){try{const value=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));if(value.name===name)return value.version;}catch{}
    const parent=dirname(directory);if(parent===directory)throw new EngineError('E_RUNTIME_DEPENDENCY',`Cannot locate installed dependency ${name}`);directory=parent;}
}
export function createRuntimeRequirement(packages:Record<string,string>={}):RuntimeRequirement{
  for(const [name,expected]of Object.entries(packages))if(packageVersion(name)!==expected)throw new EngineError('E_RUNTIME_DEPENDENCY',`Export dependency ${name} does not match the engine installation (${expected})`);
  return {schemaVersion:1,runtime:{...runtimePin},packages:{...packages}};
}
export function assertRuntimeRequirement(value:unknown):asserts value is RuntimeRequirement{
  function fail(message:string):never{throw new EngineError('E_RUNTIME_LOCK',message,{hint:'Use the exporting SDK and pinned dependencies, or deliberately re-export from the original editable project after reviewing the runtime change.'});}
  const plain=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  if(!plain(value)||value.schemaVersion!==1||!plain(value.runtime)||!plain(value.packages)||Object.keys(value).some(k=>!['schemaVersion','runtime','packages'].includes(k)))fail('Malformed frameweaveRuntime declaration');
  const declared=value.runtime;
  if(Object.keys(declared).some(k=>!['apiVersion','engineVersion','integrity'].includes(k))||declared.apiVersion!==1||typeof declared.engineVersion!=='string'||typeof declared.integrity!=='string'||!/^[a-f0-9]{64}$/.test(declared.integrity))fail('Malformed SDK runtime identity');
  if(declared.engineVersion!==runtimePin.engineVersion||declared.apiVersion!==runtimePin.apiVersion||declared.integrity!==runtimePin.integrity)fail(`Export requires SDK ${declared.engineVersion} / ${declared.integrity.slice(0,12)}, installed SDK is ${runtimePin.engineVersion} / ${runtimePin.integrity.slice(0,12)}`);
  for(const [name,expected]of Object.entries(value.packages)){if(typeof expected!=='string'||!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name))fail('Malformed runtime dependency pin');let actual:string;try{actual=packageVersion(name);}catch{fail(`Required dependency is unavailable: ${name}@${expected}`);}if(actual!==expected)fail(`Export requires ${name}@${expected}, installed ${actual}`);}
}
function literal(node:ts.Expression):unknown{
  if(ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isParenthesizedExpression(node))return literal(node.expression);
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
  if(ts.isNumericLiteral(node))return Number(node.text);
  if(ts.isObjectLiteralExpression(node)){const object:Record<string,unknown>=Object.create(null);for(const item of node.properties){if(!ts.isPropertyAssignment(item)||!item.name||!ts.isIdentifier(item.name)&&!ts.isStringLiteral(item.name))throw new EngineError('E_RUNTIME_LOCK','Runtime metadata must contain literal properties');const key=item.name.text;if(Object.hasOwn(object,key))throw new EngineError('E_RUNTIME_LOCK','Duplicate runtime metadata key');object[key]=literal(item.initializer);}return object;}
  throw new EngineError('E_RUNTIME_LOCK','Runtime metadata must be a literal object, without executable expressions');
}
/** Validate before executing project code. Metadata is ordinary editable TS, not a source capsule. */
export function checkRuntimeFile(file:string):RuntimeRequirement|undefined{
  if(!/\.[cm]?[jt]sx?$/i.test(file))return;
  let sibling:string|undefined;try{sibling=readFileSync(join(dirname(file),'frameweave.runtime.json'),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(sibling!==undefined){let value:unknown;try{value=JSON.parse(sibling);}catch{throw new EngineError('E_RUNTIME_LOCK','Malformed frameweave.runtime.json');}assertRuntimeRequirement(value);}
  const source=readFileSync(file,'utf8');if(!source.includes('frameweaveRuntime'))return;
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,/x$/i.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  let count=0;
  let requirement:RuntimeRequirement|undefined;
  for(const statement of ast.statements)if(ts.isVariableStatement(statement)&&statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))for(const item of statement.declarationList.declarations)if(ts.isIdentifier(item.name)&&item.name.text==='frameweaveRuntime'){
    if(++count>1||!item.initializer)throw new EngineError('E_RUNTIME_LOCK','Missing or duplicate frameweaveRuntime initializer');const value=literal(item.initializer);assertRuntimeRequirement(value);requirement=value;
  }
  return requirement;
}
