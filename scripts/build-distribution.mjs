import ts from 'typescript';
import {readFile,writeFile,mkdir,readdir,cp,rm} from 'node:fs/promises';
import {dirname,join,relative,resolve,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=join(root,'dist');
// This fixed build directory is the only directory this script replaces.
if(dirname(out)!==root||relative(root,out)!=='dist')throw Error('Invalid distribution directory');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
// npm does not retain these source-control/packaging rules in the tarball.
// Exclude them before copying and sealing; every actual release file stays verified.
const npmRuleFile=name=>name==='.gitignore'||name==='.npmignore'||name==='.npmrc';
async function files(dir){const list=[];for(const e of await readdir(dir,{withFileTypes:true})){if(npmRuleFile(e.name)||['node_modules','tests','validation','.frameweave','target'].includes(e.name))continue;if(e.isSymbolicLink())throw Error(`Distribution rejects symlink: ${join(dir,e.name)}`);if(e.isDirectory())list.push(...await files(join(dir,e.name)));else list.push(join(dir,e.name));}return list.sort();}
const slash=s=>s.split(sep).join('/');
// Native media is the CLI default. Ship an explicitly built production binary;
// never download a compiler or silently depend on a developer's target folder.
const nativeDir=join(root,'.frameweave/native-target/release'),nativeReceipt=JSON.parse(await readFile(join(nativeDir,'native-build.json'),'utf8'));
if(nativeReceipt.features?.length||nativeReceipt.profile!=='release')throw Error('Distribution requires a release native backend without diagnostics');
for(const [file,hash]of Object.entries(nativeReceipt.inputHashes))if(createHash('sha256').update(await readFile(join(root,'modules/native-gpu',file))).digest('hex')!==hash)throw Error('Stale native backend; rebuild after changing '+file);
const nativeName='frameweave-native-gpu'+(process.platform==='win32'?'.exe':''),nativeFile=join(nativeDir,nativeName);
if(createHash('sha256').update(await readFile(nativeFile)).digest('hex')!==nativeReceipt.executable.sha256)throw Error('Native backend build receipt mismatch');
const nativeOut=join(out,'native-bin',process.platform+'-'+process.arch);await mkdir(nativeOut,{recursive:true});
const smFile=resolve(process.env.FRAMEWEAVE_SPIDERMONKEY??join(root,'.frameweave/spidermonkey-target/debug/frameweave-spidermonkey-host.exe'));
const smReceipt=JSON.parse(await readFile(join(dirname(smFile),'spidermonkey-build.json'),'utf8'));
if(createHash('sha256').update(await readFile(smFile)).digest('hex')!==smReceipt.executable?.sha256)throw Error('SpiderMonkey binary receipt mismatch');
for(const [file,hash]of Object.entries(smReceipt.inputs??{}))if(createHash('sha256').update(await readFile(join(root,'modules/spidermonkey-host',file))).digest('hex')!==hash)throw Error('Stale SpiderMonkey host: '+file);
await cp(smFile,join(nativeOut,'frameweave-spidermonkey-host.exe'));await cp(join(dirname(smFile),'spidermonkey-build.json'),join(nativeOut,'spidermonkey-build.json'));
await cp(nativeFile,join(nativeOut,nativeName));await cp(join(nativeDir,'native-build.json'),join(nativeOut,'native-build.json'));
const roots=['src','modules','plugins/builtin','examples/analysis','prototypes/analysis-job-mvp','prototypes/performance-advanced-effects'];
const outputFor=file=>join(out,relative(root,file).replace(/^src[\\/]/,'lib/').replace(/^modules[\\/]/,'lib-modules/').replace(/^plugins[\\/]/,'lib-plugins/').replace(/^examples[\\/]/,'lib-examples/').replace(/\.tsx?$/,'.js'));
for(const folder of roots){
  for(const file of await files(join(root,folder))){
    if(folder==='prototypes/performance-advanced-effects'&&basename(file)!=='recipe.ts')continue;
    if(slash(relative(root,file))==='modules/shared-state/node.ts')continue; // Historical unsealed test helper is not a second published Session.
    if(folder==='prototypes/analysis-job-mvp'&&(dirname(file)!==join(root,folder)||! /\.(ts|mjs|json)$/.test(file)))continue;
    if(file.endsWith(`${sep}package-lock.json`))continue;
    if(file.includes(`${sep}tests${sep}`)||file.endsWith('.test.ts'))continue;
    const target=outputFor(file);await mkdir(dirname(target),{recursive:true});
    if(/\.d\.ts$/.test(file))continue;
    if(! /\.tsx?$/.test(file)){if(!file.endsWith('.md'))await cp(file,target);continue;}
    // Unbundled ESM keeps import.meta.url resource roots and lazy command boundaries intact.
    const remap=context=>node=>{
      const specifier=n=>{
        if(ts.isConditionalExpression(n))return context.factory.updateConditionalExpression(n,n.condition,n.questionToken,specifier(n.whenTrue),n.colonToken,specifier(n.whenFalse));
        if(!ts.isStringLiteral(n)||!n.text.startsWith('.')||! /\.tsx?$/.test(n.text))return n;
        const source=resolve(dirname(file),n.text);
        if(!roots.some(folder=>source.startsWith(join(root,folder)+sep)))return n;
        let ref=slash(relative(dirname(target),outputFor(source)));if(!ref.startsWith('.'))ref='./'+ref;
        return context.factory.createStringLiteral(ref);
      };
      const visit=n=>{
        if(ts.isImportDeclaration(n))return context.factory.updateImportDeclaration(n,n.modifiers,n.importClause,specifier(n.moduleSpecifier),ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text.endsWith('.json')?context.factory.createImportAttributes([context.factory.createImportAttribute(context.factory.createIdentifier('type'),context.factory.createStringLiteral('json'))]):n.attributes);
        if(ts.isExportDeclaration(n)&&n.moduleSpecifier)return context.factory.updateExportDeclaration(n,n.modifiers,n.isTypeOnly,n.exportClause,specifier(n.moduleSpecifier),n.attributes);
        if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments.length)return context.factory.updateCallExpression(n,n.expression,n.typeArguments,[specifier(n.arguments[0]),...n.arguments.slice(1)]);
        if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='URL'&&n.arguments?.length)return context.factory.updateNewExpression(n,n.expression,n.typeArguments,[specifier(n.arguments[0]),...n.arguments.slice(1)]);
        return ts.visitEachChild(n,visit,context);
      };return ts.visitNode(node,visit);
    };
    const result=ts.transpileModule(await readFile(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,jsxImportSource:'@frameweave/engine',verbatimModuleSyntax:true},transformers:{before:[remap]}});
    await writeFile(target,result.outputText);
  }
}
// Sources are runtime compiler/typechecker inputs and the existing SDK pin authority.
for(const folder of ['src','modules','plugins/builtin','licenses'])await cp(join(root,folder),join(out,folder),{recursive:true,filter:source=>slash(relative(root,source))!=='modules/shared-state/node.ts'&&!npmRuleFile(basename(source))&&!['tests','validation','node_modules','target'].includes(basename(source))});
await cp(join(root,'prototypes/performance-advanced-effects/recipe.ts'),join(out,'prototypes/performance-advanced-effects/recipe.ts'));
for(const file of ['package.json','tsconfig.json','LICENSE','NOTICE'])await cp(join(root,file),join(out,file));
// npm excludes package-lock.json; its standard publishable counterpart also pins install dependencies.
await cp(join(root,'package-lock.json'),join(out,'npm-shrinkwrap.json'));
for(const file of ['examples/analysis/brightness-task.ts','bin/frameweave.mjs','docs/CLI_DISTRIBUTION.md','docs/ACL_1.md','docs/authoring/AGENTS.md']){await mkdir(dirname(join(out,file)),{recursive:true});await cp(join(root,file),join(out,file));}
for(const folder of ['tools/professional-media','examples/creation'])await cp(join(root,folder),join(out,folder),{recursive:true});
for(const file of ['PROFESSIONAL_MEDIA_ENGINE.md','PROFESSIONAL_MEDIA_VALIDATION.md','PME_AUDIO_STAGE_CONTRACT.md','CREATION_AUDIO.md','NATIVE_ONLY_MIGRATION.md'])await cp(join(root,'docs',file),join(out,'docs',file));
// Optional face analysis stays explicitly unavailable without its separately provisioned model/runtime.
for(const file of (await readdir(join(root,'prototypes/analysis-job-mvp'))).filter(f=>f!=='package-lock.json'&&/\.(ts|mjs|json)$/.test(f))){await mkdir(join(out,'prototypes/analysis-job-mvp'),{recursive:true});await cp(join(root,'prototypes/analysis-job-mvp',file),join(out,'prototypes/analysis-job-mvp',file));}
// A read-only bundled local catalog. Normal R1 install still requires explicit
// source trust and snapshots/locks; installation never runs these build scripts.
const catalogBuild=await promisify(execFile)(process.execPath,['--import','tsx',join(root,'modules/pro-animation/scripts/build-catalog.ts')],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024,timeout:120000});
const official=JSON.parse(catalogBuild.stdout);
await cp(official.catalog,join(out,'catalog'),{recursive:true});
if(official.release)await cp(official.release.manifest,join(out,'frameweave.official-catalog.json'));
await cp(join(root,'examples/native-image-effects'),join(out,'examples/native-image-effects'),{recursive:true});
await cp(join(root,'examples/pro-animation'),join(out,'examples/pro-animation'),{recursive:true,filter:p=>!['.frameweave','.canvix','node_modules','.git','artifacts'].includes(basename(p))});
for(const file of ['MANAGED_TYPESCRIPT_MODULES.md'])await cp(join(root,'docs',file),join(out,'docs',file));
// Preserve the exact source package metadata used by SDK Runtime Pin.
const inventory={schemaVersion:1,algorithm:'sha256',files:{}};
for(const file of await files(out))inventory.files[slash(relative(out,file))]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(join(out,'distribution.json'),JSON.stringify(inventory,null,2)+'\n');
console.log(JSON.stringify({ok:true,directory:out,files:Object.keys(inventory.files).length,officialCatalogAsset:official.release?.asset}));
