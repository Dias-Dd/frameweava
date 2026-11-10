import {stageDefinitions} from '../../modules/stage-orchestration/composite-types.ts';
import {runtimeCachePath} from '../runtime/paths.ts';
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import {createReadStream} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire, isBuiltin } from 'node:module';
import { readFile, writeFile, mkdir, copyFile, realpath, rm } from 'node:fs/promises';
import { dirname, resolve, relative, extname, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BuiltProject, TVG } from '../core/types.ts';
import { assertValidTVG } from '../core/graph.ts';
import { EngineError } from '../core/errors.ts';
import { typecheckProject } from './typecheck.ts';
import { normalizeInputPort } from '../core/ports.ts';
import {preparePluginStages,assertPluginBundleInputs} from '../plugins/compiler.ts';
import {materializePortable} from './portable.ts';
import {decodeDataResource} from './assets.ts';
import {checkRuntimeFile} from './runtime-lock.ts';
import {embedSvg} from './svg.ts';
import {checkpoints,type PerformanceSink} from '../render/performance.ts';
import {managedContext} from './managed.ts';
import {checkFlatPackages} from './flat-integrity.ts';

const exec = promisify(execFile);
export const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
export const alias = {
  '@frameweave/engine/native/react':join(engineRoot,'modules/native-gpu/react.tsx'),
  '@frameweave/engine/native':join(engineRoot,'modules/native-gpu/authoring.ts'),
  '@frameweave/engine/packages':join(engineRoot,'src/packages/flat-runtime.ts'),
  '@frameweave/engine/graphics-contracts':join(engineRoot,'modules/graphics-contracts/index.ts'),
  '@frameweave/engine/stage-orchestration':join(engineRoot,'modules/stage-orchestration/types.ts'),
  '@frameweave/engine/audio':join(engineRoot,'src/audio/index.ts'),
  '@frameweave/engine/audio/node':join(engineRoot,'src/audio/node.ts'),
  '@frameweave/engine/editing':join(engineRoot,'modules/editing/index.ts'),
  '@frameweave/engine/editing/node':join(engineRoot,'modules/editing/node.ts'),
  '@frameweave/engine/image-effects':join(engineRoot,'modules/native-effects/authoring/index.ts'),
  '@frameweave/engine/image-effects/node':join(engineRoot,'modules/native-effects/authoring/node.ts'),
  '@frameweave/engine/spatial-creation':join(engineRoot,'modules/spatial-creation/rendering.ts'),
  '@frameweave/engine/spatial-creation/node':join(engineRoot,'modules/spatial-creation/node.ts'),
  '@frameweave/engine/spatial-vfx':join(engineRoot,'modules/spatial-vfx/stage.ts'),
  '@frameweave/engine/typography':join(engineRoot,'modules/pro-animation/typography.ts'),
  '@frameweave/engine/typography/node':join(engineRoot,'modules/pro-animation/typography-node.ts'),
  '@frameweave/engine/servo':join(engineRoot,'modules/servo/index.ts'),
  '@frameweave/engine/servo/node':join(engineRoot,'modules/servo/node.ts'),
  '@frameweave/engine/shared-state': join(engineRoot, 'src/shared-state/authoring.ts'),
  '@frameweave/engine/jsx-runtime': join(engineRoot, 'src/jsx-runtime.ts'),
  '@frameweave/engine/jsx-dev-runtime': join(engineRoot, 'src/jsx-runtime.ts'),
  '@frameweave/engine/node': join(engineRoot, 'src/node.ts'),
  '@frameweave/engine/plugins': join(engineRoot, 'src/plugins/sdk.ts'),
  '@frameweave/engine/effects': join(engineRoot, 'src/plugins/builtin.ts'),
  '@frameweave/engine': join(engineRoot, 'src/index.ts'),
};
// Legacy project sources remain buildable after the product rename.
Object.assign(alias,Object.fromEntries(Object.entries(alias).map(([key,value])=>[key.replace('@frameweave/engine','@canvix/engine'),value])));
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const loader: esbuild.BuildOptions['loader'] = {
  '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.webp': 'file', '.svg': 'file',
  '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.otf': 'file', '.glb': 'file', '.gltf': 'file', '.glsl': 'text', '.wgsl': 'text',
  '.mp3':'file','.wav':'file','.ogg':'file','.mp4':'file','.webm':'file','.bin':'file','.txt':'text',
};
/** Preserve package boundaries, resolving real ESM import targets local-first then from this engine. */
const nodePackages:esbuild.Plugin={name:'node-package-runtime-paths',setup(build){
  build.onResolve({filter:/^[^./\\]/},async args=>{
    if(args.pluginData?.frameweaveResolvedPackage||Object.hasOwn(alias,args.path)||isAbsolute(args.path)||isBuiltin(args.path))return;
    const resolved=await build.resolve(args.path,{kind:args.kind,resolveDir:args.resolveDir,pluginData:{frameweaveResolvedPackage:true}});
    if(resolved.errors.length)return {errors:resolved.errors,warnings:resolved.warnings};
    if(resolved.external)return {path:resolved.path,external:true};
    const path=args.kind==='require-call'||args.kind==='require-resolve'?resolved.path:pathToFileURL(resolved.path).href;
    return {path,external:true};
  });
}};
function buildError(error: unknown): EngineError {
  const e = error as { errors?: esbuild.Message[]; message?: string };
  const explicit=e.errors?.find(message=>message.detail instanceof EngineError)?.detail;if(explicit instanceof EngineError)return explicit;
  return new EngineError('E_COMPILE', e.message ?? String(error), {
    hint: 'Check the indicated source location. Scene TSX uses @frameweave/engine; native React TSX uses @jsxImportSource react.',
    details: e.errors?.map(({ text, location }) => ({ text, location })),
  });
}

