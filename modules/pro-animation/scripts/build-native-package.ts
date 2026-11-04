import {mkdir,readFile,writeFile,copyFile,cp,stat} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import type {PackageManifest} from '../../../src/packages/manifest.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),source=join(root,'modules/pro-animation/native-sdk'),slash=(s:string)=>s.replaceAll('\\','/');
const sdk=new Map<string,string>([
 ...['core/errors','core/types','core/animation','core/time','core/graph','core/ports','core/effects','core/simulation','core/authoring','media/surface','media/color','media/stage'].map((n):[string,string]=>[resolve(root,'src',n+'.ts'),'@frameweave/engine']),
 [resolve(root,'src/plugins/sdk.ts'),'@frameweave/engine/plugins'],
 ...['index','types','text-geometry'].map((n):[string,string]=>[resolve(root,'modules/graphics-contracts',n+'.ts'),'@frameweave/engine/graphics-contracts']),
 [resolve(root,'modules/native-gpu/authoring.ts'),'@frameweave/engine/native'],
 [resolve(root,'modules/native-gpu/temporal-types.ts'),'@frameweave/engine/native'],
 ...['index','pixel-types','compute-types','compute-capabilities','compute-profiling','resource-arena'].map((n):[string,string]=>[resolve(root,'modules/gpu-effects',n+'.ts'),'@frameweave/engine/native'])
 ]);
export async function buildNativeAnimationPackage(output:string, capability?:{manifest:PackageManifest;publicSource:string}){
 output=resolve(output);const rel=relative(join(root,'.frameweave'),output);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Choose an isolated .frameweave package directory');try{await stat(output);throw Error('Refusing package overwrite');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const dependencies=JSON.parse(await readFile(join(root,'package.json'),'utf8')).dependencies,queue=['public.ts','bindings.ts','api.d.ts'].map(n=>join(source,n)),seen=new Set<string>(),sourcePath=(p:string)=>'sources/'+slash(relative(root,p)),hashes:Record<string,string>={};await mkdir(output,{recursive:true});
 while(queue.length){const file=queue.shift()!;if(seen.has(file))continue;seen.add(file);const name=slash(relative(root,file));if(name.startsWith('../')||isAbsolute(name)||!name.startsWith('modules/')&&!name.startsWith('src/media/'))throw Error('Uncarried native library dependency '+name);
  if(/\.(?:mjs|cjs|js)$/.test(file)){const declaration=file.replace(/\.(mjs|cjs|js)$/,(suffix,kind)=>kind==='mjs'?'.d.mts':kind==='cjs'?'.d.cts':'.d.ts');try{await stat(declaration);queue.push(declaration);}catch{}}
  const bytes=capability&&file===join(source,'public.ts')?Buffer.from(capability.publicSource):await readFile(file),text=bytes.toString('utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits:{start:number;end:number;text:string}[]=[];
  function edge(literal:ts.StringLiteralLike){const spec=literal.text;if(spec.startsWith('@frameweave/engine'))return;if(!spec.startsWith('.')){const id=spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0];if(!dependencies[id])throw Error('Library dependency must be pinned by the SDK: '+spec+' in '+file);return;}
   const target=resolve(dirname(file),spec);let next=sdk.get(target);if(!next){if(!/\.(?:ts|mts|cts|js|mjs|cjs|json)$/.test(target))throw Error('Uncarried source asset '+target);queue.push(target);next=posix.relative(posix.dirname(sourcePath(file)),sourcePath(target));if(!next.startsWith('.'))next='./'+next;}
   edits.push({start:literal.getStart(ast),end:literal.end,text:JSON.stringify(next)});
  }
  function visit(node:ts.Node){if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))edge(node.moduleSpecifier);else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))edge(node.argument.literal);else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){if(node.arguments.length!==1||!ts.isStringLiteral(node.arguments[0]))throw Error('Dynamic module names cannot be carried');edge(node.arguments[0]);}ts.forEachChild(node,visit);}if(/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(file))visit(ast);
  let rewritten=text;for(const e of edits.sort((a,b)=>b.start-a.start))rewritten=rewritten.slice(0,e.start)+e.text+rewritten.slice(e.end);const destination=join(output,sourcePath(file));await mkdir(dirname(destination),{recursive:true});await writeFile(destination,rewritten);hashes[name]=createHash('sha256').update(bytes).digest('hex');
 }
 const manifest=capability?structuredClone(capability.manifest):JSON.parse(await readFile(join(source,'frameweave.package.json'),'utf8'));manifest.modules.main.path='./'+sourcePath(join(source,'public.ts'));manifest.modules.bindings.path='./'+sourcePath(join(source,'bindings.ts'));manifest.bindings.types='./'+sourcePath(join(source,'api.d.ts'));await writeFile(join(output,'frameweave.package.json'),JSON.stringify(manifest,null,2)+'\n');
 await copyFile(join(root,'licenses/APACHE-2.0.txt'),join(output,'LICENSE'));await cp(join(root,'modules/pro-animation/vendor'),join(output,'licenses/vendor'),{recursive:true});await copyFile(join(root,'modules/pro-animation/NOTICE'),join(output,'NOTICE'));await copyFile(join(root,'node_modules/three/LICENSE'),join(output,'licenses/three-MIT.txt'));await writeFile(join(output,'source-integrity.json'),JSON.stringify({version:1,sources:hashes},null,2)+'\n');return output;
}
