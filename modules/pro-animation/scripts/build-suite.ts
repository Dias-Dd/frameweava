import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import type {PackageBindings,PackageManifest} from '../../../src/packages/manifest.ts';
import {buildNativeAnimationPackage} from './build-native-package.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const native=join(root,'modules/pro-animation/native-sdk');
const groups=[
  {id:'frameweave.motion',label:'Motion and Timing',prefix:'motion',sources:[
    'keyframe-control','motion-control','native-feedback-time','native-motion-time',
    'native-time','property-keyframes','temporal-controls',
  ]},
  {id:'frameweave.vector',label:'Vector Paths and Geometry',prefix:'vector',sources:[
    'curve-geometry','extrusion','path-authoring','path-controls','smart-path',
    'stroke-animation','stroke-motion','path-operations.ts',
  ]},
  {id:'frameweave.typography',label:'Typography and Text Animation',prefix:'typography',sources:[
    'font-execution','live-text','opentype','paragraph-composition','path-text-motion','path-text',
    'text-animation','text-controls','text-layout','text-styling','typography','font-shaping.ts','text-itemizer.ts',
  ]},
  {id:'frameweave.transitions',label:'Transitions',prefix:'transition',sources:['native-transitions']},
] as const;
const adjacent=[
  {id:'native-image-effects',directory:'native-image-effects',prefix:'image'},
  {id:'native-2d',directory:'native-2d',prefix:'drawing'},
  {id:'spatial-creation',directory:'spatial-creation',prefix:'spatial'},
] as const;

function manifest(id:string,version:string,name:string,description:string):PackageManifest{
  return {
    schemaVersion:1,apiVersion:1,id,version,name,description,
    source:{kind:'local',authority:'frameweave.pro'},compatible:'0.1.0',platforms:['web'],
    capabilities:[],permissions:{filesystem:false,network:false,process:false},
    entry:'main',modules:{main:{format:'javascript',path:'./public.ts'}},
  };
}

/** Preserve the existing Native public contract while giving each domain its own R1 identity. */
async function buildCapabilities(catalog:string){
  const text=await readFile(join(native,'public.ts'),'utf8');
  const source=ts.createSourceFile('public.ts',text,ts.ScriptTarget.Latest,true);
  const exports=new Map<string,string[]>(groups.map(group=>[group.id,[]]));
  for(const statement of source.statements){
    if(!ts.isExportDeclaration(statement)||!statement.moduleSpecifier||!ts.isStringLiteral(statement.moduleSpecifier))
      throw Error('Expected an explicit Native animation export');
    const domain=statement.moduleSpecifier.text.replace(/^\.\.\/src\//,'').split('/')[0];
    const group=groups.find(group=>(group.sources as readonly string[]).includes(domain));
    if(!group)throw Error(`Assign Native animation domain ${domain} to a shared capability`);
    let declaration=statement.getText(source);
    if(group.id==='frameweave.transitions')
      declaration=declaration.replace(statement.moduleSpecifier.getText(source),'"../../creation-capabilities/transitions.ts"');
    exports.get(group.id)!.push(declaration);
  }
  await Promise.all(groups.map(group=>{
    const spec=manifest(group.id,'1.0.0',group.label,`Shared Native animation capability for ${group.label.toLowerCase()}.`);
    spec.capabilities=['native-gpu','wasm'];
    spec.modules.bindings={format:'javascript',path:'./bindings.ts'};
    spec.bindings={schemaVersion:2,engine:'native-gpu',module:'bindings',types:'./api.d.ts',initialize:'initialize',gpu:'required',gpuApi:'native-wgpu'};
    return buildNativeAnimationPackage(join(catalog,group.id),{
      manifest:spec,publicSource:exports.get(group.id)!.join('\n')+'\n',
    });
  }));
}

/** Emit a forwarding-only package. R1 resolves and initializes just the providers used by a Stage. */
export async function buildProAnimationSuite(catalog:string){
  await buildCapabilities(catalog);
  const providers=await Promise.all([
    ...groups.map(group=>({id:group.id,directory:group.id,prefix:group.prefix})),
    ...adjacent,
  ].map(async provider=>{
    const directory=join(catalog,provider.directory);
    const spec=JSON.parse(await readFile(join(directory,'frameweave.package.json'),'utf8')) as PackageManifest;
    if(spec.id!==provider.id||!spec.bindings)throw Error(`Unexpected capability package ${provider.id}`);
    return {...provider,spec,types:resolve(directory,spec.bindings.types)};
  }));
  const config=ts.readConfigFile(join(root,'tsconfig.json'),ts.sys.readFile);
  const options=ts.convertCompilerOptionsFromJson(config.config.compilerOptions,root).options;
  const program=ts.createProgram(providers.map(provider=>provider.types),options);
  const checker=program.getTypeChecker();
  const forward:NonNullable<PackageBindings['forward']>=Object.create(null);
  const used=new Set<string>();
  const declarations:string[]=[];
  for(const provider of providers){
    const file=program.getSourceFile(provider.types);
    const module=file&&checker.getSymbolAtLocation(file);
    if(!module)throw Error(`Missing public declarations for ${provider.id}`);
    const exports=checker.getExportsOfModule(module).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    let count=0;
    for(const exported of exports){
      if(!/^[$A-Za-z_][$\w]*$/.test(exported.name)||exported.name==='default')continue;
      const symbol=exported.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exported):exported;
      const callable=!!(symbol.flags&ts.SymbolFlags.Value)&&checker.getTypeOfSymbol(symbol).getCallSignatures().length>0;
      const type=!!(symbol.flags&ts.SymbolFlags.Type);
      if(!callable&&!type)continue;
      const name=used.has(exported.name)?provider.prefix+exported.name[0].toUpperCase()+exported.name.slice(1):exported.name;
      if(used.has(name))throw Error(`Resolve ambiguous suite export ${name}`);
      used.add(name);
      declarations.push(`export ${callable?'':'type '}{${exported.name}${name===exported.name?'':' as '+name}} from ${JSON.stringify(provider.id)};`);
      if(callable){forward[name]={dependency:provider.id,name:exported.name};count++;}
    }
    if(!count)throw Error(`No callable public exports in ${provider.id}`);
  }
  const suite=manifest('pro-animation','1.1.0','Pro Animation','Animation, timing, transitions, vector paths, typography, image effects, and 2D/3D creation for Native Stages.');
  suite.tags=['animation','motion graphics','transitions','typography','compositing','2D','3D'];
  suite.dependencies=Object.fromEntries(providers.map(provider=>[provider.id,provider.spec.version]));
  suite.bindings={schemaVersion:2,engine:'native-gpu',module:'main',types:'./api.d.ts',forward};
  const directory=join(catalog,suite.id);
  await mkdir(directory);
  await writeFile(join(directory,'public.ts'),'export {};\n');
  await writeFile(join(directory,'api.d.ts'),declarations.join('\n')+'\n');
  await writeFile(join(directory,'frameweave.package.json'),JSON.stringify(suite)+'\n');
  await copyFile(join(root,'LICENSE'),join(directory,'LICENSE'));
  return {directory,dependencies:suite.dependencies,callables:Object.keys(forward).length};
}