export interface BuildOptions { outputDir?: string; timeoutMs?: number; onProfile?:PerformanceSink }
export async function buildProject(project: string, options: BuildOptions = {}): Promise<BuiltProject> {
  const checkpoint=checkpoints(options.onProfile);
  const originalEntry=resolve(project);
  checkFlatPackages(originalEntry);
  checkRuntimeFile(originalEntry);
  const entry = /\.[cm]?[jt]sx?$/.test(originalEntry)?await materializePortable(originalEntry,runtimeCachePath('portable'))??originalEntry:originalEntry;
  const root = dirname(entry);
  const dir = resolve(options.outputDir ?? runtimeCachePath(hash(entry).slice(0, 12)));
  await mkdir(dir, { recursive: true });
  const sceneBundle = join(dir, 'project.mjs');
  const manifestFile = join(dir, 'tvg.json');
  const sourceFiles=new Set<string>();
  let svgRoots:string[]=[];
  const svgOwner=(file:string)=>[root,...svgRoots].find(owner=>{const r=relative(owner,file);return r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);})??dirname(file);
  const svgPlugin:esbuild.Plugin={name:'svg-explicit-dependencies',setup(builder){builder.onLoad({filter:/\.svg$/i},async({path})=>{const result=await embedSvg(await readFile(path),{file:path,owner:svgOwner(path)});for(const dependency of result.dependencies)sourceFiles.add(dependency);return {contents:result.bytes,loader:'file',watchFiles:result.dependencies};});}};
  checkpoint('compile.prepare');
  const managed=await managedContext(root,engineRoot,alias,entry);if(/\.[cm]?[jt]sx?$/.test(entry))await managed.scan(entry);
  try {
    const scene=await esbuild.build({ entryPoints: [entry], outfile: sceneBundle, bundle: true, platform: 'node', format: 'esm',
      target: 'node22', jsx: 'automatic', jsxImportSource: '@frameweave/engine', alias, sourcemap: 'inline',
      logLevel: 'silent', plugins:[managed.plugin(),nodePackages,svgPlugin],nodePaths:[join(engineRoot,'node_modules')],tsconfig: join(engineRoot, 'tsconfig.json'),metafile:true,loader,
    });
    for(const file of Object.keys(scene.metafile!.inputs)){if(file.startsWith('frameweave-managed:'))continue;const path=resolve(file);sourceFiles.add(path);checkRuntimeFile(path);checkFlatPackages(path);}
  } catch (error) { if(error instanceof EngineError)throw error;throw buildError(error); }
  // Program roots are explicit: files outside tsconfig include/exclude still pass this gate.
  checkpoint('compile.scene-bundle');
  await typecheckProject([{file:entry}],{paths:managed.paths});
  checkpoint('compile.scene-typecheck');
  await rm(`${manifestFile}.error.json`,{force:true});
  try {
    await exec(process.execPath, ['--max-old-space-size=256', join(engineRoot, 'src/compiler/evaluate.mjs'), sceneBundle, manifestFile,entry], {
      cwd: root, timeout: options.timeoutMs ?? 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
  } catch (error) {
    const e = error as { killed?: boolean; stderr?: string; message?: string };
    let detail:{code?:string;message?:string;stageId?:string;details?:unknown}={};
    try {detail=JSON.parse(await readFile(`${manifestFile}.error.json`,'utf8'));}
    catch {try {detail=JSON.parse(e.stderr??'');} catch {}}
    throw new EngineError(e.killed ? 'E_BUILD_TIMEOUT' : detail.code??'E_PROJECT', detail.message || e.stderr || e.message || String(error), {
      stageId:detail.stageId,details:detail.details,
      hint: detail.code==='E_STAGE_FACTORY_EXPORT' ? 'Export this factory from the project entry (or re-export it); alternatively use entry + exportName.' : 'Build-time functions must terminate and return a JSON TVG. Arbitrary closures cannot be serialized.',
    });
  }
  let manifest: TVG;
  try { manifest = JSON.parse(await readFile(manifestFile, 'utf8')); }
  catch (error) { throw new EngineError('E_PROJECT', `Cannot load TVG: ${String(error)}`); }
  // Preserve the legacy malformed-JSON diagnostics before any optional extension inspects TVG fields.
  assertValidTVG(manifest,{allowUnresolvedInputContracts:true});
  const sourceManifest=structuredClone(manifest);
  const definitions=stageDefinitions(manifest),buildStages=definitions.map(({key,stage})=>key===stage.id?stage:{...stage,id:'so2_'+hash(key)}),bundleKeys=new Map(buildStages.map((stage,i)=>[stage.id,definitions[i].key]));
  if(bundleKeys.size!==buildStages.length)throw new EngineError('E_STAGE_DUPLICATE','Compiled Stage scope identities collide');
  checkpoint('compile.tvg');
  const preparedPlugins=await preparePluginStages({...manifest,stages:buildStages},root,dir,engineRoot,JSON.parse(await readFile(`${manifestFile}.authoring.json`,'utf8')),!!managed.embedded);
  const bound=new Map<string,Awaited<ReturnType<typeof managed.prepare>>>();
  for(const stage of buildStages)if(stage.entry){
    const plan=preparedPlugins.plans[stage.id],uses=plan?(await Promise.all(plan.modules.map(m=>managed.scan(m.file)))).flat():await managed.factoryUses(resolve(root,stage.entry),stage.exportName);
    const unique=new Map<string,Set<string>>();for(const u of uses){const n=unique.get(u.ref)??new Set<string>();u.names.forEach(x=>n.add(x));unique.set(u.ref,n);}
    const result=await managed.prepare(stage,manifest,dir,[...unique].map(([ref,n])=>({ref,names:[...n]})));bound.set(stage.id,result);
    preparedPlugins.resources.push(...result.resources);preparedPlugins.roots.push(...result.roots);
  }
  checkpoint('compile.plugins');
  svgRoots=preparedPlugins.roots;
  const pluginResources=[...new Map(preparedPlugins.resources.map(r=>[r.id,r])).values()];
  assertValidTVG(manifest,{allowUnresolvedInputContracts:true});
  // Native entries are string references, so TypeScript cannot discover them from project imports.
  // Validate them and their imported helpers before bundling or running any Stage code.
  const checked=await typecheckProject(buildStages.filter(stage=>(stage.engine==='audio'||stage.engine==='native-gpu')&&stage.entry)
    .map(stage=>({file:resolve(root,stage.entry!),stageId:stage.id,exportName:stage.exportName})),{paths:managed.paths});
  for(const stage of buildStages) {
    const inferred=checked.contracts[stage.id];
    if(!inferred)continue;
    if(stage.inputTypes===undefined) {
      // A partial/unknown/dynamic signature cannot silently become an incomplete runtime contract.
      if(!checked.unresolvedContracts[stage.id]?.length)stage.inputTypes=inferred;
      continue;
    }
    for(const [port,contract]of Object.entries(inferred)) {
      const expected=normalizeInputPort(contract),declared=Object.hasOwn(stage.inputTypes,port)?stage.inputTypes[port]:undefined;
      if(declared===undefined) {
        if(!expected.optional)throw new EngineError('E_INPUT_SCHEMA',`Stage ${stage.id} native signature requires '${port}', which is missing from its explicit inputTypes.`,{stageId:stage.id,details:{port,inferred:contract}});
        continue;
      }
      const actual=normalizeInputPort(declared);
      if(actual.type!==expected.type||actual.optional&&!expected.optional)
        throw new EngineError('E_INPUT_TYPE',`Stage ${stage.id}.${port} declares ${actual.type}${actual.optional?' optional':''}, but its native TypeScript signature requires ${expected.type}${expected.optional?' optional':''}.`,
          {stageId:stage.id,details:{port,declared,inferred:contract}});
    }
  }
  for(let i=0;i<definitions.length;i++)if(buildStages[i].inputTypes!==undefined)definitions[i].stage.inputTypes=buildStages[i].inputTypes;
  assertValidTVG(manifest);
  const assets: Record<string, string> = {};
  checkpoint('compile.stage-typecheck');
  await mkdir(join(dir, 'assets'), { recursive: true });
  async function copyResource(id:string,src:string,owner:string,verbatim=false){
    if(src.startsWith('data:')){const data=decodeDataResource(src),bytes=!verbatim&&data.extension==='.svg'?(await embedSvg(data.bytes)).bytes:data.bytes,url=`assets/embedded_${hash(bytes)}${data.extension}`;await writeFile(join(dir,url),bytes);assets[url]=join(dir,url);return url;}
    const url=`assets/${id}${extname(src)}`;
    if(!verbatim&&extname(src).toLowerCase()==='.svg'){
      const result=await embedSvg(await readFile(src),{file:src,owner});for(const dependency of result.dependencies)sourceFiles.add(dependency);await writeFile(join(dir,url),result.bytes);
    }else if(!verbatim&&extname(src).toLowerCase()==='.gltf'){
      const model=JSON.parse(await readFile(src,'utf8'));
      for(const item of [...model.buffers??[],...model.images??[]])if(item.uri&&!item.uri.startsWith('data:')){
        if(/^[a-z]+:/i.test(item.uri))throw new EngineError('E_RESOURCE','glTF buffers and textures must be local or data URLs');
        const linked=await realpath(resolve(dirname(src),decodeURIComponent(item.uri))),rel=relative(await realpath(owner),linked);
        if(rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw new EngineError('E_RESOURCE','glTF dependency escapes its declared resource root');
        sourceFiles.add(linked);let bytes:Buffer=await readFile(linked);if(extname(linked).toLowerCase()==='.svg'){const svg=await embedSvg(bytes,{file:linked,owner});bytes=svg.bytes;for(const dependency of svg.dependencies)sourceFiles.add(dependency);}const name=`${id}_deps/${hash(bytes).slice(0,24)}${extname(linked)}`,linkedURL=`assets/${name}`;
        await mkdir(dirname(join(dir,linkedURL)),{recursive:true});await writeFile(join(dir,linkedURL),bytes);assets[linkedURL]=join(dir,linkedURL);item.uri=name;
      }
      await writeFile(join(dir,url),JSON.stringify(model));
    }else await copyFile(src,join(dir,url));
    assets[url]=join(dir,url);return url;
  }
  for (const resource of manifest.resources) {
    if (!/^[a-zA-Z0-9_-]+$/.test(resource.id)) throw new EngineError('E_RESOURCE', `Unsafe resource ID: ${resource.id}`);
    let src: string;
    try {
      if(resource.src.startsWith('data:')){resource.src=await copyResource(resource.id,resource.src,root);continue;}
      src = resource.src.startsWith('package:') ? require.resolve(resource.src.slice(8)) : resolve(root, resource.src);
      const actual = await realpath(src);
      const rel = relative(await realpath(root), actual);
      if (!resource.src.startsWith('package:') && (rel.startsWith('..') || isAbsolute(rel))) {
        throw new Error('Resources outside the project must use explicit package: references.');
      }
      src = actual;
    } catch (error) {
      if(error instanceof EngineError&&error.code==='E_SVG_RESOURCE')throw error;
      throw new EngineError('E_RESOURCE_MISSING', `Cannot load resource ${resource.id}: ${resource.src}`, { details: String(error) });
    }
    const url=await copyResource(resource.id,src,resource.src.startsWith('package:')?dirname(src):root);
    resource.src = url;
  }
  for(const resource of pluginResources){
    if(manifest.resources.some(r=>r.id===resource.id))throw new EngineError('E_PLUGIN_RESOURCE',`Duplicate plugin resource ${resource.id}`);
    const owner=resource.path.startsWith('data:')?root:preparedPlugins.roots.find(p=>{const rel=relative(p,resource.path);return !rel.startsWith('..')&&!isAbsolute(rel);})!;
    const url=await copyResource(resource.id,resource.path,owner,resource.verbatim);
    manifest.resources.push({id:resource.id,src:url,kind:resource.kind});
  }
  const stageBundles: Record<string, string> = {};
  checkpoint('compile.resources');
  for (const stage of buildStages) {
    if (stage.engine !== 'audio'&&!(stage.engine==='native-gpu'&&stage.entry)) continue;
    if (!/^[a-zA-Z0-9_-]+$/.test(stage.id)) throw new EngineError('E_STAGE_ID', `Unsafe Stage ID ${stage.id}`);
    const outfile = join(dir, 'stages', `${stage.id}.js`);
    let source: string;
    if(stage.engine==='native-gpu'){
      const nativeEntry=resolve(root,stage.entry!);const binding=bound.get(stage.id)!;
      source=binding.prefix?binding.prefix+`import {installNativeLogic} from ${JSON.stringify(join(engineRoot,'modules/native-gpu/logic-bootstrap.ts'))};installNativeLogic(${binding.wrap(`()=>import(${JSON.stringify(nativeEntry)}).then(m=>m[${JSON.stringify(stage.exportName??'default')}])`)});`:`import {${JSON.stringify(stage.exportName??'default')} as factory} from ${JSON.stringify(nativeEntry)};import {installNativeLogic} from ${JSON.stringify(join(engineRoot,'modules/native-gpu/logic-bootstrap.ts'))};installNativeLogic(factory);`;
    }else if(stage.engine==='audio'){
      if(!stage.entry)throw new EngineError('E_AUDIO_FACTORY','Audio entry required');
      source=`export {${JSON.stringify(stage.exportName??'default')}} from ${JSON.stringify(resolve(root,stage.entry))};`;
    }else throw new EngineError('E_BACKEND_UNAVAILABLE','Only Native and Audio entries can be bundled',{stageId:stage.id});
    try {
      const result = await esbuild.build({ stdin: { contents: source, resolveDir: root, sourcefile: `${stage.id}.entry.ts` },
        ...(preparedPlugins.stageIds.includes(stage.id)?{outdir:dirname(outfile),entryNames:stage.id,chunkNames:'chunks/[name]-[hash]',splitting:true}:{outfile}), bundle: true, platform: 'browser', format: stage.engine==='audio'?'iife':'esm',...(stage.engine==='audio'?{globalName:'__fw_audio_module'}:{}), target: 'es2022',
        jsx: 'automatic', jsxImportSource: '@frameweave/engine', alias, loader, sourcemap: 'inline',
        metafile: true, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
        plugins:[bound.get(stage.id)?.plugin??managed.plugin(),svgPlugin],
        tsconfig: join(engineRoot, 'tsconfig.json'),nodePaths:[join(engineRoot,'node_modules')],
      });
      if(preparedPlugins.stageIds.includes(stage.id))await assertPluginBundleInputs(Object.keys(result.metafile!.inputs),preparedPlugins.roots,engineRoot,dir,resolve(root,`${stage.id}.entry.ts`));
      for(const file of Object.keys(result.metafile!.inputs))if(!file.endsWith(`${stage.id}.entry.ts`)&&!file.startsWith('frameweave-managed:')){const path=resolve(file);sourceFiles.add(path);checkRuntimeFile(path);}
      for (const path of Object.keys(result.metafile!.outputs)) {
        const abs = resolve(path);
        if (abs !== outfile) assets[relative(dir, abs).replaceAll('\\', '/')] = abs;
      }
      stageBundles[bundleKeys.get(stage.id)!] = relative(dir, outfile).replaceAll('\\', '/');
    } catch (error) {
      if(error instanceof EngineError)throw error;
      const e = buildError(error);
      throw new EngineError(e.code, `Stage ${stage.id}: ${e.message}`, { ...e, stageId: stage.id });
    }
  }
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  checkpoint('compile.stage-bundle');
  const digest = createHash('sha256').update(await readFile(manifestFile));
  for (const path of [...Object.values(stageBundles).map(p => join(dir, p)), ...Object.values(assets)].sort())for await(const chunk of createReadStream(path))digest.update(chunk);
  const built: BuiltProject = { dir, manifest, stageBundles, assets, hash: digest.digest('hex') };
  await writeFile(join(dir, 'build.json'), JSON.stringify(built, null, 2));
  await writeFile(join(dir,'sources.json'),JSON.stringify({entry,files:[...sourceFiles],manifest:sourceManifest,pluginRoots:preparedPlugins.roots},null,2));
  checkpoint('compile.seal');
  return built;
}
