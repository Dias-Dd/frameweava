import {engineVersion} from '../compiler/runtime-lock.ts';
import {discoverPackages,packageRef,type PackageRecord} from '../packages/manifest.ts';
import {catalogFunctionNames,officialCatalog} from '../packages/official-catalog.ts';
import type {FunctionMetadata} from '../packages/function-metadata.ts';
import {satisfies} from '../plugins/schema.ts';
import {rankSearchPage} from '../plugins/search.ts';
import type {CapabilitySearch} from './types.ts';
import {officialFunctions} from './official-functions.ts';
import {authoringEntrypoints} from './entrypoints.ts';
import {presetSearchText,sdkPresetCandidates} from './presets.ts';
import {catalogApiGroups,loadCatalogApi,type CatalogPackageApi} from './catalog-api.ts';
import {programLibraryDirectory,programPackages} from '../packages/program-library.ts';

interface FunctionProject {
  installed:PackageRecord[];catalog:PackageRecord[];
}
type SearchableFunction=FunctionMetadata|{name:string;level:'reference';description:string;example:null;tags?:undefined;imports?:undefined;presets?:undefined};

function functionCandidates(options:CapabilitySearch,project:FunctionProject,bundled:PackageRecord[],program:Awaited<ReturnType<typeof programPackages>>,api:CatalogPackageApi[]=[]){
  const filter=options.filters;
  if(filter?.kind&&filter.kind!=='function'||filter?.engine&&filter.engine!=='native-gpu'||filter?.input||filter?.output)return [];

  const official=new Map(bundled.map(record=>[packageRef(record.manifest),record.integrity]));
  const publicNames=catalogFunctionNames(bundled.map(record=>record.manifest));
  const declarations=new Map(api.map(entry=>[entry.reference,new Map(entry.callables.map(item=>[item.name,item]))]));
  const installedVersions=new Map<string,string[]>();
  for(const {manifest:{id,version}} of [...program.records,...project.installed])
    installedVersions.set(id,[...new Set([...installedVersions.get(id)??[],version])]);
  const programPins=new Map(program.records.map(record=>[packageRef(record.manifest),record.integrity]));
  const projectPins=new Map(project.installed.map(record=>[packageRef(record.manifest),record.integrity]));
  const packages=new Map<string,PackageRecord>();
  for(const record of [...bundled,...project.catalog,...program.records,...project.installed])packages.set(packageRef(record.manifest),record);
  return [...packages].flatMap(([reference,record])=>{
    const {manifest}=record;
    if(!manifest.bindings||!manifest.platforms.includes(options.platform??'web')||
      !satisfies(filter?.compatible??engineVersion,manifest.compatible))return [];
    const isOfficial=official.get(reference)===record.integrity;
    const approved=program.config.trustedSources.includes(`local:${manifest.source.authority}`);
    const versions=installedVersions.get(manifest.id)??[];
    const installation=programPins.get(reference)===record.integrity?'program' as const:
      projectPins.get(reference)===record.integrity?'project' as const:null;
    const integrity='sha256-'+record.integrity;
    const functions=new Map<string,SearchableFunction>();
    const details=declarations.get(reference);
    if(isOfficial){
      const names=publicNames.get(reference);
      for(const f of record.creationGuide??[])if(names?.has(f.name))functions.set(f.name,f);
      for(const f of officialFunctions[reference]??[]){
        const guide=record.creationGuide?.find(entry=>entry.name===f.name);
        functions.set(f.name,{...f,contract:f.contract??guide?.contract});
      }
      if(options.includeLowLevel)for(const name of new Set([...(names??[]),...(details?.keys()??[])])){
        if(!functions.has(name))functions.set(name,{name,level:'reference',description:details?.get(name)?.description??
          `${manifest.name} 的公开函数。此条目暂无独立用法示例。`,example:null});
      }
    }
    for(const f of record.functions??[])functions.set(f.name,f);
    return [...functions.values()].filter(f=>options.includeLowLevel||f.level==='authoring').map(({presets,...f})=>{
      const searchText=f.name+' '+f.description;
      const puppet=/puppet|纸偶|图钉/i.test(searchText)?'puppet 纸偶 图钉 傀儡':'';
      const filter=/blur|glow|bloom|sharpen|pixelate|chroma.?key|luma.?key|vignette|exposure|\blut\b|模糊|辉光|滤镜|调色|抠像|暗角|锐化/i.test(searchText)?
        '滤镜 filter 图像处理 image effect':'';
      const text=[f.name,f.name.replace(/([a-z0-9])([A-Z])/g,'$1 $2'),f.description,...f.tags??[],puppet,filter].join(' ');
      const imports=[...new Set([f.name,...f.imports??[]])];
      const item={...f,import:`import { ${imports.join(', ')} } from "${manifest.id}";`,signatures:isOfficial?details?.get(f.name)?.signatures:undefined,
        package:{reference,integrity,official:isOfficial,installed:installation!==null,installation,installedVersions:versions,backend:manifest.bindings!.engine},
        install:isOfficial&&installation===null?{
          executable:'frameweave' as const,
          args:['packages','install',reference,'--integrity',integrity,...approved?[]:['--trust',`local:${manifest.source.authority}`]],
          requiresSourceApproval:!approved,
        }:null,
      };
      const priority=f.name.toLowerCase()===options.query.trim().toLowerCase()?0:f.level==='authoring'?1:f.level==='low-level'?2:3;
      return {item,key:`${priority}:${reference}#${f.name}`,text,presets};
    });
  });
}

