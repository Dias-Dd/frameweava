import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isBuiltin} from 'node:module';
import {build} from 'esbuild';
import ts from 'typescript';
import {SpiderMonkeyTransport} from './transport.ts';
import {EngineError} from '../../src/core/errors.ts';

function admission(file:string,source:string){
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const visit=(node:ts.Node)=>{
  if(ts.isMetaProperty(node))throw new EngineError('E_SPIDERMONKEY_IMPORT_META','import.meta is not admitted by the sealed host bundle');
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&(!node.arguments.length||!ts.isStringLiteral(node.arguments[0])))throw new EngineError('E_SPIDERMONKEY_DYNAMIC_IMPORT','Dynamic module names must be resolved/sealed by the compiler');
  ts.forEachChild(node,visit);
 };visit(tree);
}
/** Hook after the EXISTING source/package admission + TypeScript check, before
 * TVG validation. Node handles approved bytes/output only, never imports the
 * author's module. Static/literal imports link once; no child file privileges. */
export async function evaluateCompiledManifest(options:{sceneBundle:string;manifestFile:string;originalEntry:string;timeoutMs?:number;signal?:AbortSignal}){
 let host:SpiderMonkeyTransport|undefined;
 try{
  if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Manifest evaluation cancelled');
  const source=await readFile(options.sceneBundle,'utf8');admission(options.sceneBundle,source);
  const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),work=join(root,'.frameweave/sm-manifest');await mkdir(work,{recursive:true});const directory=await mkdtemp(join(work,'compiled-')),file=join(directory,'manifest.js');
  const result=await build({stdin:{contents:`import * as mod from ${JSON.stringify(resolve(options.sceneBundle))};import {normalizeManifest} from ${JSON.stringify(join(here,'manifest-common.mjs'))};globalThis.__frameweaveNativeHost.register((method)=>{if(method!=='manifest.evaluate')throw Error('Unknown manifest method');return normalizeManifest(mod,${JSON.stringify(basename(options.originalEntry))});});`,resolveDir:root,sourcefile:'manifest-host.entry.js'},bundle:true,platform:'browser',format:'iife',target:'es2022',write:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'sealed-manifest-modules',setup(builder){builder.onLoad({filter:/\.(?:mjs|cjs|js)$/},async args=>{const contents=await readFile(args.path,'utf8');admission(args.path,contents);return {contents,loader:'js'};});builder.onResolve({filter:/.*/},args=>{if(isBuiltin(args.path)||args.path.startsWith('node:'))return {errors:[{text:'Node host modules are unavailable inside SpiderMonkey',detail:new EngineError('E_SPIDERMONKEY_NODE_MODULE','Node host modules are not exposed: '+args.path)}]};if(args.path.startsWith('file:'))return {path:fileURLToPath(args.path)};});}}]});
  await writeFile(file,result.outputFiles[0].contents);
  host=await SpiderMonkeyTransport.create({bundleFile:file,timeoutMs:options.timeoutMs??15000,stageId:'@manifest',origin:'',signal:options.signal});
  const cancel=()=>{void host?.close();};options.signal?.addEventListener('abort',cancel,{once:true});
  try{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Manifest evaluation cancelled');const value=await host.call('manifest.evaluate',{}) as {text:string;authoring:string};if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Manifest evaluation cancelled');if(typeof value.text!=='string'||typeof value.authoring!=='string')throw new EngineError('E_NATIVE_PROTOCOL','Invalid manifest result');await writeFile(options.manifestFile,value.text);await writeFile(options.manifestFile+'.authoring.json',value.authoring);return {engine:'spidermonkey',transport:host.stats()};}finally{options.signal?.removeEventListener('abort',cancel);}
 }catch(error){
  const e=error as any,detail=e.errors?.find((x:any)=>x.detail instanceof EngineError)?.detail,issue={code:detail?.code??e.code??'E_PROJECT',message:detail?.message??e.message??String(error),stageId:e.stageId,details:e.details??e.stack};
  await writeFile(options.manifestFile+'.error.json',JSON.stringify(issue));throw new EngineError(issue.code,issue.message,{stageId:issue.stageId,details:issue.details});
 }finally{await host?.close();}
}
