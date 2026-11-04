import ts from 'typescript';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import type {PortableProject} from '../core/portable.ts';
import {EngineError} from '../core/errors.ts';
import {assertRuntimeRequirement} from './runtime-lock.ts';

const fail=(message:string):never=>{throw new EngineError('E_PORTABLE',message);};
function blobBytes(blob:PortableProject['blobs'][string]):Buffer {
  if(!blob||typeof blob!=='object')fail('Malformed portable blob');
  if(typeof blob.text==='string'&&blob.base64===undefined)return Buffer.from(blob.text,'utf8');
  if(typeof blob.base64==='string'&&blob.text===undefined&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(blob.base64))return Buffer.from(blob.base64,'base64');
  return fail('Blob must contain exactly one text or base64 payload');
}
function literal(node:ts.Expression):unknown {
  if(ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isParenthesizedExpression(node))return literal(node.expression);
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
  if(ts.isNumericLiteral(node))return Number(node.text);
  if(ts.isObjectLiteralExpression(node)){const value:Record<string,unknown>=Object.create(null);for(const p of node.properties){if(!ts.isPropertyAssignment(p)||!p.name||(!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name)))fail('Portable metadata must contain literal properties only');const key=(p.name as ts.Identifier|ts.StringLiteral).text;if(Object.hasOwn(value,key))fail('Duplicate portable property');value[key]=literal((p as ts.PropertyAssignment).initializer);}return value;}
  fail('Portable metadata cannot execute expressions or interpolate strings');
}
export function parsePortable(source:string):PortableProject|undefined {
  if(!source.includes('frameweavePortable'))return;
  const ast=ts.createSourceFile('capsule.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
    if(!ts.isIdentifier(declaration.name)||declaration.name.text!=='frameweavePortable')continue;
    if(!declaration.initializer)fail('Missing portable metadata');const data=literal(declaration.initializer!) as PortableProject;
    if(data.schemaVersion!==1||typeof data.entry!=='string'||!data.sources||!data.blobs||!data.files)fail('Invalid portable schema');
    if(data.runtime)assertRuntimeRequirement(data.runtime);
    const paths=new Set<string>();
    for(const [path,value] of [...Object.entries(data.sources),...Object.entries(data.files),...Object.entries(data.siblings??{})]){
      if(!path||path.includes('\\')||path.split('/').some(x=>x==='..'||x==='.'||x==='')||isAbsolute(path)||path.includes(':')||paths.has(path)||typeof value!=='string')fail(`Unsafe or duplicate portable path: ${path}`);paths.add(path);
    }
    if(!Object.hasOwn(data.sources,data.entry)&&!Object.hasOwn(data.siblings??{},data.entry))fail('Portable entry must be a declared source');
    let bytes=Object.values(data.sources).reduce((n,s)=>n+Buffer.byteLength(s),0);
    if(paths.size>4000)fail('Portable file budget exceeds 4000');
    for(const [hash,blob]of Object.entries(data.blobs)){if(!/^[a-f0-9]{64}$/.test(hash))fail('Malformed portable blob key');const content=blobBytes(blob);bytes+=content.length;if(createHash('sha256').update(content).digest('hex')!==hash)fail(`Blob integrity mismatch: ${hash}`);}
    if(bytes>256*1024*1024)fail('Portable capsule exceeds 256 MiB decoded budget');
    for(const hash of Object.values(data.files))if(!Object.hasOwn(data.blobs,hash))fail(`Missing portable blob: ${hash}`);
    const restored=Object.values(data.sources).reduce((n,s)=>n+Buffer.byteLength(s),0)+Object.values(data.files).reduce((n,key)=>n+blobBytes(data.blobs[key]).length,0);
    if(restored>256*1024*1024)fail('Portable aliases exceed 256 MiB materialized budget');
    return data;
  }
}
export async function materializePortable(file:string,cache:string):Promise<string|undefined>{
  const source=await readFile(file,'utf8'),data=parsePortable(source);if(!data)return;
  const directory=join(cache,createHash('sha256').update(source).digest('hex'));await mkdir(directory,{recursive:true});
  for(const [path,text]of Object.entries(data.sources)){const target=resolve(directory,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,text);}
  for(const [path,hash]of Object.entries(data.files)){const target=resolve(directory,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,blobBytes(data.blobs[hash]));}
  for(const [path,sibling]of Object.entries(data.siblings??{})){const target=resolve(directory,path);await mkdir(dirname(target),{recursive:true});try{await writeFile(target,await readFile(resolve(dirname(file),sibling)));}catch(e){fail(`Missing carried/external file ${sibling}: ${String(e)}`);}}
  return join(directory,data.entry);
}
// ECMAScript normalizes raw CRLF inside template literals. Escape CR explicitly so
// plugin content pins and shader/string bytes survive Windows -> Unix transport.
const template=(text:string)=>'`'+text.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${').replaceAll('\r','\\r')+'`';
export function printPortable(data:PortableProject):string {
  const sourceEntries=Object.entries(data.sources).map(([path,source])=>`    // Original module: ${path}\n    ${JSON.stringify(path)}: ${template(source)},`).join('\n\n');
  const blobEntries=Object.entries(data.blobs).map(([key,blob])=>`    ${JSON.stringify(key)}: ${typeof blob.text==='string'?'{text:'+template(blob.text)+'}':JSON.stringify(blob)},`).join('\n');
  return `/** FrameWeave portable source capsule, schema 1.
 * Edit original TS/TSX modules below. Module scopes, cycles, JSX pragmas and async remain intact.
 * The standard FrameWeave builder typechecks the restored source graph before execution.
 * Binary payloads are content-addressed and stored once, regardless of path aliases.
 */
${data.runtime?`export const frameweaveRuntime = ${JSON.stringify(data.runtime,null,2)} as const;\n`:''}import type {PortableProject} from '@frameweave/engine';
export const frameweavePortable:PortableProject = {
  schemaVersion:1,
  ${data.runtime?`runtime:${JSON.stringify(data.runtime)},`:''}
  entry:${JSON.stringify(data.entry)},
  sources:{
${sourceEntries}
  },
  blobs:{
${blobEntries}
  },
  files:${JSON.stringify(data.files,null,2)},
  siblings:${JSON.stringify(data.siblings??{},null,2)}
};
export default frameweavePortable;
`;
}