function packagePresetCandidates(candidates:ReturnType<typeof functionCandidates>){
  return candidates.flatMap(({item:owner,presets})=>(presets??[]).map(preset=>({
    item:{...preset,resultType:'preset' as const,callable:owner.name,module:owner.package.reference.split('@')[0],
      engine:owner.package.backend,import:owner.import,package:owner.package,install:owner.install},
    key:`${owner.package.reference}#${owner.name}:${preset.name}`,
    text:presetSearchText(preset,owner.name),
  })));
}

export async function functionSearchDocuments(project:FunctionProject){
  const root=await officialCatalog(),bundled=root?await discoverPackages([root]):[];
  const candidates=functionCandidates({query:'',includeLowLevel:true},project,bundled,await programPackages());
  return [...candidates.filter(c=>c.item.level!=='reference'),...packagePresetCandidates(candidates),...sdkPresetCandidates({query:''})].map(c=>c.text);
}

export async function searchFunctionPage(options:CapabilitySearch,project:FunctionProject,offline=true,withEntrypoints=true){
  const root=await officialCatalog(),bundled=root?await discoverPackages([root]):[];
  const [api,program]=await Promise.all([loadCatalogApi(root,bundled),programPackages()]);
  const candidates=functionCandidates(options,project,bundled,program,api),offset=options.offset??0;
  const rankingOptions={mode:options.mode,limit:options.limit,offset,offline,wholeShortWords:true};
  const {results,total}=await rankSearchPage(candidates,options.query,rankingOptions);
  const functions=results.map(({item,score,keywordScore,semanticScore})=>({resultType:'function' as const,...item,ranking:{score,keywordScore,semanticScore:semanticScore??null}}));
  const showRelated=withEntrypoints&&(!options.filters?.engine||options.filters.engine==='native-gpu');
  const kind=options.filters?.kind;
  const packageOwners=showRelated&&kind==='preset'?
    functionCandidates({...options,filters:{...options.filters,kind:'function'}},project,bundled,program,api):candidates;
  const presetCandidates=showRelated&&(!kind||kind==='preset')?
    [...sdkPresetCandidates(options),...packagePresetCandidates(packageOwners)]:[];
  type Preset=(typeof presetCandidates)[number]['item'];
  const presetPage=await rankSearchPage<Preset>(presetCandidates,options.query,rankingOptions);
  const presets=presetPage.results.map(({item,score,keywordScore,semanticScore})=>({...item,ranking:{score,keywordScore,semanticScore:semanticScore??null}}));
  const sdk=api.filter(entry=>entry.sdkImport);
  const showFunctions=showRelated&&kind!=='preset';
  const entrypoints=showFunctions?authoringEntrypoints(options.query).map(wrapper=>{
    const owner=sdk.find(entry=>entry.sdkImport&&wrapper.import.includes(`"${entry.sdkImport}"`));
    return {...wrapper,signatures:owner?.callables.find(callable=>callable.name===wrapper.name)?.signatures};
  }):[];
  const apiGroups=showFunctions?catalogApiGroups(options.query,api):[];
  const sdkCandidates=showFunctions?sdk.flatMap(entry=>entry.callables.flatMap(callable=>{
    const exact=options.query.trim().toLowerCase()===callable.name.toLowerCase();
    if(entrypoints.some(wrapper=>wrapper.name===callable.name))return [];
    const image=entry.sdkImport==='@frameweave/engine/image-effects'&&callable.signatures?.some(sig=>/^(ImageEffect|ImageSource)\b/.test(sig.returns));
    if(!options.includeLowLevel&&!exact&&!image)return [];
    const item={name:callable.name,description:callable.description,signatures:callable.signatures,
      import:`import { ${callable.name} } from "${entry.sdkImport}";`,module:entry.sdkImport};
    const name=callable.name.replace(/([a-z0-9])([A-Z])/g,'$1 $2');
    return [{item,key:`${exact?0:1}:${entry.sdkImport}:${callable.name}`,text:[callable.name,name,callable.description,image?'滤镜 filter 图像处理 image effect':''].join(' ')}];
  })):[];
  // SDK fallback is lexical. It must stay available with no embedding model installed.
  const sdkPage=await rankSearchPage(sdkCandidates,options.query,{mode:'keyword',limit:options.limit,offset,wholeShortWords:true});
  return {functions,entrypoints,apiGroups,presets,indexedPresets:presetCandidates.length,
    presetPage:{total:presetPage.total,offset,nextOffset:offset+presets.length<presetPage.total?offset+presets.length:null},
    sdkReferences:sdkPage.results.map(({item})=>item),
    sdkPage:{total:sdkPage.total,nextOffset:offset+sdkPage.results.length<sdkPage.total?offset+sdkPage.results.length:null},
    functionPage:{total,offset,nextOffset:offset+functions.length<total?offset+functions.length:null},
    officialPackageCount:bundled.length,indexedFunctions:candidates.length,typedCatalogPackages:api.length-sdk.length,
    typedSdkModules:sdk.length,indexedSdkExports:sdk.reduce((count,entry)=>count+entry.callables.length,0),programLibrary:programLibraryDirectory()};
}

export async function searchFunctions(options:CapabilitySearch,project:FunctionProject,offline=true){
  return (await searchFunctionPage(options,project,offline,false)).functions;
}
