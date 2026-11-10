import {mkdir,readFile,writeFile,copyFile,cp,stat,readdir} from 'node:fs/promises';
import {dirname,resolve,join,relative,isAbsolute,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../..');
const resident=join(workspace,'modules/gpu-image-effects/resident');
const sdk=new Map<string,string>([
 ...['core/errors','core/types','core/animation','core/time','core/graph','core/ports','core/effects','core/simulation','core/authoring','media/surface','media/color','media/stage'].map(p=>[resolve(workspace,'src',p+'.ts'),'@frameweave/engine'] as [string,string]),
 [resolve(workspace,'src/plugins/sdk.ts'),'@frameweave/engine/plugins'],
 ...['index','types'].map(p=>[resolve(workspace,'modules/graphics-contracts',p+'.ts'),'@frameweave/engine/graphics-contracts'] as [string,string]),
 [resolve(workspace,'modules/native-gpu/authoring.ts'),'@frameweave/engine/native'],
 [resolve(workspace,'modules/native-gpu/temporal-types.ts'),'@frameweave/engine/native'],
 ...['index','pixel-types','compute-types','compute-capabilities','compute-profiling','resource-arena'].map(p=>[resolve(workspace,'modules/gpu-effects',p+'.ts'),'@frameweave/engine/native'] as [string,string]),
]);
const slash=(p:string)=>p.replaceAll('\\','/'),sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const sourcePath=(p:string)=>'sources/'+slash(relative(workspace,p));

/** Carry real TS and type dependencies. Existing compiler/Flat owns linking;
 * only module paths change, never the implementation or its type annotations. */
export async function buildNativeImagePackage(output:string){
 output=resolve(output);const rel=relative(join(workspace,'.frameweave'),output);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Use a fresh worktree-private .frameweave package output');
 try{await stat(output);throw Error('Refusing to overwrite an immutable package');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 for(const group of ['creative','blends','foundations']){const base=join(resident,group),m=JSON.parse(await readFile(join(base,'sources.json'),'utf8'));for(const item of m.sources){const b=await readFile(resolve(base,item.archive));if(b.length!==item.bytes||sha(b)!==item.sha256)throw Error('Effect provenance mismatch: '+item.path);}}
 await mkdir(output,{recursive:true});const pending=['public.ts','api.d.ts','bindings.ts'].map(p=>join(root,p)),seen=new Set<string>(),sources:Record<string,string>={};
 while(pending.length){
  const file=pending.shift()!;if(seen.has(file))continue;seen.add(file);const path=slash(relative(workspace,file));
  if(!(path.startsWith('modules/')||path==='src/media/compositor-geometry.ts')||path.includes('/../')||isAbsolute(path)||!path.endsWith('.ts'))throw Error('Typed package requires an admitted TS module: '+path);
  const bytes=await readFile(file),text=bytes.toString('utf8'),parsed=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits:{start:number;end:number;text:string}[]=[];
  const dependency=(literal:ts.StringLiteralLike)=>{
   const spec=literal.text;if(spec.startsWith('@frameweave/engine'))return;if(!spec.startsWith('.'))throw Error('Uncarried package dependency: '+spec);
   const target=resolve(dirname(file),spec),publicName=sdk.get(target);let replacement=publicName;
   if(!replacement){if(!target.endsWith('.ts'))throw Error('Unsupported typed dependency: '+spec);pending.push(target);replacement=posix.relative(posix.dirname(sourcePath(file)),sourcePath(target));if(!replacement.startsWith('.'))replacement='./'+replacement;}
   edits.push({start:literal.getStart(parsed),end:literal.end,text:JSON.stringify(replacement)});
  };
  const visit=(node:ts.Node)=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier);
   else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))dependency(node.argument.literal);
   else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){if(node.arguments.length!==1||!ts.isStringLiteral(node.arguments[0]))throw Error('Dynamic module names cannot be carried');dependency(node.arguments[0]);}
   ts.forEachChild(node,visit);
  };visit(parsed);
  let rewritten=text;for(const e of edits.sort((a,b)=>b.start-a.start))rewritten=rewritten.slice(0,e.start)+e.text+rewritten.slice(e.end);
  const destination=join(output,sourcePath(file));await mkdir(dirname(destination),{recursive:true});await writeFile(destination,rewritten);sources[path]=sha(bytes);
 }
 const manifest=JSON.parse(await readFile(join(root,'frameweave.package.json'),'utf8'));
 manifest.modules.main.path='./'+sourcePath(join(root,'public.ts'));manifest.modules.bindings.path='./'+sourcePath(join(root,'bindings.ts'));manifest.bindings.types='./'+sourcePath(join(root,'api.d.ts'));
 await writeFile(join(output,'frameweave.package.json'),JSON.stringify(manifest,null,2)+'\n');
 await copyFile(join(root,'exr-functions.json'),join(output,'frameweave.functions.json'));
 for(const [from,to]of [[join(workspace,'LICENSE'),'LICENSE'],[join(resident,'NOTICE'),'NOTICE'],[join(resident,'LICENSE.effectcraft'),'LICENSE.effectcraft'],[join(root,'README.md'),'README.md']])await copyFile(from,join(output,to));
 await copyFile(join(root,'raster/README.md'),join(output,'RASTER.md'));
 await copyFile(join(root,'pa/README.md'),join(output,'PA.md'));
 await copyFile(join(root,'builtin/README.md'),join(output,'BUILTIN.md'));
 await copyFile(join(root,'color/README.md'),join(output,'COLOR.md'));
 await copyFile(join(root,'io/README.md'),join(output,'IO.md'));
 for(const group of ['creative','blends','foundations'])await cp(join(resident,group),join(output,'provenance',group),{recursive:true,filter:p=>!p.endsWith('.ts')});
 // Preserve each newly carried domain's original license/notice, including OCIO,
 // Naga, Pixi/postprocessing and model notices. No downloaded model is bundled.
 async function notices(dir:string){for(const e of await readdir(dir,{withFileTypes:true})){if(['validation','tests','examples','scripts','node_modules'].includes(e.name))continue;const file=join(dir,e.name);if(e.isDirectory())await notices(file);else if(/(?:^|[-.])(?:LICENSE|NOTICE|COPYING)(?:[.-]|$)|(?:^|[-.])(?:SOURCE|UPSTREAM).*\.json$/i.test(e.name)){const target=join(output,'licenses/native-domains',relative(root,file));await mkdir(dirname(target),{recursive:true});await copyFile(file,target);}}}await notices(root);
 await writeFile(join(output,'source-integrity.json'),JSON.stringify({version:2,checkpoints:['95b74c7adf7d87f1bc15227c448af244e441e6bb','0c4111fedcfec8bf63b768c07ab12b2856120858','22370b15287262ead71c92601aeed77c0e62f3fc','5f96e9bcd81b9758e1688b60fae48f9906716629'],sources},null,2)+'\n');return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildNativeImagePackage(process.argv[2]));
